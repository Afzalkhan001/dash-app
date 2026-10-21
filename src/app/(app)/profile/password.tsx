// Change password — the web's My Profile → Password & Security (dash.html ProfileView savePw
// ~L29052): current, new and confirm are all required and new must equal confirm; the server
// (POST /auth/change-password, server.js ~L2586) checks the current password and needs at least 4
// characters. Its own messages ("Current password is incorrect", rate limits) are shown as sent.
//
// Payno form (docs/REFERENCE-COMPONENTS.md #24): a key in a frosted circle with one plain line on
// what this password is for, then three PillFields with a lock icon (each with its own show / hide
// eye), errors inline under their field, the submit in a sticky ActionBar whose note says what is
// still missing, and a failed submit as the one danger Banner under the form.

import { useRouter } from 'expo-router';
import { KeyRound, Lock, LockKeyhole } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';

import { changePassword } from '@/api/auth';
import { isApiError } from '@/api/client';
import { useSession } from '@/auth/session';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { ActionBar, Banner, Button, FROST_SHADOW, haptic, NavHeader, PillField, Screen, Text, toast } from '@/ui';

const MIN_LENGTH = 4; // server.js /auth/change-password
const BADGE = 64;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const userId = useSession((s) => s.user?.id);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const mismatch = !!next && !!confirm && next !== confirm;
  const tooShort = !!next && next.length < MIN_LENGTH;
  const ready = !!current && !!next && !!confirm && !mismatch && !tooShort;

  // What is still missing, in the order the person fills the form. An untouched form says nothing
  // yet (three empty fields explain themselves), and "too short" / "doesn't match" already show
  // under their own field, so the bar does not repeat them.
  const pristine = !current && !next && !confirm;
  const blocker =
    pristine || tooShort || mismatch
      ? null
      : !current
        ? 'Enter your current password.'
        : !next
          ? 'Choose a new password.'
          : !confirm
            ? 'Type the new password again.'
            : null;

  const submit = async () => {
    if (!ready || !userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await changePassword(userId, current, next);
      if (isApiError(r)) {
        haptic.error();
        setError(r.error || 'Try again.');
        return;
      }
      haptic.success();
      toast.show('Password changed.');
      router.back();
    } catch (e) {
      haptic.error();
      setError(e instanceof Error && e.message ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setError(null);
  };

  return (
    <Screen
      header={<NavHeader title="Change password" />}
      footer={
        <ActionBar note={blocker}>
          <Button title="Change password" onPress={() => void submit()} loading={busy} disabled={!ready} />
        </ActionBar>
      }>
      <View key="intro" style={styles.intro}>
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <KeyRound size={26} color={palette.primaryText} strokeWidth={1.6} />
        </View>
        <Text variant="heading" align="center" accessibilityRole="header">
          Choose a new password
        </Text>
        {/* No line cap: with very large text this wraps rather than cutting off the rule. */}
        <Text variant="label" muted align="center" style={styles.introText}>
          You use it to sign in with email. Use at least {MIN_LENGTH} characters, and don’t share it.
        </Text>
      </View>

      <View key="fields" style={styles.fields}>
        <PillField
          icon={Lock}
          label="Current password"
          value={current}
          onChangeText={edit(setCurrent)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => nextRef.current?.focus()}
        />
        <PillField
          ref={nextRef}
          icon={LockKeyhole}
          label="New password"
          value={next}
          onChangeText={edit(setNext)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          error={tooShort ? `Use at least ${MIN_LENGTH} characters.` : null}
        />
        <PillField
          ref={confirmRef}
          icon={LockKeyhole}
          label="Confirm new password"
          value={confirm}
          onChangeText={edit(setConfirm)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          error={mismatch ? 'Doesn’t match the new password.' : null}
        />
      </View>
      {error ? <Banner key="error" tone="danger" title="Couldn’t change your password" message={error} /> : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  intro: { alignItems: 'center', gap: space.xs, paddingTop: space.sm, paddingBottom: space.xxs },
  // The Payno icon circle: a frosted disc with the bright rim and the soft wide shadow.
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
    backgroundColor: palette.frostStrong,
    borderWidth: 1,
    borderColor: palette.glassEdge,
    ...FROST_SHADOW,
  },
  introText: { maxWidth: 320 },
  fields: { gap: space.md },
}));
