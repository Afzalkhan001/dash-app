// Staff "Forgot password?" — the website's LoginForm forgot tab (dash.html:1896-1925, 2236-2262, 2303-2320),
// same calls, same order (docs/port/signin-push.md §1.1, §5.1). Public: no role gate (it runs before
// sign-in, and every endpoint is in server.js PUBLIC_API).
//   email   the work email → POST /auth/forgot-password/lookup → "•••••1234" (404 / 400 shown as sent)
//   phone   the FULL number on the profile (security finding C3: the server only reveals the last 4)
//           → POST /auth/phone/send-otp (a WhatsApp code to what was typed) → /otp, purpose 'forgot'
//   (otp)   the code screen verifies it and hands back the proof (auth/flow.ts forgotProof); nobody is
//           signed in. Back here, the proof moves this screen on to:
//   reset   new password + confirm (at least 4 characters, must match, as on the website), then a
//           ConfirmSheet + SwipeToConfirm, because the reset overwrites the password at once and DASH
//           emails and WhatsApps the person → POST /auth/forgot-password/reset
//   done    a SuccessSheet; "Sign in" goes back to email sign-in with the email filled in.
// The proof lasts 10 minutes: a 401 (expired, or the server restarted) offers "Send a new code", and a
// "does not match" offers "Change the number" (both go back to the number step).
//
// Optional param: /forgot?email=… fills the email in (email sign-in passes what was typed there).
// Layout as the other sign-in steps (Payno, auth/auth-shell.tsx): the step's icon in a frosted circle,
// title and one muted line, one PillField (or one pair), one full-width primary, server errors as a
// danger Banner right above it, field errors inline under their field.
// The demo account (dev and preview builds, demo/auth-extras.ts): afzal.demo@tamadamedia.com →
// 8328617610 → 123456 → any password of 4+ characters; nothing is sent or stored, Demo@123 stays.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlaskConical, KeyRound, LockKeyhole, Mail, MessageCircle, RotateCw, Smartphone } from 'lucide-react-native';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { digitsOnly, sendPhoneOtp } from '@/api/auth';
import { isApiError } from '@/api/client';
import { forgotLookup, forgotReset } from '@/api/signin';
import { AuthNote, AuthShell, BackButton, PhoneLead } from '@/auth/auth-shell';
import { useAuthFlow } from '@/auth/flow';
import { DEMO_OTP, DEMO_PASSWORD, demoForgotPhone, isDemoForgotEmail } from '@/demo/auth-extras';
import { DEMO_EMAIL, DEMO_ENABLED } from '@/demo/config';
import { isValidEmail, lastFour, maskedNumber, MIN_PASSWORD, PASSWORDS_DIFFER, prettyPhone, SOMETHING_WENT_WRONG } from '@/features/signin/rules';
import { Banner, Button, ConfirmSheet, haptic, PillField, shouldStack, SuccessSheet, SummaryCard, Text, useLayout } from '@/ui';

type Step = 'email' | 'phone' | 'reset';

const COPY = {
  email: {
    icon: KeyRound,
    title: 'Reset your password',
    subtitle: 'We’ll send a code on WhatsApp to the number on your profile.',
  },
  phone: {
    icon: Smartphone,
    title: 'Confirm your number',
    subtitle: 'Type the full mobile number on your DASH profile. The code goes to it.',
  },
  reset: {
    icon: LockKeyhole,
    title: 'Set a new password',
    subtitle: 'Then sign in with your work email and this password.',
  },
} as const;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export default function ForgotPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const flow = useAuthFlow();
  // A narrow phone (or large text) gets the short swipe label, so it never truncates.
  const shortSwipe = shouldStack(useLayout(), { below: 'narrow' });
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(() => str(params.email) || flow.forgotEmail);
  const [phone, setPhone] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pw1Error, setPw1Error] = useState<string | null>(null);
  const [pw2Error, setPw2Error] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The server refused the proof (expired, or the server restarted): offer a new code. Or the
  // verified number is not the one on file: offer to change it. Both go back to the number step.
  const [retry, setRetry] = useState<'code' | 'number' | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  // The code screen hands the proof back through the flow: with it, the number step becomes the
  // password step (back from there drops the proof).
  const shown: Step = step === 'phone' && flow.forgotProof ? 'reset' : step;
  const demo = flow.forgotDemo && isDemoForgotEmail(flow.forgotEmail);
  const last4 = lastFour(flow.forgotMasked);
  const copy = COPY[shown];

  function fail(message?: string | null) {
    haptic.error();
    setError(message || SOMETHING_WENT_WRONG);
  }

  function clearErrors() {
    setError(null);
    setRetry(null);
    setPhoneError(null);
    setPw1Error(null);
    setPw2Error(null);
  }

  // ── email → lookup ──
  async function lookup() {
    if (busy) return;
    clearErrors();
    if (!isValidEmail(email)) return fail('Enter a valid email address.');
    setBusy(true);
    const r = await forgotLookup(email);
    setBusy(false);
    if (!r || isApiError(r)) return fail(isApiError(r) ? r.error : null);
    flow.set({
      forgotEmail: email.trim(),
      forgotMasked: str(r.masked),
      forgotProof: null,
      forgotDemo: isDemoForgotEmail(email),
    });
    setPhone('');
    setStep('phone');
  }

  // ── phone → WhatsApp code ──
  const digits = digitsOnly(phone);
  async function sendCode() {
    if (busy) return;
    clearErrors();
    if (digits.length < 10) return setPhoneError('Enter the full mobile number registered on your DASH profile.');
    // The server only says so after the code; saying it now saves a WhatsApp message and a wait.
    if (last4 && digits.slice(-4) !== last4) {
      haptic.warning();
      return setPhoneError(`This number doesn’t end in ${last4}. Type the number on your profile.`);
    }
    const full = `+91${digits}`;
    if (demo) {
      const ok = demoForgotPhone(full);
      if (isApiError(ok)) return fail(ok.error);
      flow.set({
        purpose: 'forgot',
        phone: full,
        phoneChallengeId: 'demo',
        sentTo: prettyPhone(digits),
      });
      return router.push('/otp');
    }
    setBusy(true);
    const r = await sendPhoneOtp(full);
    setBusy(false);
    if (isApiError(r) || !r?.challengeId) return fail(isApiError(r) ? r.error : null);
    flow.set({
      purpose: 'forgot',
      phone: full,
      phoneChallengeId: r.challengeId,
      sentTo: prettyPhone(digits),
    });
    router.push('/otp');
  }

  // ── reset ──
  function review() {
    if (busy) return;
    clearErrors();
    if (!pw1 || pw1.length < MIN_PASSWORD) {
      haptic.warning();
      return setPw1Error(`New password must be at least ${MIN_PASSWORD} characters.`);
    }
    if (pw1 !== pw2) {
      haptic.warning();
      return setPw2Error(PASSWORDS_DIFFER);
    }
    setConfirmOpen(true);
  }

  async function save() {
    const proof = flow.forgotProof;
    if (saving || !proof) return;
    setSaving(true);
    const r = await forgotReset(flow.forgotEmail, flow.phone, pw1, proof);
    setSaving(false);
    setConfirmOpen(false);
    if (!r || isApiError(r)) {
      // 401: the proof is expired or unreadable, so a new code is needed. 400 "does not match": the
      // number typed is not the one on file (the last 4 matched, the rest did not).
      if (isApiError(r) && (r.status === 401 || /new code/i.test(r.error))) setRetry('code');
      else if (isApiError(r) && /does not match/i.test(r.error)) setRetry('number');
      return fail(isApiError(r) ? r.error : null);
    }
    haptic.success();
    setDoneOpen(true);
  }

  function newCode() {
    clearErrors();
    flow.set({ forgotProof: null });
    setStep('phone');
  }

  // Leaving this screen forgets the reset (the proof above all). On unmount, not before navigating:
  // clearing it while the screen animates out would flash the number step under the success sheet.
  useEffect(
    () => () => {
      const f = useAuthFlow.getState();
      f.set({
        forgotEmail: '',
        forgotMasked: '',
        forgotProof: null,
        forgotDemo: false,
        ...(f.purpose === 'forgot' ? { purpose: null, phone: '', phoneChallengeId: null, sentTo: '' } : {}),
      });
    },
    [],
  );

  // Back to email sign-in with the email filled in (the screen under this one, or a fresh one).
  function toSignIn() {
    const signInEmail = flow.forgotEmail || email.trim();
    setDoneOpen(false);
    router.dismissTo({
      pathname: '/email',
      params: { email: signInEmail, n: String(Date.now()) },
    });
  }

  function back() {
    if (busy || saving) return;
    clearErrors();
    if (shown === 'reset') return newCode();
    if (shown === 'phone') return setStep('email');
    if (router.canGoBack()) router.back();
    else router.replace('/email');
  }

  const errorBanner = error ? <Banner tone="danger" message={error} /> : null;

  return (
    <AuthShell
      stepKey={shown}
      icon={copy.icon}
      overline={shown === 'reset' ? 'Number verified' : undefined}
      title={copy.title}
      subtitle={copy.subtitle}
      top={<BackButton onPress={back} label={shown === 'email' ? 'Back to sign-in' : 'Back'} />}
      extra={
        shown === 'phone' ? (
          <Text variant="caption" muted align="center">
            No longer have that number? Ask HR or an IT Admin to update your profile.
          </Text>
        ) : undefined
      }>
      {shown === 'email' && (
        <>
          <PillField
            icon={Mail}
            accessibilityLabel="Work email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearErrors();
            }}
            placeholder="Work email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            returnKeyType="go"
            onSubmitEditing={lookup}
          />
          {isDemoForgotEmail(email) ? (
            <AuthNote icon={FlaskConical}>Demo account · nothing is sent or changed</AuthNote>
          ) : !email.trim() && DEMO_ENABLED ? (
            <AuthNote icon={FlaskConical}>{`Demo · try ${DEMO_EMAIL}`}</AuthNote>
          ) : null}
          {errorBanner}
          <Button title="Continue" onPress={lookup} loading={busy} disabled={!isValidEmail(email)} />
        </>
      )}

      {shown === 'phone' && (
        <>
          <PillField
            icon={PhoneLead}
            accessibilityLabel="Mobile number"
            value={phone}
            onChangeText={(t) => {
              setPhone(digitsOnly(t).slice(-10));
              clearErrors();
            }}
            placeholder="Mobile number"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={10}
            returnKeyType="go"
            onSubmitEditing={sendCode}
            error={phoneError}
            hint={last4 ? `It ends in ${last4}.` : 'The full number on your DASH profile.'}
          />
          {demo ? <AuthNote icon={FlaskConical}>{`Demo account · use 8328617610, the code is ${DEMO_OTP}`}</AuthNote> : null}
          {errorBanner}
          <Button title="Send code" icon={<MessageCircle />} onPress={sendCode} loading={busy} disabled={digits.length !== 10} />
        </>
      )}

      {shown === 'reset' && (
        <>
          <PillField
            icon={LockKeyhole}
            accessibilityLabel="New password"
            value={pw1}
            onChangeText={(t) => {
              setPw1(t);
              clearErrors();
            }}
            placeholder="New password"
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => confirmRef.current?.focus()}
            error={pw1Error}
            hint={`At least ${MIN_PASSWORD} characters.`}
          />
          <PillField
            ref={confirmRef}
            icon={LockKeyhole}
            accessibilityLabel="Confirm new password"
            value={pw2}
            onChangeText={(t) => {
              setPw2(t);
              clearErrors();
            }}
            placeholder="Type it again"
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={review}
            error={pw2Error}
          />
          {demo ? <AuthNote icon={FlaskConical}>{`Demo account · nothing is saved, the password stays ${DEMO_PASSWORD}`}</AuthNote> : null}
          {errorBanner}
          {retry === 'code' ? (
            <Button title="Send a new code" icon={<RotateCw />} onPress={newCode} />
          ) : retry === 'number' ? (
            <Button title="Change the number" icon={<Smartphone />} onPress={newCode} />
          ) : (
            <Button title="Save password" onPress={review} disabled={!pw1 || !pw2} />
          )}
        </>
      )}

      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Change your password?"
        subtitle="Your old password stops working at once."
        detailsTitle="Details"
        confirmLabel={shortSwipe ? 'Swipe to change' : 'Swipe to change password'}
        onConfirm={save}
        loading={saving}
        note={demo ? 'Demo: nothing is sent or saved.' : 'Phones already signed in stay signed in.'}>
        <SummaryCard
          rows={[
            { label: 'Account', value: flow.forgotEmail },
            { label: 'Verified number', value: maskedNumber(last4) },
            { label: 'We’ll tell you', value: 'By email and on WhatsApp' },
          ]}
          hideEmpty
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={doneOpen}
        onClose={toSignIn}
        title="Password changed"
        subtitle={
          demo
            ? `Demo: nothing was sent, and the password is still ${DEMO_PASSWORD}.`
            : 'We’ve also sent you an email and a WhatsApp about it. Sign in with the new password.'
        }
        primaryLabel="Sign in"
        onPrimary={toSignIn}
      />
    </AuthShell>
  );
}
