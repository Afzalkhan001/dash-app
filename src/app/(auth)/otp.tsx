// One code screen for every sign-in path (see auth/flow.ts):
//   mobile          WhatsApp code → proofToken → /auth/mobile
//   password-phone  WhatsApp code → proofToken → /auth/login/verify-otp { idToken }
//   password-email  email code → /auth/login/verify-otp { code }
//   demo            the in-app demo (dev builds only): 123456 → the "Explore DASH as…" role picker
//                   (features/demo/role-picker.tsx), which signs in as the chosen Afzal persona
//   forgot          forgot password ((auth)/forgot.tsx): WhatsApp code → proofToken, stored in the flow
//                   (forgotProof), then back to the forgot screen to set the new password. Nobody is
//                   signed in here. The demo account (forgotDemo) takes 123456 and sends nothing.
// Auto-submits on the 6th digit; resend has the same 30-second cooldown as the website.
// Layout (Payno "Verify OTP", docs/REFERENCE-COMPONENTS.md §3): the round back button, the channel's
// icon in a frosted circle, "Verify it’s you" and one muted line with the masked number ("We sent a
// 6-digit code to +91 ••••• 43210 on WhatsApp"), the six OtpBoxes, an error Banner, one "Sign in"
// primary and "↻ Resend code" (a countdown in the same slot first, so nothing jumps). The digits are
// typed on the NumericKeypad pinned to the bottom on the deep wash; the system keyboard stays down,
// and tapping the boxes still opens it for paste / autofill. Only the demo account adds a note: its code.
// After a failure "Sign in" always does something: a rejected code clears the boxes for a retype,
// and a failed step after a good WhatsApp code retries with the stored proof (same calls as before).
// A good code for a number no staff account uses (/auth/mobile 404) is usually a vendor on the wrong
// screen: the Banner says so in one line and offers the two ways on (vendor sign-in, email sign-in).

import { useRouter } from 'expo-router';
import { FlaskConical, Mail, MessageCircle, Store, Users } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  isSessionPayload,
  sendLoginEmailOtp,
  sendPhoneOtp,
  signInWithPhoneProof,
  verifyLoginOtp,
  verifyPhoneOtp,
  type SessionPayload,
} from '@/api/auth';
import { type ApiResult, isApiError } from '@/api/client';
import { AuthNote, AuthShell, BackButton, maskSentTo, ResendCode, SIGN_IN_FAILED } from '@/auth/auth-shell';
import { useAuthFlow } from '@/auth/flow';
import { useSession } from '@/auth/session';
import { DEMO_RESET_PROOF } from '@/demo/auth-extras';
import { DEMO_OTP } from '@/demo/config';
import { DemoRolePicker, startStaffDemo, startVendorPersona } from '@/features/demo/role-picker';
import { space } from '@/theme/tokens';
import { Banner, Button, haptic, NumericKeypad, OtpBoxes, toast, useCodeKeypad } from '@/ui';

const RESEND_SECONDS = 30;
/** /auth/mobile 404: the WhatsApp code was right, but no staff account has this number. */
const NO_STAFF_ACCOUNT = 'No staff account uses this number.';

export default function OtpScreen() {
  const router = useRouter();
  const flow = useAuthFlow();
  const signIn = useSession((s) => s.signIn);
  const rememberPhone = useSession((s) => s.rememberPhone);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The code itself was refused: the boxes get a red rim until the next digit.
  const [wrongCode, setWrongCode] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const submitted = useRef('');
  // A verified WhatsApp code is single-use on the server; keep its proof so a failed next step
  // (e.g. no signal) can be retried with "Sign in" without asking for a new code.
  const proofRef = useRef<string | null>(null);
  // Demo: the code was right; the role picker is (or can be re-)opened to choose who to sign in as.
  const [demoOk, setDemoOk] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!flow.purpose) router.replace('/login');
  }, [flow.purpose, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const viaEmail = flow.purpose === 'password-email';
  const demo = flow.purpose === 'demo';
  const forgot = flow.purpose === 'forgot';
  // Any code that is answered on the phone: the demo sign-in, or the demo account's forgot password.
  const demoCode = demo || (forgot && flow.forgotDemo);

  function fail(message?: string | null) {
    haptic.error();
    setBusy(false);
    setError(message || SIGN_IN_FAILED);
  }

  // The code itself was rejected: empty the boxes so typing it again (or a new one) submits.
  function failCode(message?: string | null) {
    submitted.current = '';
    setCode('');
    setWrongCode(true);
    fail(message);
  }

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    if (submitted.current === value && !proofRef.current) return;
    submitted.current = value;
    setBusy(true);
    setError(null);
    setWrongCode(false);

    if (flow.purpose === 'demo') {
      if (value !== DEMO_OTP) return failCode(`That code is wrong. In the demo the code is ${DEMO_OTP}.`);
      if (flow.phone) await rememberPhone(flow.phone);
      // A role was already chosen on the login screen ("Try a demo role"): sign straight in as it.
      const chosen = flow.demoPersona;
      if (chosen) {
        await (chosen.kind === 'staff' ? startStaffDemo(chosen.id) : startVendorPersona(chosen.id));
        flow.reset();
        return;
      }
      setBusy(false);
      setDemoOk(true);
      setPicking(true);
      return;
    }

    if (flow.purpose === 'forgot') return verifyForgot(value);

    // The earlier screen always sets these; a missing one means the flow was lost and no retry here
    // can work, so go back to the start of sign-in (each start resets the flow).
    const needsLoginChallenge = viaEmail || flow.purpose === 'password-phone';
    if ((needsLoginChallenge && !flow.loginChallengeId) || (!viaEmail && !flow.phoneChallengeId)) {
      submitted.current = '';
      setBusy(false);
      haptic.error();
      toast.show('This code has expired. Please sign in again.', 'danger');
      router.dismissTo('/login');
      return;
    }

    let result: ApiResult<SessionPayload>;
    if (viaEmail) {
      result = await verifyLoginOtp(flow.loginChallengeId!, { code: value });
    } else {
      let proofToken = proofRef.current;
      if (!proofToken) {
        const proof = await verifyPhoneOtp(flow.phoneChallengeId!, value);
        if (isApiError(proof) || !proof?.proofToken) return failCode(isApiError(proof) ? proof.error : null);
        proofToken = proof.proofToken;
        proofRef.current = proofToken;
      }
      result =
        flow.purpose === 'mobile'
          ? await signInWithPhoneProof(proofToken)
          : await verifyLoginOtp(flow.loginChallengeId!, {
              idToken: proofToken,
            });
    }

    if (isApiError(result) || !isSessionPayload(result) || !result.token) {
      if (flow.purpose === 'mobile' && isApiError(result) && result.status === 404) return fail(NO_STAFF_ACCOUNT);
      const message = isApiError(result) ? result.error : null;
      // Email: this call checked the code, so clear it. WhatsApp: the code was fine; keep it and let
      // "Sign in" retry with the stored proof.
      return viaEmail ? failCode(message) : fail(message);
    }
    if (flow.phone) await rememberPhone(flow.phone);
    await signIn({
      kind: 'staff',
      token: result.token,
      tokenExpiresAt: result.tokenExpiresAt,
      user: result.user,
    });
    flow.reset();
    // The root layout's protected routes take over from here and show the app.
  }

  const leaveForgot = () => (router.canGoBack() ? router.back() : router.replace('/forgot'));

  // Forgot password: the code only proves the number. Hand the proof back to the forgot screen (the
  // code is single use; the proof lasts 10 minutes), and sign nobody in.
  async function verifyForgot(value: string) {
    let proofToken: string;
    if (flow.forgotDemo) {
      if (value !== DEMO_OTP) return failCode(`That code is wrong. In the demo the code is ${DEMO_OTP}.`);
      proofToken = DEMO_RESET_PROOF;
    } else {
      if (!flow.phoneChallengeId) {
        submitted.current = '';
        setBusy(false);
        haptic.error();
        toast.show('This code has expired. Please ask for a new one.', 'danger');
        return leaveForgot();
      }
      const proof = await verifyPhoneOtp(flow.phoneChallengeId, value);
      if (isApiError(proof) || !proof?.proofToken) return failCode(isApiError(proof) ? proof.error : null);
      proofToken = proof.proofToken;
    }
    flow.set({ forgotProof: proofToken });
    setBusy(false);
    haptic.success();
    leaveForgot();
  }

  async function resend() {
    if (cooldown > 0 || resending) return;
    setError(null);
    setWrongCode(false);
    setCode('');
    submitted.current = '';
    proofRef.current = null;
    if (demoCode) return setCooldown(RESEND_SECONDS);
    setResending(true);
    const r = viaEmail ? await sendLoginEmailOtp(flow.loginChallengeId!) : await sendPhoneOtp(flow.phone, flow.phoneChallengeId ?? undefined);
    setResending(false);
    if (isApiError(r)) return fail(r.error);
    if (r && typeof r === 'object' && 'challengeId' in r && r.challengeId) flow.set({ phoneChallengeId: r.challengeId });
    setCooldown(RESEND_SECONDS);
  }

  const sentTo = typeof flow.sentTo === 'string' ? maskSentTo(flow.sentTo.trim()) : '';

  // The number was verified on WhatsApp, so the vendor screen can start with it filled in.
  async function toVendor() {
    if (flow.phone) await rememberPhone(flow.phone);
    router.replace('/vendor');
  }

  const where = sentTo || (viaEmail ? 'your email' : 'your WhatsApp');

  // Typing (keypad or system keyboard) clears the last error; the 6th digit submits.
  const type = (v: string) => {
    setCode(v);
    setError(null);
    setWrongCode(false);
  };
  const keypad = useCodeKeypad(code, type, {
    onComplete: (v) => void verify(v),
  });

  return (
    <AuthShell
      icon={demoCode ? FlaskConical : viaEmail ? Mail : MessageCircle}
      title="Verify it’s you"
      subtitle={
        demoCode
          ? 'Enter the 6-digit code for the demo account.'
          : viaEmail || !sentTo
            ? `We sent a 6-digit code to ${where}.`
            : `We sent a 6-digit code to ${where} on WhatsApp.`
      }
      top={<BackButton onPress={() => router.back()} />}
      keypad={<NumericKeypad onKey={keypad.onKey} disabled={busy || demoOk} />}>
      {demo ? (
        <AuthNote icon={FlaskConical}>
          {demoOk ? 'Code accepted · choose which role to explore' : `Sample data only · the code is ${DEMO_OTP}`}
        </AuthNote>
      ) : null}
      {forgot && flow.forgotDemo ? <AuthNote icon={FlaskConical}>{`Demo account · no WhatsApp message, the code is ${DEMO_OTP}`}</AuthNote> : null}
      <OtpBoxes
        value={code}
        onChange={type}
        onComplete={(v) => void verify(v)}
        withKeypad
        error={wrongCode}
        accessibilityLabel={demoCode ? 'Demo code' : viaEmail ? 'Email code' : 'WhatsApp code'}
      />
      {error === NO_STAFF_ACCOUNT ? (
        <Banner
          tone="danger"
          message={error}
          action={
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              <Button title="Vendor? Sign in here" size="sm" variant="ghost" icon={<Store />} onPress={() => void toVendor()} />
              <Button title="Use email" size="sm" variant="ghost" icon={<Mail />} onPress={() => router.replace('/email')} />
            </View>
          }
        />
      ) : error ? (
        <Banner tone="danger" message={error} />
      ) : null}
      {demoOk ? (
        <Button title="Choose a role" icon={<Users />} onPress={() => setPicking(true)} />
      ) : (
        <Button title={forgot ? 'Verify' : 'Sign in'} onPress={() => verify(code)} loading={busy} disabled={code.length !== 6} />
      )}
      {/* Part of the form block, so the shell keeps it above the system keyboard when the boxes open it. */}
      <ResendCode seconds={cooldown} onPress={resend} loading={resending} disabled={busy} />
      {demo ? <DemoRolePicker visible={picking} onClose={() => setPicking(false)} onPicked={() => flow.reset()} /> : null}
    </AuthShell>
  );
}
