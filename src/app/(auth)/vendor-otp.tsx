// Vendor WhatsApp code — the shared phone-verification system the web's OtpVerifyModal drives
// (/auth/phone/verify-otp → proofToken), then POST /vendor/auth/whatsapp-verify { proofToken, email },
// which creates the vendor or resumes their registration / signs them in. A brand-new vendor goes on
// to create a password (/vendor-password); so does a returning vendor who came from "Forgot password?"
// (?reason=forgot), to set a new one with the fresh session. Auto-submits on the 6th digit; resend cooldown is the
// web's 20 seconds (the server refuses resends sooner).
// Same layout as the staff code screen (Payno "Verify OTP"): the round back button, the WhatsApp icon in
// a frosted circle, "Verify it’s you" with one muted line naming the masked number, the six OtpBoxes,
// an error Banner, one "Continue" primary and "↻ Resend code"; the digits are typed on the NumericKeypad
// pinned to the bottom on the deep wash (tapping the boxes opens the system keyboard for paste).
// The in-app demo (flow.demo, development builds only): nothing was sent and nothing reaches DASH —
// 123456 opens "Explore DASH as…" with only the Vendor portal section (features/demo/role-picker.tsx),
// and a note on the screen says the code. Picking an Afzal Vendor signs straight in to the portal.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlaskConical, MessageCircle, Store } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';

import { sendPhoneOtp, verifyPhoneOtp } from '@/api/auth';
import { isApiError } from '@/api/client';
import { vendorWhatsAppVerify } from '@/api/vendor';
import { AuthNote, AuthShell, BackButton, maskSentTo, ResendCode, SIGN_IN_FAILED } from '@/auth/auth-shell';
import { DEMO_OTP } from '@/demo/config';
import { DemoRolePicker } from '@/features/demo/role-picker';
import { finishVendorVerification } from '@/features/vendor/auth-complete';
import { useVendorAuthFlow } from '@/features/vendor/auth-flow';
import { Banner, Button, haptic, NumericKeypad, OtpBoxes, useCodeKeypad } from '@/ui';

const RESEND_SECONDS = 20;

export default function VendorOtp() {
  const router = useRouter();
  const flow = useVendorAuthFlow();
  const forgot = useLocalSearchParams<{ reason?: string }>().reason === 'forgot';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The code itself was refused: the boxes get a red rim until the next digit.
  const [wrongCode, setWrongCode] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const submitted = useRef('');
  // A verified code is single-use on the server; keep its proof so a failed next step (e.g. no
  // signal) can be retried without asking for a new code.
  const proofRef = useRef<string | null>(null);
  // Demo: the code was right; the vendor role picker is (or can be re-)opened.
  const demo = flow.demo;
  const [demoOk, setDemoOk] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!flow.phone || !flow.challengeId) router.replace('/vendor');
  }, [flow.phone, flow.challengeId, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function fail(msg?: string | null) {
    haptic.error();
    setBusy(false);
    setError(msg || SIGN_IN_FAILED);
  }

  async function verify(value: string) {
    if (value.length !== 6 || busy || !flow.challengeId) return;
    if (submitted.current === value && !proofRef.current) return;
    submitted.current = value;
    setBusy(true);
    setError(null);
    setWrongCode(false);
    if (flow.demo) {
      if (value !== DEMO_OTP) {
        submitted.current = '';
        setCode('');
        setWrongCode(true);
        return fail(`That code is wrong. In the demo the code is ${DEMO_OTP}.`);
      }
      setBusy(false);
      setDemoOk(true);
      setPicking(true);
      return;
    }
    let proofToken = proofRef.current;
    if (!proofToken) {
      const proof = await verifyPhoneOtp(flow.challengeId, value);
      if (isApiError(proof) || !proof?.proofToken) {
        submitted.current = '';
        setCode('');
        setWrongCode(true);
        return fail(isApiError(proof) ? proof.error : null);
      }
      proofToken = proof.proofToken;
      proofRef.current = proofToken;
    }
    const r = await vendorWhatsAppVerify({ proofToken, email: flow.email });
    if (isApiError(r) || !r?.token) return fail(isApiError(r) ? r.error : null);
    if (forgot && !r.isNew) {
      // Forgot password: keep the new session aside and set a new password before going in.
      flow.set({ pending: { token: r.token, expiresAt: r.expiresAt ?? null } });
      setBusy(false);
      router.replace({ pathname: '/vendor-password', params: { reason: 'forgot' } });
      return;
    }
    const next = await finishVendorVerification(r, flow.phone);
    // 'signed-in': the root layout has already switched to the portal.
    if (next === 'set-password') {
      setBusy(false);
      router.replace('/vendor-password');
    }
  }

  async function resend() {
    if (cooldown > 0 || busy || resending) return;
    setError(null);
    setWrongCode(false);
    setCode('');
    submitted.current = '';
    proofRef.current = null;
    if (flow.demo) return setCooldown(RESEND_SECONDS);
    setResending(true);
    const r = await sendPhoneOtp(flow.phone, flow.challengeId ?? undefined);
    setResending(false);
    if (isApiError(r)) return fail(r.error);
    if (r?.challengeId) flow.set({ challengeId: r.challengeId });
    setCooldown(RESEND_SECONDS);
  }

  const sentTo = typeof flow.sentTo === 'string' ? maskSentTo(flow.sentTo.trim()) : '';

  // Typing (keypad or system keyboard) clears the last error; the 6th digit submits.
  const type = (v: string) => {
    setCode(v);
    setError(null);
    setWrongCode(false);
  };
  const keypad = useCodeKeypad(code, type, { onComplete: (v) => void verify(v) });

  return (
    <AuthShell
      icon={demo ? FlaskConical : MessageCircle}
      title="Verify it’s you"
      subtitle={
        demo
          ? 'Enter the 6-digit code for the demo account.'
          : sentTo
            ? `We sent a 6-digit code to ${sentTo} on WhatsApp.`
            : 'We sent a 6-digit code to your WhatsApp.'
      }
      top={<BackButton onPress={() => router.back()} />}
      keypad={<NumericKeypad onKey={keypad.onKey} disabled={busy || demoOk} />}>
      {demo ? <AuthNote icon={FlaskConical}>{demoOk ? 'Code accepted · choose which vendor to explore' : `Sample data only · the code is ${DEMO_OTP}`}</AuthNote> : null}
      <OtpBoxes
        value={code}
        onChange={type}
        onComplete={(v) => void verify(v)}
        withKeypad
        error={wrongCode}
        accessibilityLabel={demo ? 'Demo code' : 'WhatsApp code'}
      />
      {error ? <Banner tone="danger" message={error} /> : null}
      {demoOk ? (
        <Button title="Choose a vendor" icon={<Store />} onPress={() => setPicking(true)} />
      ) : (
        <Button title="Continue" onPress={() => verify(code)} loading={busy} disabled={code.length !== 6} />
      )}
      {/* Part of the form block, so the shell keeps it above the system keyboard when the boxes open it. */}
      <ResendCode seconds={cooldown} onPress={resend} loading={resending} disabled={busy} />
      {demo ? <DemoRolePicker visible={picking} onClose={() => setPicking(false)} scope="vendor" /> : null}
    </AuthShell>
  );
}
