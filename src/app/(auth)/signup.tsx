// Staff sign-up — the website's LoginForm sign-up tab (dash.html:2062-2098, 2263-2302), same calls in
// the same order (docs/port/signin-push.md §1.2, §5.2). Public: no role gate (it runs before sign-in).
//   email     the work email → POST /auth/check-email
//               on the approved list: the name and role HR entered are shown on the next step
//               not on it: carry on anyway, exactly like the website (the server is the real gate and
//               a person added straight to a company has no list entry), with a warning Banner
//   password  password + confirm (at least 4 characters, must match) → POST /auth/signup. The server
//             reads only the email and password; name, role and company come from the approved list.
//             It returns no session, so:
//   done      a SuccessSheet "Account created". Continue signs in with the same email and password
//             (POST /auth/login) and hands the challenge to email sign-in at "Get a sign-in code" — the
//             server still asks for the second factor. × goes to email sign-in with the email filled in.
// "Already exists" (the website's test, api/signin.ts isAlreadyExists) offers "Sign in instead".
// No ConfirmSheet: creating your own account notifies nobody, and the button says what it does.
//
// Layout as the other sign-in steps (Payno, auth/auth-shell.tsx). The demo (dev and preview builds,
// demo/auth-extras.ts): afzal.newjoiner@tamadamedia.com signs up and Continue opens Afzal Employee;
// afzal.demo@tamadamedia.com shows "already exists"; afzal.notlisted@tamadamedia.com shows the warning,
// then the server's refusal.

import { useRouter } from 'expo-router';
import { FlaskConical, LockKeyhole, LogIn, Mail, UserPlus } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { isSessionPayload, passwordLogin } from '@/api/auth';
import { isApiError } from '@/api/client';
import { checkEmail, isAlreadyExists, signUp } from '@/api/signin';
import { AuthFooterLink, AuthNote, AuthShell, BackButton } from '@/auth/auth-shell';
import { useAuthFlow } from '@/auth/flow';
import { useSession } from '@/auth/session';
import { DEMO_SIGNUP_EMAIL, DEMO_UNLISTED_EMAIL, isDemoExtraEmail } from '@/demo/auth-extras';
import { DEMO_EMAIL, DEMO_ENABLED } from '@/demo/config';
import { startStaffDemo } from '@/features/demo/role-picker';
import { isValidEmail, MIN_PASSWORD, PASSWORDS_DIFFER, SIGNUP_FAILED, SOMETHING_WENT_WRONG } from '@/features/signin/rules';
import { ROLE_LABEL } from '@/lib/access';
import { Avatar, Banner, Button, haptic, ListCard, ListRow, PillField, SuccessSheet, toast } from '@/ui';

type Step = 'email' | 'password';
type Match = {
  email: string;
  name: string;
  role: string;
  tenantId: string | null;
  listed: boolean;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const roleLabel = (role: string) => ROLE_LABEL[role] ?? role.replace(/_/g, ' ');

/** A short note on the demo addresses, so each path can be tried. */
function demoNoteFor(email: string) {
  const e = email.trim().toLowerCase();
  if (e === DEMO_SIGNUP_EMAIL) return 'Demo · a new joiner on the list. Nothing is saved.';
  if (e === DEMO_EMAIL) return 'Demo · this person already has an account.';
  if (e === DEMO_UNLISTED_EMAIL) return 'Demo · this email is not on the list.';
  // Dev and preview builds: say which address to try, so the flow can be walked without a real invite.
  if (!e && DEMO_ENABLED) return `Demo · try ${DEMO_SIGNUP_EMAIL}`;
  return null;
}

export default function SignUp() {
  const router = useRouter();
  const flow = useAuthFlow();
  const signIn = useSession((s) => s.signIn);
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pw1Error, setPw1Error] = useState<string | null>(null);
  const [pw2Error, setPw2Error] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  const demo = !!match && isDemoExtraEmail(match.email);

  function clearErrors() {
    setError(null);
    setExists(false);
    setPw1Error(null);
    setPw2Error(null);
  }

  function fail(message?: string | null) {
    haptic.error();
    setError(message || SOMETHING_WENT_WRONG);
  }

  // Email sign-in with this email filled in: the screen under this one, or a fresh one.
  function toSignIn(extra?: Record<string, string>) {
    const signInEmail = match?.email || email.trim().toLowerCase();
    router.dismissTo({
      pathname: '/email',
      params: { email: signInEmail, n: String(Date.now()), ...extra },
    });
  }

  // ── email → check-email ──
  async function check() {
    if (busy) return;
    clearErrors();
    if (!isValidEmail(email)) return fail('Enter a valid email address.');
    setBusy(true);
    const r = await checkEmail(email);
    setBusy(false);
    if (!r || isApiError(r)) return fail(isApiError(r) ? r.error : 'Unable to connect to server. Please try again.');
    const lc = email.trim().toLowerCase();
    if (r.whitelisted) {
      setMatch({
        email: str(r.email) || lc,
        name: str(r.name),
        role: str(r.role) || 'employee',
        tenantId: r.tenantId ?? null,
        listed: true,
      });
    } else {
      // dash.html checkEmail: carry on with defaults; /auth/signup decides.
      setMatch({
        email: lc,
        name: lc.split('@')[0] ?? lc,
        role: 'employee',
        tenantId: null,
        listed: false,
      });
    }
    setPw1('');
    setPw2('');
    setStep('password');
  }

  // ── password → signup ──
  async function create() {
    if (busy || !match) return;
    clearErrors();
    if (!pw1 || pw1.length < MIN_PASSWORD) {
      haptic.warning();
      return setPw1Error(`Password must be at least ${MIN_PASSWORD} characters.`);
    }
    if (pw1 !== pw2) {
      haptic.warning();
      return setPw2Error(PASSWORDS_DIFFER);
    }
    setBusy(true);
    const r = await signUp(match, pw1);
    setBusy(false);
    if (r && !isApiError(r) && r.user) {
      haptic.success();
      return setDoneOpen(true);
    }
    const msg = isApiError(r) ? r.error : '';
    if (msg && isAlreadyExists(msg)) {
      setExists(true);
      return fail('An account with this email already exists.');
    }
    // server.js /auth/signup says "not whitelisted": say it in plain words.
    if (msg && msg.toLowerCase().includes('whitelisted')) return fail('This email is not on your company’s list. Ask HR or an admin to add it.');
    if (msg && msg.toLowerCase().includes('password')) return fail(`Password issue: ${msg}`);
    fail(msg || SIGNUP_FAILED);
  }

  // ── done → sign in with what was just set ──
  async function continueIn() {
    if (!match || busy) return;
    setDoneOpen(false);
    if (demo) {
      // The demo's new joiner opens DASH as Afzal Employee (nothing was stored).
      flow.reset();
      await startStaffDemo('employee');
      return;
    }
    setBusy(true);
    const r = await passwordLogin(match.email, pw1);
    setBusy(false);
    if (r && !isApiError(r) && 'otpRequired' in r && r.challengeId) {
      const channels = Array.isArray(r.channels) ? r.channels.filter((c) => !!c && typeof c === 'object') : [];
      flow.reset();
      flow.set({
        loginChallengeId: r.challengeId,
        channels,
        name: str(r.name),
      });
      return toSignIn({ resume: 'factor' });
    }
    if (r && isSessionPayload(r) && r.token) {
      // Only against a localhost dev server, which skips the second factor.
      return signIn({
        kind: 'staff',
        token: r.token,
        tokenExpiresAt: r.tokenExpiresAt,
        user: r.user,
      });
    }
    // More than one company, or the sign-in failed: finish on email sign-in with the email filled in.
    if (r && !isApiError(r) && 'chooseAccount' in r) toast.show('Sign in to pick your company.', 'info');
    else toast.show(isApiError(r) ? r.error : 'Account created. Please sign in.', isApiError(r) ? 'danger' : undefined);
    toSignIn();
  }

  function back() {
    if (busy) return;
    clearErrors();
    if (step === 'password') return setStep('email');
    if (router.canGoBack()) router.back();
    else router.replace('/email');
  }

  const errorBanner = error ? <Banner tone="danger" message={error} /> : null;
  const demoNote = demoNoteFor(step === 'email' ? email : (match?.email ?? ''));

  return (
    <AuthShell
      stepKey={step}
      icon={step === 'email' ? UserPlus : LockKeyhole}
      title={step === 'email' ? 'Create your account' : 'Set your password'}
      subtitle={step === 'email' ? 'Use the work email HR added for you.' : match?.email}
      top={<BackButton onPress={back} label={step === 'email' ? 'Back to sign-in' : 'Back'} />}
      footer={step === 'email' ? <AuthFooterLink prompt="Have an account?" label="Sign in" onPress={() => toSignIn()} disabled={busy} /> : undefined}
      extra={step === 'email' ? <AuthNote icon={UserPlus}>HR or an admin must add your email before you can sign up.</AuthNote> : undefined}>
      {step === 'email' && (
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
            onSubmitEditing={check}
          />
          {demoNote ? <AuthNote icon={FlaskConical}>{demoNote}</AuthNote> : null}
          {errorBanner}
          <Button title="Continue" onPress={check} loading={busy} disabled={!isValidEmail(email)} />
        </>
      )}

      {step === 'password' && match && (
        <>
          {match.listed ? (
            <ListCard>
              <ListRow
                left={<Avatar name={match.name || match.email} size={44} ring={false} />}
                title={match.name || match.email}
                numberOfLines={2}
                subtitle={roleLabel(match.role)}
              />
            </ListCard>
          ) : (
            <Banner tone="warning" message="We couldn’t find this email on your company’s list. You can still try. If it fails, ask HR to add you." />
          )}
          <PillField
            icon={LockKeyhole}
            accessibilityLabel="Password"
            value={pw1}
            onChangeText={(t) => {
              setPw1(t);
              clearErrors();
            }}
            placeholder="Password"
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
            accessibilityLabel="Confirm password"
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
            onSubmitEditing={create}
            error={pw2Error}
          />
          {demoNote ? <AuthNote icon={FlaskConical}>{demoNote}</AuthNote> : null}
          {errorBanner}
          {exists ? (
            <Button title="Sign in instead" icon={<LogIn />} onPress={() => toSignIn()} />
          ) : (
            <Button title="Create account" onPress={create} loading={busy} disabled={!pw1 || !pw2} />
          )}
        </>
      )}

      <SuccessSheet
        visible={doneOpen}
        onClose={() => {
          setDoneOpen(false);
          toSignIn();
        }}
        title="Account created"
        subtitle={demo ? 'Demo: nothing was saved. Continue opens DASH as Afzal Employee.' : 'Continue to sign in. We’ll send you a code to finish.'}
        primaryLabel="Continue"
        onPrimary={() => void continueIn()}
      />
    </AuthShell>
  );
}
