// "Continue with Google" for staff — the button on (auth)/login.tsx and (auth)/email.tsx.
//
// Same as the website's round Google button (dash.html:2195 → doGoogle, dash.html:2034): no second
// factor, because Google has already proved who the person is; the server still refuses anyone who is
// not a DASH user or on the approved list (server.js:2526). Token steps: features/signin/google.ts.
//
// Three modes (googleMode()):
//   real  expo-auth-session opens Google's sign-in page; a cancelled picker shows nothing, like the
//         website's closed popup. Errors come back through onError and show as the screen's danger Banner.
//   demo  dev and preview builds without a real Google setup here (always in Expo Go): a sample
//         "Choose an account" sheet (demo/fixtures/googlesignin.ts). Nothing is sent to Google or DASH.
//   off   store builds without client ids: nothing renders.

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { FlaskConical } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { getFirebaseConfig, signInWithGoogle } from '@/api/auth';
import { isApiError } from '@/api/client';
import { useSession } from '@/auth/session';
import { DEMO_GOOGLE_ACCOUNTS, DEMO_GOOGLE_CREATED, DEMO_GOOGLE_NOT_LISTED, type DemoGoogleAccount } from '@/demo/fixtures/googlesignin';
import { startStaffDemo, useDemoRolePicker } from '@/features/demo/role-picker';
import {
  firebaseTokenFromGoogle,
  GOOGLE_DISCOVERY,
  GOOGLE_FAILED,
  GOOGLE_NATIVE_REDIRECT,
  GOOGLE_SCOPES,
  type GoogleCredential,
  googleClientId,
  googleMode,
  googleNeedsInstalledApp,
} from '@/features/signin/google';
import { UNAVAILABLE_IN_EXPO_GO } from '@/lib/capabilities';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Button, haptic, Sheet, Text, toast } from '@/ui';

// Web preview only: the Google popup lands back on this app's page, which must close it.
WebBrowser.maybeCompleteAuthSession();

const LABEL = 'Continue with Google';
// The sheet closes first, then the next step runs (the role picker is another sheet).
// iOS won't present a sheet over one that is still closing, so it waits a little longer.
const AFTER_CLOSE_MS = Platform.OS === 'ios' ? 400 : 280;

/** Google's own four-colour mark (the website draws the same paths). It keeps its colours in dark mode. */
function GoogleMark({ size = 18 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    // The a11y-hiding props sit on a View: on web, react-native-svg passes them to the DOM <svg> (a React warning).
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.56-5.17 3.56-8.87z" />
        <Path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3a7.2 7.2 0 0 1-10.72-3.78H1.36v3.09A12 12 0 0 0 12 24z" />
        <Path fill="#FBBC05" d="M5.35 14.31a7.12 7.12 0 0 1 0-4.6V6.62H1.36a12 12 0 0 0 0 10.78l3.99-3.09z" />
        <Path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.36 6.62l3.99 3.09A7.15 7.15 0 0 1 12 4.75z" />
      </Svg>
    </View>
  );
}

type Props = {
  /** A plain-words error for the screen's danger Banner; null clears it. */
  onError: (message: string | null) => void;
  /** The screen is busy with another way in. */
  disabled?: boolean;
};

export function GoogleButton(props: Props) {
  const mode = googleMode();
  if (mode === 'real') return <RealGoogleButton {...props} />;
  if (mode === 'demo') return <DemoGoogleButton {...props} />;
  return null;
}

// ── Real: expo-auth-session ───────────────────────────────────────────────────────
const IS_WEB = Platform.OS === 'web';

function RealGoogleButton({ onError, disabled }: Props) {
  const signIn = useSession((s) => s.signIn);
  const clientId = googleClientId();
  // Web: this page (registered in Google Cloud as an authorised redirect URI). Phones: the app id scheme.
  const redirectUri = IS_WEB ? AuthSession.makeRedirectUri({ path: 'login' }) : GOOGLE_NATIVE_REDIRECT;
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      redirectUri,
      scopes: GOOGLE_SCOPES,
      prompt: AuthSession.Prompt.SelectAccount,
      // Phones: authorization code + PKCE (installed-app clients have no secret). The web client cannot
      // swap a code without a secret, so the web preview asks for an access token instead.
      responseType: IS_WEB ? AuthSession.ResponseType.Token : AuthSession.ResponseType.Code,
      usePKCE: !IS_WEB,
    },
    GOOGLE_DISCOVERY,
  );
  const [busy, setBusy] = useState(false);

  async function credentialFrom(result: AuthSession.AuthSessionResult): Promise<GoogleCredential | { error: string } | null> {
    if (result.type !== 'success') {
      // Closed or cancelled: say nothing, like the website's closed popup.
      if (result.type === 'error') return { error: GOOGLE_FAILED };
      return null;
    }
    if (IS_WEB) {
      const accessToken = result.authentication?.accessToken || result.params.access_token;
      return accessToken ? { accessToken } : { error: GOOGLE_FAILED };
    }
    const code = result.params.code;
    if (!code || !request?.codeVerifier) return { error: GOOGLE_FAILED };
    try {
      const tokens = await AuthSession.exchangeCodeAsync(
        { clientId, code, redirectUri, extraParams: { code_verifier: request.codeVerifier } },
        GOOGLE_DISCOVERY,
      );
      return tokens.idToken ? { idToken: tokens.idToken } : { error: GOOGLE_FAILED };
    } catch {
      return { error: GOOGLE_FAILED };
    }
  }

  async function run() {
    if (busy || !request) return;
    onError(null);
    setBusy(true);
    try {
      const cred = await credentialFrom(await promptAsync());
      if (!cred) return;
      if ('error' in cred) throw new Error(cred.error);
      const fb = await firebaseTokenFromGoogle(cred, getFirebaseConfig);
      if ('error' in fb) throw new Error(fb.error);
      const r = await signInWithGoogle(fb.idToken);
      // The server's own words: 401 "Could not verify…", 403 "…not on the employee roster…".
      if (isApiError(r)) throw new Error(r.error);
      if (!r?.token || !r.user) throw new Error('Could not complete Google sign-in.');
      haptic.success();
      await signIn({ kind: 'staff', token: r.token, tokenExpiresAt: r.tokenExpiresAt, user: r.user });
    } catch (e) {
      haptic.error();
      onError(e instanceof Error && e.message ? e.message : GOOGLE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return <Button variant="ghost" title={LABEL} icon={<GoogleMark />} onPress={run} loading={busy} disabled={disabled || !request} />;
}

// ── Demo: a sample account picker ─────────────────────────────────────────────────
function DemoGoogleButton({ onError, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const roles = useDemoRolePicker({ scope: 'staff' });

  function choose(a: DemoGoogleAccount) {
    haptic.select();
    setOpen(false);
    onError(null);
    if (a.outcome === 'not-listed') {
      // server.js:2545 — no account and not on the approved list.
      setTimeout(() => {
        haptic.error();
        onError(DEMO_GOOGLE_NOT_LISTED);
      }, AFTER_CLOSE_MS);
      return;
    }
    if (a.outcome === 'existing') {
      // A DASH user already: signed in. The demo then asks which role to explore, like every demo way in.
      setTimeout(roles.open, AFTER_CLOSE_MS);
      return;
    }
    // On the approved list: the first Google sign-in creates the account (server.js:2549), then signs in.
    setBusy(true);
    setTimeout(() => {
      void (async () => {
        try {
          toast.show(DEMO_GOOGLE_CREATED);
          await startStaffDemo('employee');
        } catch {
          onError(GOOGLE_FAILED);
        } finally {
          setBusy(false);
        }
      })();
    }, AFTER_CLOSE_MS);
  }

  const installedOnly = googleNeedsInstalledApp();
  return (
    <>
      <Button
        variant="ghost"
        title={LABEL}
        icon={<GoogleMark />}
        onPress={() => {
          onError(null);
          setOpen(true);
        }}
        loading={busy}
        disabled={disabled}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Choose an account" subtitle="to continue to DASH">
        <ActivityList tone="glass">
          {DEMO_GOOGLE_ACCOUNTS.map((a) => (
            <ActivityRow
              key={a.email}
              person={{ name: a.name }}
              title={a.name}
              subtitle={a.email}
              note={a.note}
              chevron
              accessibilityHint={`Continues with ${a.email}`}
              onPress={() => choose(a)}
            />
          ))}
        </ActivityList>
        <View style={styles.foot}>
          <Text variant="caption" muted align="center">
            {'Demo · sample Google accounts on this phone. Nothing is sent to Google or DASH.'}
          </Text>
          {installedOnly ? (
            <View style={styles.note}>
              <FlaskConical size={14} color={palette.textMuted} />
              <Text variant="caption" muted align="center">{`Real Google sign-in · ${UNAVAILABLE_IN_EXPO_GO}`}</Text>
            </View>
          ) : null}
        </View>
      </Sheet>
      {roles.element}
    </>
  );
}

const styles = themedStyles(() => ({
  foot: { paddingHorizontal: space.sm, paddingTop: space.xxs, gap: space.xs },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs, flexWrap: 'wrap' },
}));
