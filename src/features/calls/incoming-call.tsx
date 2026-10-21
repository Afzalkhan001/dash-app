// The ring (website MeetsCallWatcher + MeetsIncomingCall, dash.html:8380, :8612).
//   - A `meeting` event from the live stream (features/chat/realtime.ts chatBus) rings: caller, team,
//     title and a 45 s countdown, with a haptic pulse instead of the website's ringtone.
//   - `meeting-started` (I answered on another device) and `meeting-ended` take it away; a ring that
//     simply runs out sends nothing, like the website.
//   - Answer: "Swipe to answer" opens the call screen. In Expo Go there is no answer, only
//     "Available in the installed app", Decline and Not now — so the caller is told, not left waiting.
//   - Decline: ConfirmSheet + SwipeToConfirm; POST /decline tells the caller (nothing is written).
//   - Silent while a call is open (meetsBus.callLive).
//
// <IncomingCallWatcher/> is meant to be mounted ONCE for the signed-in area (next to <MeetsWatcher/>,
// see HANDOFF.md). It may also sit on a screen (the Calls screen does, so the demo ring works before
// that): only the first one mounted shows the ring, so two never stack.

import { useRouter } from 'expo-router';
import { PhoneOff } from 'lucide-react-native';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { callsApi, type RingEvent, RING_SECONDS } from '@/api/calls';
import { isApiError, isDemoSession } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { callsDemoEvents, ringFromColleague } from '@/demo/fixtures/calls';
import { useNow } from '@/features/attendance/use-now';
import { canSeeCalls, callSupport } from '@/features/calls/access';
import { activeCall } from '@/features/calls/call-store';
import { UnavailableCard } from '@/features/calls/unavailable';
import { chatBus } from '@/features/chat/realtime';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Avatar, Button, ConfirmSheet, haptic, Sheet, SwipeToConfirm, Text, toast } from '@/ui';

type Ring = RingEvent & { receivedAt: number; test?: boolean };

// ── Which watcher shows the ring (the first mounted) ─────────────────────────
const watchers: string[] = [];
const watcherListeners = new Set<() => void>();
const notifyWatchers = () => watcherListeners.forEach((fn) => fn());
function registerWatcher(id: string) {
  watchers.push(id);
  notifyWatchers();
  return () => {
    const i = watchers.indexOf(id);
    if (i !== -1) watchers.splice(i, 1);
    notifyWatchers();
  };
}
const subscribeWatchers = (fn: () => void) => {
  watcherListeners.add(fn);
  return () => {
    watcherListeners.delete(fn);
  };
};

// ── Local rings (the "Test call alert") ──────────────────────────────────────
const localRings = new Set<(r: Ring) => void>();

/**
 * The website's "Test call alert" (fireTestCallAlert, dash.html:8509): shows the ring so the person
 * knows what a call looks like. In the demo it is a real demo call from Priya Sharma that can be
 * answered; otherwise it is a sample that answers nothing and tells nobody.
 */
export function testCallAlert(myName?: string | null) {
  if (isDemoSession()) {
    ringFromColleague();
    return;
  }
  const r: Ring = {
    conversationId: null,
    meetingId: 'test',
    title: 'Test call',
    startedBy: { id: 'test', name: myName ? `${myName} (test)` : 'Test call' },
    receivedAt: Date.now(),
    test: true,
  };
  for (const fn of [...localRings]) fn(r);
}

export function IncomingCallWatcher() {
  const id = useId();
  const user = useSession((s) => (s.kind === 'staff' ? s.user : null));
  const tenant = useMyTenant().data;
  const on = canSeeCalls(user, tenant);
  const me = user?.id;
  const primary = useSyncExternalStore(
    subscribeWatchers,
    () => watchers[0] === id,
    () => false,
  );
  const [ring, setRing] = useState<Ring | null>(null);

  useEffect(() => registerWatcher(id), [id]);

  // The stream (and the demo's stand-in) → the ring.
  useEffect(() => {
    if (!on || !me || !primary) return;
    const take = (name: string, data: any) => {
      if (name === 'meeting') {
        if (!data?.meetingId || chatBus.callLive || activeCall()) return;
        if (data.startedBy?.id && String(data.startedBy.id) === String(me)) return;
        haptic.warning();
        setRing({ ...(data as RingEvent), receivedAt: Date.now() });
        return;
      }
      // I started a call on another device: no ring over it (dash.html:8656 clears any ring).
      if (name === 'meeting-started') {
        setRing((r) => (r && !r.test ? null : r));
        return;
      }
      if (name === 'meeting-ended' && typeof data?.meetingId === 'string') {
        setRing((r) => (r && r.meetingId === data.meetingId ? null : r));
      }
    };
    const offBus = chatBus.on(({ name, data }) => take(String(name), data));
    const offDemo = callsDemoEvents.on(take);
    const onLocal = (r: Ring) => {
      haptic.warning();
      setRing(r);
    };
    localRings.add(onLocal);
    return () => {
      offBus();
      offDemo();
      localRings.delete(onLocal);
    };
  }, [on, me, primary]);

  if (!on || !me || !primary || !ring) return null;
  return <RingSheets key={ring.meetingId} ring={ring} onDone={() => setRing(null)} />;
}

function RingSheets({ ring, onDone }: { ring: Ring; onDone: () => void }) {
  const router = useRouter();
  const support = callSupport(isDemoSession());
  const [step, setStep] = useState<'ring' | 'decline'>('ring');
  const [busy, setBusy] = useState(false);
  const who = ring.startedBy?.name || 'A colleague';

  // Gives up after 45 s, sending nothing (dash.html:8390).
  useEffect(() => {
    const left = RING_SECONDS * 1000 - (Date.now() - ring.receivedAt);
    const t = setTimeout(onDone, Math.max(0, left));
    return () => clearTimeout(t);
  }, [ring.receivedAt, onDone]);

  // A haptic pulse while it rings (Expo Go has no tone generator).
  useEffect(() => {
    if (step !== 'ring') return;
    const t = setInterval(() => haptic.warning(), 2200);
    return () => clearInterval(t);
  }, [step]);

  const answer = () => {
    if (ring.test) {
      onDone();
      toast.show('That was a test. Real calls ring like this while DASH is open.', 'info');
      return;
    }
    onDone();
    router.push({ pathname: '/call/[meetingId]', params: { meetingId: ring.meetingId, title: who } });
  };

  const decline = async () => {
    if (ring.test) {
      onDone();
      toast.show('Test finished. Nobody was told.', 'info');
      return;
    }
    setBusy(true);
    const r = await callsApi.decline(ring.meetingId);
    setBusy(false);
    onDone();
    if (isApiError(r)) toast.show(r.error, 'danger');
    else toast.show(`Declined. ${who} sees that you declined.`);
  };

  return (
    <>
      <Sheet visible={step === 'ring'} onClose={onDone} title="Incoming call" floatingClose>
        <View style={styles.hero}>
          <Avatar name={who} size={72} ring={false} />
          <Text variant="title" align="center" numberOfLines={2}>
            {who}
          </Text>
          {ring.startedBy?.dept ? (
            <Text variant="label" muted align="center">
              {ring.startedBy.dept}
            </Text>
          ) : null}
          {ring.title ? (
            <Text variant="label" muted align="center" numberOfLines={2}>
              {ring.title}
            </Text>
          ) : null}
          <Countdown since={ring.receivedAt} />
        </View>
        {support === 'unavailable' && !ring.test ? (
          <View style={styles.actions}>
            <UnavailableCard />
            <Button title="Decline" variant="danger" icon={<PhoneOff />} onPress={() => setStep('decline')} />
            <Button title="Not now" variant="ghost" onPress={onDone} />
          </View>
        ) : (
          <View style={styles.actions}>
            <SwipeToConfirm label={ring.test ? 'Swipe to answer the test' : 'Swipe to answer'} onConfirm={answer} />
            <Button title="Decline" variant="danger" icon={<PhoneOff />} onPress={() => setStep('decline')} />
          </View>
        )}
        <Text variant="caption" muted align="center">
          {ring.test ? 'A sample call. Answering or declining tells nobody.' : `${who} sees whether you answer or decline.${support === 'demo' ? ' Demo: no sound or video is sent.' : ''}`}
        </Text>
      </Sheet>

      <ConfirmSheet
        visible={step === 'decline'}
        onClose={() => setStep('ring')}
        title={`Decline ${who}’s call?`}
        subtitle="The ring stops on this phone."
        from={{ title: 'You', subtitle: 'Declining', avatar: { name: 'You' } }}
        to={{ title: who, subtitle: 'Is told you declined', avatar: { name: who } }}
        confirmLabel="Swipe to decline"
        onConfirm={decline}
        loading={busy}
        note={ring.test ? 'A test: nobody is told.' : `Only ${who} is told, inside DASH. No email or WhatsApp is sent.`}
      />
    </>
  );
}

function Countdown({ since }: { since: number }) {
  const now = useNow(1000);
  const left = Math.max(0, RING_SECONDS - Math.floor((now - since) / 1000));
  return (
    <Text variant="caption" color={palette.successInk} align="center" accessibilityLiveRegion="polite">
      {`Ringing · ${left} s`}
    </Text>
  );
}

const styles = themedStyles(() => ({
  hero: { alignItems: 'center', gap: space.xxs, paddingVertical: space.sm },
  actions: { gap: space.sm },
}));
