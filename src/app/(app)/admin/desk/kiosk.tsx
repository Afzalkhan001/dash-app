// Kiosk mode (web: VisitorKioskPage + VisitKioskOverlay, dash.html:35859-35922). A full-screen modal
// (Stack options by route name in (app)/_layout.tsx: no swipe-down, fade).
//   1. The intro: what kiosk mode does, how to pin the phone (App pinning / Guided Access — Expo Go can't
//      lock the phone itself), and Start kiosk. GET /visitors/qr gives the public check-in base.
//   2. Running: the check-in wizard (features/desk/kiosk/wizard.tsx). The status bar is hidden and the
//      Android Back button does nothing. "Exit kiosk" asks for the phone's own lock or the DASH password.
//   3. If the link stops working (someone made a new one) the kiosk says so and asks to be restarted.
// Desk roles only (features/desk/access.ts canSeeKiosk); anyone else is sent home.

import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BatteryCharging, Lock, MonitorSmartphone, Play, RefreshCcw, ShieldCheck, Ticket, WifiOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { checkInUrl, kioskBase, kioskCheckLink, KioskError, useDeskQr } from '@/api/desk';
import { canRunDesk, canSeeKiosk } from '@/features/desk/access';
import { KioskExitSheet } from '@/features/desk/kiosk/exit-sheet';
import { Art, KioskHeader, KioskLinkDead, KioskWizard, Result } from '@/features/desk/kiosk/wizard';
import { DESK_ROUTES } from '@/features/desk/routes';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { ActionBar, Banner, Button, ErrorState, NavHeader, Screen, Skeleton, SummaryCard, SummaryHero, Text } from '@/ui';

type Phase = 'intro' | 'running' | 'dead';

export default function KioskScreen() {
  const access = useAccess();
  const router = useRouter();
  const allowed = canRunDesk(access) && canSeeKiosk(access);
  const qr = useDeskQr(allowed);
  const [phase, setPhase] = useState<Phase>('intro');
  const [asking, setAsking] = useState(false);
  const running = phase !== 'intro';

  // While the kiosk runs, Android's Back does nothing (the web kiosk is full screen; the APK disables Back).
  useEffect(() => {
    if (!running) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [running]);

  if (!allowed) return <Redirect href="/" />;

  const exitTo = (p: Phase) => {
    setAsking(false);
    setPhase(p);
    // A fresh link next time (it may have been regenerated while the kiosk ran).
    void qr.refetch();
  };

  const data = qr.data;
  const base = data ? kioskBase(data) : '';
  const company = data?.companyName ?? '';

  if (phase === 'dead') {
    return (
      <>
        <StatusBar hidden />
        <KioskLinkDead companyName={company} onAskExit={() => setAsking(true)} />
        <KioskExitSheet visible={asking} onClose={() => setAsking(false)} onExited={() => exitTo('intro')} />
      </>
    );
  }

  if (phase === 'running' && data) {
    return (
      <>
        <StatusBar hidden />
        <RunningKiosk base={base} companyName={company} linkUrl={checkInUrl(data.path)} onLinkDead={() => setPhase('dead')} onAskExit={() => setAsking(true)} />
        <KioskExitSheet visible={asking} onClose={() => setAsking(false)} onExited={() => exitTo('intro')} />
      </>
    );
  }

  return (
    <Screen
      header={<NavHeader title="Kiosk mode" onBack={() => (router.canGoBack() ? router.back() : router.replace(DESK_ROUTES.board))} />}
      footer={
        <ActionBar note="Leaving asks for this phone’s fingerprint or PIN, or your DASH password.">
          <Button size="lg" title="Start kiosk" icon={<Play />} disabled={!data} onPress={() => setPhase('running')} />
        </ActionBar>
      }
      onRefresh={() => qr.refetch()}>
      <SummaryHero
        icon={MonitorSmartphone}
        module="visitors"
        label="Visitor check-in stand"
        figure={
          data ? (
            <Text variant="title" numberOfLines={2}>
              {company || 'Your lobby'}
            </Text>
          ) : qr.isError ? null : (
            <Skeleton width={180} height={32} radius={radius.sm} />
          )
        }
        sub="Turns this phone into a check-in stand for your lobby."
      />
      {qr.isError && !data ? <ErrorState message={qr.error?.message ?? ''} onRetry={() => void qr.refetch()} /> : null}
      <SummaryCard
        title="What visitors get"
        rows={[
          { label: 'Big buttons', value: 'Meet someone, or use an invite code' },
          { label: 'Same check', value: 'A photo, then the host lets them in' },
          { label: 'Clears itself', value: '15 seconds after each visitor' },
        ]}
      />
      <View style={styles.tips}>
        <Text variant="labelStrong" muted>
          Before you start
        </Text>
        <Tip icon={Lock} title="Pin the app" text="Android: Settings › Security › App pinning. iPhone: Settings › Accessibility › Guided Access. Then visitors can’t leave the kiosk." />
        <Tip icon={BatteryCharging} title="Keep it charging" text="Set the screen to stay on while charging, so it doesn’t lock between visitors." />
        <Tip icon={Ticket} title="Invite codes" text="Guests with a code from their host check in without waiting for an answer." />
      </View>
      <Banner tone="info" icon={ShieldCheck} message="For a lobby tablet that runs all day, the DASH Visitors tablet app is still the best setup. This is great as a backup." />
    </Screen>
  );
}

function Tip({ icon: Icon, title, text }: { icon: typeof Lock; title: string; text: string }) {
  return (
    <View style={styles.tip}>
      <Icon size={20} strokeWidth={1.8} color={palette.primaryText} />
      <View style={styles.tipText}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="label" muted>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** The running kiosk: checks the link first (the web wizard's first call), retrying every 10 s offline. */
function RunningKiosk(props: { base: string; companyName: string; linkUrl: string; onLinkDead: () => void; onAskExit: () => void }) {
  const { base, onLinkDead, onAskExit } = props;
  const link = useQuery({
    queryKey: ['kiosk', 'link', base],
    queryFn: ({ signal }) => kioskCheckLink(base, signal),
    retry: false,
    // Like the APK's offline page: try again every 10 s until the service answers.
    refetchInterval: (q) => (q.state.error instanceof KioskError && q.state.error.problem === 'offline' ? 10_000 : false),
    staleTime: Infinity,
    gcTime: 0,
    meta: { persist: false },
  });
  const dead = link.error instanceof KioskError && link.error.problem === 'link';
  useEffect(() => {
    if (dead) onLinkDead();
  }, [dead, onLinkDead]);

  const company = link.data?.companyName || props.companyName;
  if (link.data) return <KioskWizard {...props} companyName={company} />;

  const offline = link.error instanceof KioskError && link.error.problem === 'offline';
  return (
    <Screen header={<KioskHeader companyName={company} onAskExit={onAskExit} />} animate={false}>
      {link.isError && !dead ? (
        <Result
          art={<Art icon={offline ? WifiOff : RefreshCcw} tone="muted" />}
          title={offline ? 'Can’t reach the check-in service' : 'Couldn’t start the kiosk'}
          text={offline ? 'Retrying every 10 seconds. Check the Wi-Fi or mobile data.' : link.error.message}>
          <Button variant="accent" title="Try again" icon={<RefreshCcw />} onPress={() => void link.refetch()} loading={link.isFetching} />
        </Result>
      ) : (
        <Text variant="body" muted align="center" style={styles.loading}>
          Loading…
        </Text>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  tips: { gap: space.md },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  tipText: { flex: 1, minWidth: 0, gap: 2 },
  loading: { paddingTop: space.xxxl },
}));
