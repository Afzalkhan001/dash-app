// Typed demo entries below are OFF (demo/config.ts DEMO_TYPED_SIGN_IN): the demo opens only from "Try a demo role".
// Vendor sign-in — the website's VendorAuth (dash.html ~30935), three views on one screen:
//   Log in    mobile number + password                 → POST /vendor/auth/login
//   Register  mobile number + email → WhatsApp code    → /vendor-otp → POST /vendor/auth/whatsapp-verify
//   Forgot    the same form and calls as Register, but a returning vendor then goes to
//             /vendor-password?reason=forgot to set a new password (POST /vendor/auth/set-password,
//             which takes any vendor session) instead of being signed straight in.
// Google sign-in is not offered in the app. The dev-only "skip verification" button appears
// only when the server reports VENDOR_OTP_BYPASS (/vendor/auth/mode), exactly like the website.
//
// Layout (Payno sign-in, docs/REFERENCE-COMPONENTS.md §3): the sign-in view has the centred logo and a
// big "Vendor sign-in" so nobody mistakes it for the staff screen, with one muted line under it. The
// round back button goes one step back: from sign-in to staff sign-in, from Register / Forgot to vendor
// sign-in (no second back link). Register and Forgot share the form; only the title and the icon in
// the frosted circle differ. Frosted PillFields with a leading icon (the password has the eye toggle),
// a "Forgot password?" link on the right under it, one full-width primary per view (Sign in /
// Send code); on the sign-in view "Register as a vendor" is an outlined frosted pill under a "New
// vendor?" divider, and Terms is the small link alone in the footer. Server errors show as a danger
// Banner above the button. Field hints are neutral, as the form serves both Register and Forgot.
//
// The in-app demo (development builds only, demo/config.ts) has two ways in here, neither reaching DASH:
//   Sign in            DEMO_PHONE with the password 123456 (or Demo@123)
//   Register / Forgot  DEMO_PHONE or afzal.demo@tamadamedia.com → /vendor-otp (no WhatsApp) → 123456
// Both open "Explore DASH as…" with only its Vendor portal section (features/demo/role-picker.tsx);
// picking an Afzal Vendor signs straight in to the portal. A note under the form says so.

import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, FlaskConical, KeyRound, LockKeyhole, Mail, MessageCircle, UserPlus } from 'lucide-react-native';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { digitsOnly, sendPhoneOtp } from '@/api/auth';
import { isApiError } from '@/api/client';
import { getVendorAuthMode, vendorPasswordLogin, vendorWhatsAppVerify } from '@/api/vendor';
import { AuthDivider, AuthNote, AuthShell, BackButton, PhoneLead, SIGN_IN_FAILED } from '@/auth/auth-shell';
import { useSession } from '@/auth/session';
import { DASH_URL } from '@/config';
import { DEMO_OTP, DEMO_PASSWORD, DEMO_PHONE, isDemoEmail, isDemoPhone } from '@/demo/config';
import { DemoRolePicker } from '@/features/demo/role-picker';
import { finishVendorVerification, signInVendor } from '@/features/vendor/auth-complete';
import { useVendorAuthFlow } from '@/features/vendor/auth-flow';
import { prettyPhone } from '@/features/vendor/format';
import { space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { Banner, Button, haptic, PillField, useLayout } from '@/ui';

type View_ = 'login' | 'register' | 'forgot';

export default function VendorSignIn() {
  const router = useRouter();
  const { compact } = useLayout();
  const lastPhone = useSession((s) => s.lastPhone);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [view, setView] = useState<View_>('login');
  const [phone, setPhone] = useState(typeof lastPhone === 'string' ? digitsOnly(lastPhone).slice(-10) : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpBypass, setOtpBypass] = useState(false);
  // Demo: the demo number and password were accepted; the vendor role picker is open.
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let alive = true;
    void getVendorAuthMode().then((r) => {
      if (alive && r && !isApiError(r)) setOtpBypass(!!r.otpBypass);
    });
    return () => {
      alive = false;
    };
  }, []);

  const digits = digitsOnly(phone);
  const full = `+91${digits}`;
  const phoneOk = digits.length === 10;
  // The demo account's number (any view) or email (Register / Forgot) — never true in a store build.
  const demoPhone = isDemoPhone(digits);
  const demoEntry = demoPhone || (view !== 'login' && isDemoEmail(email));

  const goTo = (v: View_) => {
    setView(v);
    setError(null);
  };

  const fail = (msg?: string | null) => {
    haptic.error();
    setError(msg || SIGN_IN_FAILED);
  };

  async function login() {
    if (busy) return;
    if (!phoneOk || !password) {
      haptic.warning();
      return setError('Enter your mobile number and password.');
    }
    if (demoPhone) {
      // The demo account: nothing goes to DASH; the right password opens the vendor role picker.
      if (password !== DEMO_OTP && password !== DEMO_PASSWORD) return fail(`Wrong password. In the demo the password is ${DEMO_OTP}.`);
      setError(null);
      haptic.select();
      return setPicking(true);
    }
    setBusy(true);
    setError(null);
    const r = await vendorPasswordLogin(full, password);
    if (isApiError(r) || !r?.token) {
      setBusy(false);
      return fail(isApiError(r) ? r.error : null);
    }
    await signInVendor(r.token, r.expiresAt ?? null, full);
  }

  async function sendCode() {
    if (busy) return;
    if (demoEntry) {
      // The demo account: no WhatsApp message; the code screen takes 123456 and opens the role picker.
      const phoneDemo = `+91${DEMO_PHONE}`;
      const flow = useVendorAuthFlow.getState();
      flow.reset();
      flow.set({ demo: true, phone: phoneDemo, email: email.trim(), challengeId: 'demo', sentTo: prettyPhone(phoneDemo) });
      router.push(view === 'forgot' ? { pathname: '/vendor-otp', params: { reason: 'forgot' } } : '/vendor-otp');
      return;
    }
    if (!phoneOk || !email.trim()) return;
    setBusy(true);
    setError(null);
    const r = await sendPhoneOtp(full);
    setBusy(false);
    if (isApiError(r) || !r?.challengeId) return fail(isApiError(r) ? r.error : null);
    const flow = useVendorAuthFlow.getState();
    flow.reset();
    flow.set({ phone: full, email: email.trim(), challengeId: r.challengeId, sentTo: prettyPhone(full) });
    router.push(view === 'forgot' ? { pathname: '/vendor-otp', params: { reason: 'forgot' } } : '/vendor-otp');
  }

  // Local-dev escape hatch (VENDOR_OTP_BYPASS) — never available against production.
  async function skipVerification() {
    if (busy) return;
    if (!phoneOk || !email.trim()) {
      haptic.warning();
      return setError('Enter your mobile number and email first.');
    }
    setBusy(true);
    setError(null);
    const r = await vendorWhatsAppVerify({ devBypass: true, contactNumber: full, email: email.trim() });
    if (isApiError(r) || !r?.token) {
      setBusy(false);
      return fail(isApiError(r) ? r.error : null);
    }
    if (view === 'forgot' && !r.isNew) {
      // Returning vendor who forgot the password: set a new one before going in.
      useVendorAuthFlow.getState().set({ pending: { token: r.token, expiresAt: r.expiresAt ?? null }, phone: full });
      setBusy(false);
      router.push({ pathname: '/vendor-password', params: { reason: 'forgot' } });
      return;
    }
    const next = await finishVendorVerification(r, full);
    setBusy(false);
    if (next === 'set-password') router.push('/vendor-password');
  }

  const backToStaff = () => (router.canGoBack() ? router.back() : router.replace('/login'));
  const backToVendorSignIn = () => {
    if (!busy) goTo('login');
  };
  const openTerms = () => void WebBrowser.openBrowserAsync(`${DASH_URL}/vendor/terms`).catch(() => {});

  // Return key on the number moves to the next field of the current view.
  const focusNext = () => (view === 'login' ? passwordRef.current : emailRef.current)?.focus();

  const phoneField = (
    <PillField
      icon={PhoneLead}
      accessibilityLabel="Mobile number"
      value={phone}
      onChangeText={(t) => {
        setPhone(digitsOnly(t).slice(-10));
        setError(null);
      }}
      placeholder="Mobile number"
      keyboardType="phone-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      maxLength={10}
      returnKeyType="next"
      submitBehavior="submit"
      onSubmitEditing={focusNext}
    />
  );

  const errorBanner = error ? <Banner tone="danger" message={error} /> : null;
  const demoNote = demoEntry ? (
    <AuthNote icon={FlaskConical}>
      {view === 'login' ? `Demo account · the password is ${DEMO_OTP}` : `Demo account · no WhatsApp message, the code is ${DEMO_OTP}`}
    </AuthNote>
  ) : null;

  return (
    <AuthShell
      stepKey={view}
      icon={view === 'login' ? undefined : view === 'forgot' ? KeyRound : UserPlus}
      title={view === 'login' ? 'Vendor sign-in' : view === 'forgot' ? 'Reset your password' : 'Register as a vendor'}
      subtitle={
        view === 'forgot'
          ? 'We’ll send a code on WhatsApp. Then set a new password.'
          : view === 'register'
            ? 'We’ll send a code on WhatsApp to verify your number.'
            : 'Sign in with your mobile number and the password you set for DASH.'
      }
      top={
        <BackButton
          label={view === 'login' ? 'Back to staff sign-in' : 'Back to vendor sign-in'}
          onPress={view === 'login' ? backToStaff : backToVendorSignIn}
        />
      }
      extra={
        view === 'login' ? (
          <>
            <AuthDivider label="New vendor?" />
            {/* No icon on the narrowest phones with large text, so the label never truncates. */}
            <Button
              variant="ghost"
              title="Register as a vendor"
              icon={compact ? undefined : <UserPlus />}
              onPress={() => goTo('register')}
              disabled={busy}
            />
          </>
        ) : undefined
      }
      footer={<Button variant="text" size="md" title="Terms & Conditions" icon={<ExternalLink />} onPress={openTerms} style={{ alignSelf: 'center' }} />}>
      {view === 'login' ? (
        <>
          {phoneField}
          <View style={styles.passwordBlock}>
            <PillField
              ref={passwordRef}
              icon={LockKeyhole}
              accessibilityLabel="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={login}
            />
            {/* Payno "Forgot Password": a brand link on the right, close under the field. */}
            <Button
              variant="text"
              size="md"
              title="Forgot password?"
              onPress={() => goTo('forgot')}
              disabled={busy}
              style={styles.forgot}
              accessibilityHint="Verify your number on WhatsApp, then set a new password"
            />
          </View>
          {demoNote}
          {errorBanner}
          <Button title="Sign in" onPress={login} loading={busy} disabled={!phoneOk || !password} />
        </>
      ) : (
        <>
          {phoneField}
          <PillField
            ref={emailRef}
            icon={Mail}
            accessibilityLabel="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={sendCode}
            hint="The email for your vendor account."
          />
          {demoNote}
          {errorBanner}
          <Button title="Send code" icon={<MessageCircle />} onPress={sendCode} loading={busy} disabled={!demoEntry && (!phoneOk || !email.trim())} />
          {otpBypass ? <Button title="Skip verification (dev only)" variant="danger" size="sm" onPress={skipVerification} disabled={busy} /> : null}
        </>
      )}
      <DemoRolePicker visible={picking} onClose={() => setPicking(false)} scope="vendor" />
    </AuthShell>
  );
}

const styles = themedStyles(() => ({
  // The text button's 12 dp padding lines the link up with the pill's right edge; the block keeps the
  // link close under its field instead of a full form gap away.
  passwordBlock: { gap: 2 },
  forgot: { alignSelf: 'flex-end', marginRight: -space.xs },
}));
