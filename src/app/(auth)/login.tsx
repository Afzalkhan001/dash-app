// Staff sign-in: mobile number → WhatsApp code. Same endpoints as the website's
// "Sign in with mobile number" (server.js /api/auth/phone/send-otp → verify-otp → /api/auth/mobile).
//
// Payno sign-in (docs/REFERENCE-COMPONENTS.md §3): the centred Tamada logo, "Welcome back" with a muted
// two-line subtitle, one frosted PillField (phone glyph + "+91"), one full-width primary "Send code".
// The only alternative for staff, "Sign in with email", is an outlined frosted pill under an "Or"
// divider. Vendors are a different kind of user, so their way in is the small footer link at the
// bottom of the page ("Are you a vendor? Sign in here").
// A send failure shows as a danger Banner right above the button (docs/DESIGN.md §12).

import { useRouter } from 'expo-router';
import { Mail, MessageCircle, Users } from 'lucide-react-native';
import { useState } from 'react';

import { digitsOnly, sendPhoneOtp } from '@/api/auth';
import { isApiError } from '@/api/client';
import { AuthDivider, AuthFooterLink, AuthShell, PhoneLead, SIGN_IN_FAILED } from '@/auth/auth-shell';
import { useAuthFlow } from '@/auth/flow';
import { useSession } from '@/auth/session';
import { DEMO_ENABLED, DEMO_PHONE, isDemoPhone } from '@/demo/config';
import { DemoRolePicker } from '@/features/demo/role-picker';
import { Banner, Button, haptic, PillField } from '@/ui';

const pretty = (digits: string) => `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

export default function MobileLogin() {
  const router = useRouter();
  const lastPhone = useSession((s) => s.lastPhone);
  const flow = useAuthFlow();
  const [phone, setPhone] = useState(typeof lastPhone === 'string' ? digitsOnly(lastPhone).slice(-10) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Demo (dev builds only): pick a role first, then sign in with the demo number and 123456.
  const [choosingRole, setChoosingRole] = useState(false);

  function chooseDemoRole(id: string, kind: 'staff' | 'vendor') {
    setPhone(DEMO_PHONE);
    flow.reset();
    flow.set({ purpose: 'demo', phone: `+91${DEMO_PHONE}`, sentTo: pretty(DEMO_PHONE), demoPersona: { kind, id } });
    router.push('/otp');
  }

  const digits = digitsOnly(phone);
  const valid = digits.length === 10;

  async function submit() {
    if (!valid || busy) return;
    setError(null);
    const full = `+91${digits}`;
    if (isDemoPhone(digits)) {
      // The in-app demo account: no WhatsApp message, the code is always 123456 (the code screen says so).
      flow.reset();
      flow.set({ purpose: 'demo', phone: full, sentTo: pretty(digits) });
      router.push('/otp');
      return;
    }
    setBusy(true);
    const r = await sendPhoneOtp(full);
    setBusy(false);
    if (isApiError(r) || !r?.challengeId) {
      haptic.error();
      return setError(isApiError(r) ? r.error : SIGN_IN_FAILED);
    }
    flow.reset();
    flow.set({ purpose: 'mobile', phone: full, phoneChallengeId: r.challengeId, sentTo: pretty(digits) });
    router.push('/otp');
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with your mobile number. We’ll send you a code on WhatsApp."
      extra={
        <>
          <AuthDivider />
          <Button variant="ghost" title="Sign in with email" icon={<Mail />} onPress={() => router.push('/email')} disabled={busy} />
          {DEMO_ENABLED ? (
            <>
              <Button variant="text" title="Try a demo role" icon={<Users />} onPress={() => setChoosingRole(true)} disabled={busy} />
              <DemoRolePicker visible={choosingRole} onClose={() => setChoosingRole(false)} onChoose={chooseDemoRole} />
            </>
          ) : null}
        </>
      }
      footer={<AuthFooterLink prompt="Are you a vendor?" label="Sign in here" onPress={() => router.push('/vendor')} />}>
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
        onSubmitEditing={submit}
      />
      {error ? <Banner tone="danger" message={error} /> : null}
      <Button title="Send code" icon={<MessageCircle />} onPress={submit} loading={busy} disabled={!valid} />
    </AuthShell>
  );
}
