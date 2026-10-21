// WhatsApp code confirmation in a sheet — the website's OtpVerifyModal as used by SignAgreementModal
// ("Confirm Your Signature"): sends a code to the vendor's own number on open
// (/auth/phone/send-otp), verifies it (/auth/phone/verify-otp) and hands the proof token back.
// Auto-verifies on the 6th digit; resend after the web's 20-second cooldown. The code goes in the kit's
// OtpBoxes (six rounded boxes; the system keyboard, so paste and SMS / one-time-code autofill work).

import { MessageCircle } from 'lucide-react-native';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { sendPhoneOtp, verifyPhoneOtp } from '@/api/auth';
import { type ApiResult, isApiError } from '@/api/client';
import { prettyPhone } from '@/features/vendor/format';
import { useOpenCount } from '@/features/vendor/ui';
import { palette, space } from '@/theme/tokens';
import { ActionRow, Banner, Button, FieldMessage, isDarkScheme, OtpBoxes, Sheet, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
const RESEND_SECONDS = 20;

export function OtpConfirmSheet({
  visible,
  phone,
  title,
  description,
  onClose,
  onVerified,
}: {
  visible: boolean;
  phone: string;
  title: string;
  description?: string;
  onClose: () => void;
  onVerified: (proofToken: string) => void;
}) {
  const session = useOpenCount(visible);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {session ? <OtpBody key={session} phone={phone} description={description} onClose={onClose} onVerified={onVerified} /> : null}
    </Sheet>
  );
}

function OtpBody({ phone, description, onClose, onVerified }: { phone: string; description?: string; onClose: () => void; onVerified: (proofToken: string) => void }) {
  const [stage, setStage] = useState<'sending' | 'code' | 'verifying' | 'error'>('sending');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const challenge = useRef<string | null>(null);

  const request = (): Promise<ApiResult<{ ok: true; challengeId: string }>> =>
    phone ? sendPhoneOtp(phone, challenge.current ?? undefined) : Promise.resolve({ error: 'No phone number to verify.' });

  function onSent(r: ApiResult<{ ok: true; challengeId: string }>) {
    if (isApiError(r) || !r.challengeId) {
      setError(isApiError(r) ? r.error : 'Could not send the code. Please try again.');
      return setStage('error');
    }
    challenge.current = r.challengeId;
    setCode('');
    setStage('code');
    setCooldown(RESEND_SECONDS);
  }

  // Resend / try again.
  async function send() {
    setStage('sending');
    setError(null);
    onSent(await request());
  }

  // The first code goes out as soon as the sheet opens (the initial stage is already 'sending').
  const requestOnOpen = useEffectEvent(request);
  const sentOnOpen = useEffectEvent(onSent);
  useEffect(() => {
    let alive = true;
    void requestOnOpen().then((r) => {
      if (alive) sentOnOpen(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(value: string) {
    if (value.length !== 6 || stage === 'verifying' || !challenge.current) return;
    setStage('verifying');
    setError(null);
    const r = await verifyPhoneOtp(challenge.current, value);
    if (isApiError(r) || !r.proofToken) {
      setError(isApiError(r) ? r.error : 'Could not verify that code.');
      setCode('');
      return setStage('code');
    }
    onVerified(r.proofToken);
  }

  return (
    <>
      {description ? <Text variant="body">{description}</Text> : null}
      <View style={styles.sentTo}>
        <MessageCircle size={18} color={isDarkScheme() ? palette.successInk : palette.success} strokeWidth={1.8} style={{ marginTop: 1, flexShrink: 0 }} />
        <Text variant="label" muted style={{ flex: 1, minWidth: 0 }}>
          {stage === 'sending' || stage === 'error' ? 'A WhatsApp code goes to ' : 'We sent a WhatsApp code to '}
          {/* No-break spaces: the number never splits over two lines on a narrow phone. */}
          <Text variant="labelStrong">{prettyPhone(phone).replace(/ /g, ' ') || '—'}</Text>.
        </Text>
      </View>

      {stage === 'sending' ? (
        <View style={styles.sending} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.primaryText} />
          <Text variant="label" muted>
            Sending code…
          </Text>
        </View>
      ) : null}

      {stage === 'error' ? (
        <>
          <Banner tone="danger" title="Couldn’t send the code" message={error ?? undefined} />
          <ActionRow context="sheet">
            <Button title="Cancel" variant="accent" onPress={onClose} />
            <Button title="Try again" onPress={send} />
          </ActionRow>
        </>
      ) : null}

      {stage === 'code' || stage === 'verifying' ? (
        <>
          <View style={{ gap: space.xs }}>
            <OtpBoxes
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
              }}
              onComplete={(v) => void verify(v)}
              error={!!error}
              accessibilityLabel="WhatsApp code"
            />
            <FieldMessage error={error} />
          </View>
          <Button title="Verify" onPress={() => verify(code)} loading={stage === 'verifying'} disabled={code.length !== 6} />
          <View style={styles.links}>
            <Button title="Cancel" variant="text" size="sm" onPress={onClose} disabled={stage === 'verifying'} />
            <Button
              title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              variant="text"
              size="sm"
              onPress={send}
              disabled={cooldown > 0 || stage === 'verifying'}
              accessibilityLabel={cooldown > 0 ? `Resend available in ${cooldown} seconds` : 'Resend code'}
            />
          </View>
        </>
      ) : null}
    </>
  );
}

const styles = themedStyles(() => ({
  sentTo: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  sending: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.xs },
}));
