// Digio KYC on the wizard's Verify step — the website's VerifyStageCard + startDigioStage /
// startPolling / recheckStage (dash.html ~31416-31504), for the one remaining 'identity' stage
// (GST certificate or PAN, Aadhaar via DigiLocker and the ₹1 penny drop, in one Digio journey).
//
//   POST /vendor/kyc/start { stage:'identity', gstStatus } → { redirectUrl } → opened in the in-app
//   browser. While the step is on screen, GET /vendor/kyc/status every 3 s (skipped while the app is
//   in the background, without using up the budget — the web skips hidden tabs the same way), once
//   more the moment the vendor comes back from the browser, and give up after ~3 minutes with a way
//   to "check again". A journey left running (app closed, other device) resumes polling on open.
// The in-app demo (development builds only) has no Digio: no browser opens, and the first status check
// finishes the journey with the demo vendor's sample details (demo/vendor/routes.ts).

import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, BadgeCheck, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { isApiError, isDemoSession } from '@/api/client';
import { getKycStatus, startKyc, type Vendor, VENDOR_ME_KEY } from '@/api/vendor';
import { InfoRows } from '@/features/vendor/ui';
import { palette, radius, space } from '@/theme/tokens';
import { Banner, Button, haptic, isDarkScheme, Text, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';
const KYC_POLL_MS = 3000;
const KYC_POLL_MAX = 60; // ~3 minutes
const FAILED = ['rejected', 'expired', 'failed'];
const MSG_VERIFIED = 'Verified with Digio ✓';
const MSG_REVIEWING = 'Digio is reviewing it. You can carry on.';
const MSG_FAILED = "Digio couldn't verify this. Please try again.";
const MSG_NO_RESULT = 'No result from Digio yet. If you finished, tap Check again.';

export function DigioVerifyCard({
  vendor,
  gstStatus,
  termsAccepted,
  allowRestart,
  active,
  onRequireGstStatus,
}: {
  vendor: Vendor;
  gstStatus: string;
  termsAccepted: boolean;
  allowRestart: boolean;
  active: boolean;
  onRequireGstStatus: () => void;
}) {
  const qc = useQueryClient();
  const { compact } = useLayout();
  const kyc = vendor.kyc;
  const stage = kyc?.stages?.identity;
  const completed = stage?.status === 'completed';
  const underReview = completed && !!stage?.awaitingDigioApproval;
  const started = !!stage?.requestId;
  const resume = stage?.status === 'in_progress' && started;

  const [polling, setPolling] = useState(resume);
  const [action, setAction] = useState<'start' | 'check' | null>(null);
  const [msg, setMsg] = useState('');
  const live = useRef(resume);
  const tries = useRef(0);
  const inflight = useRef(false);

  const reload = () => qc.invalidateQueries({ queryKey: VENDOR_ME_KEY });

  function stop() {
    live.current = false;
    setPolling(false);
  }

  // One poll. Skipped (and not counted) while the app is in the background or a poll is in flight.
  async function pollOnce() {
    if (!live.current || inflight.current || AppState.currentState !== 'active') return;
    tries.current += 1;
    inflight.current = true;
    const s = await getKycStatus();
    inflight.current = false;
    if (!live.current) return;
    const ss = isApiError(s) ? undefined : s.stages?.identity;
    if (ss?.status === 'completed') {
      stop();
      setMsg(ss.awaitingDigioApproval ? MSG_REVIEWING : MSG_VERIFIED);
      haptic.success();
      void reload();
    } else if (FAILED.includes(ss?.status ?? '')) {
      stop();
      setMsg(MSG_FAILED);
      haptic.error();
      void reload();
    } else if (tries.current >= KYC_POLL_MAX) {
      stop();
      setMsg(MSG_NO_RESULT);
    }
  }

  const onTick = useEffectEvent(() => {
    void pollOnce();
  });

  useEffect(() => {
    if (!polling || !active) return;
    const id = setInterval(() => onTick(), KYC_POLL_MS);
    // Coming back from the browser (or from another app) — check straight away.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') onTick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [polling, active]);

  async function startStage() {
    if (!gstStatus) return onRequireGstStatus();
    setAction('start');
    setMsg('');
    const r = await startKyc({ stage: 'identity', gstStatus });
    setAction(null);
    if (isApiError(r)) {
      haptic.error();
      return setMsg(r.error);
    }
    setMsg('Digio is open in your browser. Finish there and come back.');
    tries.current = 0;
    live.current = true;
    setPolling(true);
    void reload(); // the stage is now 'in_progress' with a request id
    if (isDemoSession()) {
      // The demo's Digio answers on the phone straight away.
      setMsg('Demo: no browser here. Digio answers with sample details.');
      void pollOnce();
      return;
    }
    try {
      const res = await WebBrowser.openBrowserAsync(r.redirectUrl, { dismissButtonStyle: 'done', controlsColor: palette.primaryText, toolbarColor: palette.surface });
      // iOS resolves when the browser is closed; Android resolves at once and the AppState listener
      // above takes over when the vendor returns.
      if (res.type === WebBrowser.WebBrowserResultType.CANCEL || res.type === WebBrowser.WebBrowserResultType.DISMISS) void pollOnce();
    } catch {
      setMsg("Couldn't open Digio. Please try again.");
    }
  }

  async function recheck() {
    setAction('check');
    setMsg('Checking…');
    const s = await getKycStatus();
    setAction(null);
    const ss = isApiError(s) ? undefined : s.stages?.identity;
    if (ss?.status === 'completed') {
      setMsg(ss.awaitingDigioApproval ? MSG_REVIEWING : MSG_VERIFIED);
      haptic.success();
      void reload();
      return;
    }
    if (FAILED.includes(ss?.status ?? '')) return setMsg(MSG_FAILED);
    setMsg(isApiError(s) ? s.error : MSG_NO_RESULT);
  }

  const busy = action !== null || polling;
  const needsTerms = !started && !termsAccepted;

  if (completed) {
    const rows = [
      { label: 'PAN', value: kyc?.panVerification?.pan, mono: true },
      { label: 'PAN holder', value: kyc?.panVerification?.holderName },
      { label: 'GSTIN', value: kyc?.gstVerification?.gstin, mono: true },
      { label: 'Legal name', value: kyc?.gstVerification?.legalName },
      { label: 'Name on Aadhaar', value: kyc?.aadhaarVerification?.nameOnAadhaar },
      { label: 'Aadhaar', value: kyc?.aadhaarVerification?.last4 ? `••••••••${kyc.aadhaarVerification.last4}` : '' },
    ];
    return (
      <View style={[styles.card, { backgroundColor: palette.successSoft }]}>
        <View style={styles.head}>
          <BadgeCheck size={20} color={palette.success} style={{ flexShrink: 0 }} />
          <Text variant="bodyStrong" color={palette.successInk} style={{ flex: 1, minWidth: 0 }}>
            Verified with Digio
          </Text>
        </View>
        {rows.some((r) => r.value) ? (
          <View style={styles.inner}>
            <InfoRows rows={rows} hideEmpty />
          </View>
        ) : null}
        {underReview ? (
          <Banner tone="warning" message={allowRestart ? 'Digio is still reviewing this.' : 'Digio is still reviewing this. You can carry on.'} />
        ) : null}
        {allowRestart ? (
          <Button title="Verify again" variant="accent" size="md" icon={<RefreshCw />} loading={action === 'start'} disabled={busy} onPress={startStage} />
        ) : null}
        {msg && msg !== MSG_VERIFIED ? (
          <Text variant="label" color={palette.text} accessibilityLiveRegion="polite">
            {msg}
          </Text>
        ) : null}
      </View>
    );
  }

  // Brand text on the soft brand tint: the deep vermilion in light, the lifted brand text colour in dark.
  const brandInk = isDarkScheme() ? palette.primaryText : palette.primaryDeep;
  return (
    <View style={[styles.card, { backgroundColor: palette.primarySoft }]}>
      <View style={styles.head}>
        <ShieldCheck size={20} color={brandInk} style={{ flexShrink: 0 }} />
        <Text variant="bodyStrong" color={brandInk} style={{ flex: 1, minWidth: 0 }}>
          {started ? 'Digio check started' : 'Verify with Digio'}
        </Text>
      </View>
      {needsTerms ? (
        <View style={styles.inner}>
          <Text variant="label" muted style={{ paddingVertical: space.sm }}>
            Tick “I agree” above to start.
          </Text>
        </View>
      ) : (
        // Once a check is running, "Check again" (finished in the browser) is the likely next tap;
        // starting over is the quieter second option.
        <View style={{ gap: space.xs }}>
          {started ? (
            <>
              <Button title="Check again" icon={<RefreshCw />} loading={action === 'check'} disabled={busy} onPress={recheck} />
              <Button title="Start again" variant="accent" size="md" loading={action === 'start'} disabled={busy} onPress={startStage} />
            </>
          ) : (
            <Button title="Verify with Digio" icon={compact ? undefined : <ArrowRight />} loading={action === 'start'} disabled={busy} onPress={startStage} />
          )}
        </View>
      )}
      {polling ? (
        <View style={styles.head} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.primaryText} />
          <Text variant="label" color={brandInk} style={{ flex: 1, minWidth: 0 }}>
            Waiting for Digio. This updates by itself.
          </Text>
        </View>
      ) : null}
      {msg ? (
        <Text variant="label" color={brandInk} accessibilityLiveRegion="polite">
          {msg}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { padding: space.md, borderRadius: radius.md, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  inner: { backgroundColor: palette.surface, borderRadius: radius.sm, paddingHorizontal: space.sm },
}));
