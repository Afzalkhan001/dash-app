// Email + password sign-in (server.js /api/auth/login). After the password the server always asks
// for a second factor: a WhatsApp code to the profile's mobile number, or an emailed code. As on
// the website, the WhatsApp route needs the person to type their full number, which the server
// matches against the profile (it only reveals a masked hint).
//
// Four short steps on one screen (credentials → company? → where to send the code → number), each
// fading in through the shell's stepKey. Payno sign-in: the first step has the centred logo, a big
// title and one muted line, two frosted PillFields (mail, lock with the eye toggle) and one full-width
// primary, with "Sign in with mobile number" as the outlined pill under an "Or" divider. The other
// steps show their icon in a frosted circle, and either one PillField with one primary, or one frosted
// card of choices (one tap target per row, a spinner on the row that is working).
// Server errors show as a danger Banner right above the main button, never as red text.
// The in-app demo (dev builds only, demo/config.ts): afzal.demo@tamadamedia.com with Demo@123 walks the
// same steps without the network — straight to choosing how to get the code (the
// WhatsApp step wants 8328617610), then 123456 and the "Explore DASH as…" role picker.
//
// The sign-in extras (signin domain, docs/port/signin-push.md §5): "Forgot password?" under the password
// opens /forgot with the typed email, and "New here? Create your account" under the "Or" divider opens
// /signup. Both come back here through router.dismissTo with params:
//   ?email=…            fill the email in (a new `n` each time, so coming back twice still applies it)
//   &resume=factor      sign-up already ran /auth/login with the new password and left the challenge
//                       in the flow (loginChallengeId, channels): start at "Get a sign-in code".

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, LockKeyhole, type LucideIcon, Mail, MessageCircle, ShieldCheck, Smartphone, UserPlus } from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { digitsOnly, isSessionPayload, type LoginChannel, passwordLogin, sendLoginEmailOtp, sendPhoneOtp } from '@/api/auth';
import { isApiError } from '@/api/client';
import { AuthDivider, AuthShell, BackButton, maskSentTo, PhoneLead, SIGN_IN_FAILED } from '@/auth/auth-shell';
import { useAuthFlow } from '@/auth/flow';
import { useSession } from '@/auth/session';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PHONE, isDemoEmail, isDemoPhone } from '@/demo/config';
import { GoogleButton } from '@/features/googlesignin/google-button';
import { canSignUp, canUseForgotPassword } from '@/features/signin/access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Banner, Button, haptic, IconBadge, isDarkScheme, ListCard, ListRow, PillField, useLayout } from '@/ui';

type Account = {
  accountId: string;
  companyName: string;
  name: string;
  role: string;
};
type Step = 'credentials' | 'account' | 'factor' | 'phone';

// The first step has no icon, so the shell shows the logo there (it is a way in, like the mobile screen).
const COPY: Record<Step, { title: string; subtitle: string; icon?: LucideIcon }> = {
  credentials: {
    title: 'Sign in with email',
    subtitle: 'Use the work email and password you use on the DASH website.',
  },
  account: {
    title: 'Pick your company',
    subtitle: 'Your email is linked to more than one company.',
    icon: Building2,
  },
  factor: {
    title: 'Get a sign-in code',
    subtitle: 'One more step. Where should we send it?',
    icon: ShieldCheck,
  },
  phone: {
    title: 'Confirm your number',
    subtitle: 'We’ll send the code on WhatsApp.',
    icon: Smartphone,
  },
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// The demo's answers to /auth/login: the email belongs to the one demo company (no "Pick your company"
// step — a second sample company would only open the same data), and the code can go to the demo
// number or the demo email.
const DEMO_CHANNELS: LoginChannel[] = [
  { id: 'mobile', label: 'Mobile', to: `+91 ••••• •${DEMO_PHONE.slice(-4)}` },
  {
    id: 'email',
    label: 'Email',
    to: `${DEMO_EMAIL.slice(0, 2)}•••${DEMO_EMAIL.slice(DEMO_EMAIL.indexOf('@'))}`,
  },
];

export default function EmailLogin() {
  const router = useRouter();
  const flow = useAuthFlow();
  const signIn = useSession((s) => s.signIn);
  const { compact } = useLayout();
  const params = useLocalSearchParams<{
    email?: string;
    n?: string;
    resume?: string;
  }>();
  // Sign-up hands over a live /auth/login challenge (see the header).
  const resumeFactor = params.resume === 'factor' && !!flow.loginChallengeId;
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [step, setStep] = useState<Step>(() => (resumeFactor ? 'factor' : 'credentials'));
  const [email, setEmail] = useState(() => str(params.email));
  const [password, setPassword] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [channels, setChannels] = useState<LoginChannel[]>(() => (resumeFactor ? flow.channels : []));
  const [challengeId, setChallengeId] = useState(() => (resumeFactor ? (flow.loginChallengeId ?? '') : ''));
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  // Which choice row is working (an account id, or 'email'), so only that row shows a spinner.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The demo credentials were accepted: the next steps are answered on the phone.
  const [demo, setDemo] = useState(false);

  // Back from forgot password or sign-up (router.dismissTo with new params): apply them once, during
  // render (React's "adjust state when a prop changes"), so there is no effect and no flash.
  const paramKey = `${params.email ?? ''}|${params.n ?? ''}|${params.resume ?? ''}`;
  const [seenParams, setSeenParams] = useState(paramKey);
  if (seenParams !== paramKey) {
    setSeenParams(paramKey);
    if (str(params.email)) setEmail(str(params.email));
    setPassword('');
    setError(null);
    setDemo(false);
    setPending(null);
    setBusy(false);
    if (resumeFactor) {
      setChallengeId(flow.loginChallengeId ?? '');
      setChannels(flow.channels);
      setStep('factor');
    } else {
      setStep('credentials');
    }
  }

  const toForgot = () =>
    router.push({
      pathname: '/forgot',
      params: email.trim() ? { email: email.trim() } : {},
    });
  const toSignup = () => router.push('/signup');

  function fail(message?: string | null) {
    haptic.error();
    setError(message || SIGN_IN_FAILED);
  }

  async function login(accountId?: string) {
    if (!email.trim() || !password || busy) return;
    if (isDemoEmail(email)) return demoLogin();
    setDemo(false);
    setBusy(true);
    setPending(accountId ?? null);
    setError(null);
    const r = await passwordLogin(email, password, accountId);
    setBusy(false);
    setPending(null);
    if (!r || typeof r !== 'object') return fail();
    if (isApiError(r)) return fail(r.error);
    if ('chooseAccount' in r) {
      const list = Array.isArray(r.accounts) ? r.accounts.filter((a) => !!a && typeof a === 'object' && !!str(a.accountId)) : [];
      if (!list.length) return fail('This email isn’t linked to a company account yet.');
      setAccounts(list);
      return setStep('account');
    }
    if (isSessionPayload(r) && r.token) {
      // Only happens against a localhost dev server, which skips OTP.
      return signIn({
        kind: 'staff',
        token: r.token,
        tokenExpiresAt: r.tokenExpiresAt,
        user: r.user,
      });
    }
    if ('otpRequired' in r) {
      const list = Array.isArray(r.channels) ? r.channels.filter((c) => !!c && typeof c === 'object') : [];
      setChallengeId(r.challengeId);
      setChannels(list);
      flow.reset();
      flow.set({
        loginChallengeId: r.challengeId,
        channels: list,
        name: r.name,
      });
      return setStep('factor');
    }
    fail();
  }

  function demoLogin() {
    setError(null);
    if (password !== DEMO_PASSWORD) return fail(`Wrong email or password. The demo password is ${DEMO_PASSWORD}.`);
    setDemo(true);
    setChallengeId('demo');
    setChannels(DEMO_CHANNELS);
    flow.reset();
    flow.set({ channels: DEMO_CHANNELS, name: 'Afzal' });
    setStep('factor');
  }

  async function viaEmail() {
    if (busy) return;
    if (demo) {
      flow.set({ purpose: 'demo', sentTo: str(DEMO_CHANNELS[1]?.to) });
      return router.push('/otp');
    }
    setBusy(true);
    setPending('email');
    setError(null);
    const r = await sendLoginEmailOtp(challengeId);
    setBusy(false);
    setPending(null);
    if (isApiError(r) || !r) return fail(isApiError(r) ? r.error : null);
    flow.set({ purpose: 'password-email', sentTo: str(r.sentTo) });
    router.push('/otp');
  }

  async function viaWhatsApp() {
    const d = digitsOnly(phone);
    if (d.length !== 10 || busy) return;
    setBusy(true);
    setError(null);
    const full = `+91${d}`;
    if (demo) {
      if (!isDemoPhone(d)) return fail('That number doesn’t match the one on your profile.');
      flow.set({
        purpose: 'demo',
        phone: full,
        sentTo: `+91 ${d.slice(0, 5)} ${d.slice(5)}`,
      });
      return router.push('/otp');
    }
    const r = await sendPhoneOtp(full);
    setBusy(false);
    if (isApiError(r) || !r?.challengeId) return fail(isApiError(r) ? r.error : null);
    flow.set({
      purpose: 'password-phone',
      phone: full,
      phoneChallengeId: r.challengeId,
      sentTo: `+91 ${d.slice(0, 5)} ${d.slice(5)}`,
    });
    router.push('/otp');
  }

  const back = () => {
    setError(null);
    if (step === 'phone') return setStep('factor');
    if (step === 'credentials') return router.back();
    setStep('credentials');
  };

  const toMobile = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  const mobile = channels.find((c) => c.id === 'mobile');
  const emailCh = channels.find((c) => c.id === 'email');
  const mobileTo = str(mobile?.to);
  const emailTo = str(emailCh?.to);
  const copy = COPY[step];
  const errorBanner = error ? <Banner tone="danger" message={error} /> : null;
  const rowSpinner = <ActivityIndicator color={palette.textMuted} />;

  return (
    <AuthShell
      stepKey={step}
      icon={copy.icon}
      title={copy.title}
      subtitle={copy.subtitle}
      top={<BackButton onPress={back} />}
      extra={
        step === 'credentials' ? (
          <>
            <AuthDivider />
            <Button variant="ghost" title="Sign in with mobile number" icon={<Smartphone />} onPress={toMobile} disabled={busy} />
            {/* Google (googlesignin domain): hidden unless this build can sign in with Google, or is a demo build. */}
            <GoogleButton onError={setError} disabled={busy} />
            {/* No icon on the narrowest phones with large text, so the label never truncates. */}
            {canSignUp() ? (
              <Button
                variant="text"
                title="New here? Create your account"
                icon={compact ? undefined : <UserPlus />}
                onPress={toSignup}
                disabled={busy}
                style={styles.center}
              />
            ) : null}
          </>
        ) : undefined
      }>
      {step === 'credentials' && (
        <>
          <PillField
            icon={Mail}
            accessibilityLabel="Work email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            placeholder="Work email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
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
              onSubmitEditing={() => login()}
            />
            {/* Payno "Forgot Password": a brand link on the right, close under the field (as on vendor sign-in). */}
            {canUseForgotPassword() ? (
              <Button
                variant="text"
                size="md"
                title="Forgot password?"
                onPress={toForgot}
                disabled={busy}
                style={styles.forgot}
                accessibilityHint="Verify your number on WhatsApp, then set a new password"
              />
            ) : null}
          </View>
          {errorBanner}
          <Button title="Continue" onPress={() => login()} loading={busy} disabled={!email.trim() || !password} />
        </>
      )}

      {step === 'account' && (
        <>
          <ListCard>
            {accounts.map((a, i) => {
              const working = pending === a.accountId;
              const company = str(a.companyName) || 'Company';
              return (
                <ListRow
                  key={str(a.accountId) || `account-${i}`}
                  left={
                    <IconBadge bg={palette.primarySoft}>
                      <Building2 size={20} color={palette.primaryText} strokeWidth={1.8} />
                    </IconBadge>
                  }
                  title={company}
                  // Two lines each: a long company name ("… Private Limited") is the choice itself and
                  // must not be cut at 320 dp.
                  numberOfLines={2}
                  subtitle={[str(a.name), str(a.role)].filter(Boolean).join(' · ') || null}
                  chevron={!working}
                  right={working ? rowSpinner : undefined}
                  disabled={busy && !working}
                  onPress={() => login(a.accountId)}
                />
              );
            })}
          </ListCard>
          {errorBanner}
        </>
      )}

      {step === 'factor' && (
        <>
          {mobile || emailCh ? (
            <ListCard>
              {mobile ? (
                <ListRow
                  left={
                    <IconBadge bg={palette.accentSoft}>
                      <MessageCircle size={20} color={isDarkScheme() ? palette.successInk : palette.accentDeep} strokeWidth={1.8} />
                    </IconBadge>
                  }
                  title="On WhatsApp"
                  subtitle={mobileTo ? `To ${mobileTo}` : 'To your mobile number'}
                  subtitleLines={2}
                  chevron
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setStep('phone');
                  }}
                />
              ) : null}
              {emailCh ? (
                <ListRow
                  left={
                    <IconBadge bg={palette.primarySoft}>
                      <Mail size={20} color={palette.primaryText} strokeWidth={1.8} />
                    </IconBadge>
                  }
                  title="By email"
                  // The (masked) address wraps instead of losing its end at 320 dp.
                  subtitle={emailTo ? `To ${emailTo}` : 'To your work email'}
                  subtitleLines={2}
                  chevron={pending !== 'email'}
                  right={pending === 'email' ? rowSpinner : undefined}
                  disabled={busy && pending !== 'email'}
                  onPress={viaEmail}
                />
              ) : null}
            </ListCard>
          ) : (
            <Banner tone="warning" title="Can’t send a code" message="Your profile has no mobile number or email. Ask HR to add one." />
          )}
          {errorBanner}
        </>
      )}

      {step === 'phone' && (
        <>
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
            returnKeyType="go"
            onSubmitEditing={viaWhatsApp}
            hint={mobileTo ? `Must match ${maskSentTo(mobileTo)} on your profile.` : 'The full number on your DASH profile.'}
          />
          {errorBanner}
          <Button title="Send code" icon={<MessageCircle />} onPress={viaWhatsApp} loading={busy} disabled={digitsOnly(phone).length !== 10} />
        </>
      )}
    </AuthShell>
  );
}

const styles = themedStyles(() => ({
  // The text button's 12 dp padding lines the link up with the pill's right edge; the block keeps the
  // link close under its field instead of a full form gap away.
  passwordBlock: { gap: 2 },
  forgot: { alignSelf: 'flex-end', marginRight: -space.xs },
  center: { alignSelf: 'center' },
}));
