// Forced once, right after a brand-new vendor verifies their number (web VendorAuth stage 'setpw'):
// set a password so the next sign-in is mobile number + password instead of waiting for a code.
// Also the last step of "Forgot password?" (?reason=forgot): a returning vendor who just verified
// their number sets a new password here, with a "Skip for now" link that signs them in without one.
// POST /vendor/auth/set-password with the new session token, then the session is stored and the
// app switches to the portal.
// The lock in a frosted circle, "Number verified" as the small brand eyebrow over the title, two
// frosted PillFields with a leading lock (each with its own show/hide eye), one full-width
// "Save password" primary.
// Validation errors show inline under the field they belong to; a server error shows as a danger
// Banner above the button.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';

import { isApiError } from '@/api/client';
import { vendorSetPasswordWithToken } from '@/api/vendor';
import { AuthShell } from '@/auth/auth-shell';
import { signInVendor } from '@/features/vendor/auth-complete';
import { useVendorAuthFlow } from '@/features/vendor/auth-flow';
import { Banner, Button, haptic, PillField, toast } from '@/ui';

export default function VendorCreatePassword() {
  const router = useRouter();
  const pending = useVendorAuthFlow((s) => s.pending);
  const phone = useVendorAuthFlow((s) => s.phone);
  const forgot = useLocalSearchParams<{ reason?: string }>().reason === 'forgot';
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw1Error, setPw1Error] = useState<string | null>(null);
  const [pw2Error, setPw2Error] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) router.replace('/vendor');
  }, [pending, router]);

  function clearErrors() {
    setPw1Error(null);
    setPw2Error(null);
    setError(null);
  }

  async function submit() {
    if (busy || !pending) return;
    clearErrors();
    if (pw1.length < 6) {
      haptic.warning();
      return setPw1Error('Password must be at least 6 characters.');
    }
    if (pw1 !== pw2) {
      haptic.warning();
      return setPw2Error('Passwords do not match.');
    }
    setBusy(true);
    const r = await vendorSetPasswordWithToken(pending.token, pw1);
    if (isApiError(r)) {
      setBusy(false);
      haptic.error();
      return setError(r.error);
    }
    if (forgot) toast.show('New password saved');
    await signInVendor(pending.token, pending.expiresAt, phone);
  }

  // Forgot-password only: go in with the verified session and keep the old password.
  async function skip() {
    if (busy || !pending) return;
    setBusy(true);
    await signInVendor(pending.token, pending.expiresAt, phone);
  }

  return (
    <AuthShell
      icon={LockKeyhole}
      overline="Number verified"
      title={forgot ? 'Set a new password' : 'Create a password'}
      subtitle="Next time, sign in with your number and this password."
      extra={
        forgot ? (
          <Button variant="text" size="md" title="Skip for now" onPress={skip} disabled={busy} style={{ alignSelf: 'center' }} />
        ) : undefined
      }>
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
        hint="At least 6 characters."
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
        onSubmitEditing={submit}
        error={pw2Error}
      />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title="Save password" onPress={submit} loading={busy} disabled={!pw1 || !pw2} />
    </AuthShell>
  );
}
