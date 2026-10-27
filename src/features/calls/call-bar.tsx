// "Call in progress · Join" — the way back into a call after its ring was closed.
//
// The website's ring has no X: it rings for 45 s and then simply goes (dash.html:8390), and nothing in
// the thread offers the call again. On a phone the ring sheet has an X (and a backdrop), so closing it
// must not lose the call. While a call I was rung for is still going and I am not in it:
//   - <LiveCallBar/>  floats above the tab bar on every screen (mounted once in app/(app)/_layout.tsx),
//                     with Join and its own × (which hides the bar for that call only);
//   - <ThreadCallBar/> sits at the top of that call's chat, and always offers Join.
// Hidden while the ring sheet is up, while I am in a call, and on the call screen.
//
// Whether the call is still going: the server keeps no call list, so the bar asks GET
// /meets/meetings/:id every 15 s (the website's lobby route, meets.js:2088): refused (ended, expired,
// removed) → over; nobody in it twice in a row, once its 45 s of ringing are up → over. `meeting-ended`
// (incoming-call.tsx) ends it at once. An over call becomes "Missed" in the call log (call-log.ts).

import { usePathname, useRouter } from 'expo-router';
import { Phone, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { callsApi, RING_SECONDS } from '@/api/calls';
import { useConversations } from '@/api/chat';
import { isApiError } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { useNow } from '@/features/attendance/use-now';
import { canSeeCalls } from '@/features/calls/access';
import { type CallLogEntry, callLength, callerLine, logHideBar, logOver, useLiveCalls, useRingingCall } from '@/features/calls/call-log';
import { useInCall } from '@/features/calls/call-store';
import { themedStyles } from '@/theme/themed';
import { layout, palette, radius, shadow, space } from '@/theme/tokens';
import { Text, useLayout } from '@/ui';

const CHECK_MS = 15_000;
/** A ring older than this is treated as over even if the room never emptied (a stuck presence). */
const MAX_LIVE_MS = 12 * 60 * 60_000;

/** Opens the call screen for a call I was rung for. */
export function useJoinCall() {
  const router = useRouter();
  return (e: CallLogEntry, title?: string | null) =>
    router.push({ pathname: '/call/[meetingId]', params: { meetingId: e.meetingId, title: title || e.by?.name || e.title || 'Call' } });
}

/** Asks the server whether each live call is still going (see the top of this file). */
function useLiveCallCheck(live: CallLogEntry[], me: string | undefined) {
  const ids = live.map((e) => e.meetingId).join(',');
  const latest = useRef(live);
  useEffect(() => {
    latest.current = live;
  });
  useEffect(() => {
    if (!ids || !me) return;
    let stopped = false;
    const empty = new Map<string, number>();
    const check = async () => {
      for (const e of latest.current) {
        const age = Date.now() - Date.parse(e.at);
        if (age > MAX_LIVE_MS) {
          logOver(e.meetingId);
          continue;
        }
        const r = await callsApi.meeting(e.meetingId);
        if (stopped) return;
        if (isApiError(r)) {
          // Ended, expired, removed or gone. A network error says nothing: ask again next time.
          if (r.status === 403 || r.status === 404 || r.status === 410) logOver(e.meetingId);
          continue;
        }
        const others = (r.participants ?? []).filter((p) => String(p.id) !== String(me));
        if (others.length || age < RING_SECONDS * 1000) {
          empty.delete(e.meetingId);
          continue;
        }
        const n = (empty.get(e.meetingId) ?? 0) + 1;
        empty.set(e.meetingId, n);
        if (n >= 2) logOver(e.meetingId);
      }
    };
    void check();
    const t = setInterval(() => {
      if (AppState.currentState === 'active') void check();
    }, CHECK_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [ids, me]);
}

/**
 * The green Join pill (the bar, the chat's call row, Recent calls). Without `onPress` it is only the
 * look, for a row that is itself the button (a button inside a button is not allowed on the web).
 */
export function JoinPill({ onPress, label = 'Join', a11y }: { onPress?: () => void; label?: string; a11y?: string }) {
  const inner = (
    <>
      <Phone size={16} color={palette.successInk} strokeWidth={2} />
      <Text variant="labelStrong" color={palette.successInk} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </>
  );
  if (!onPress) return <View style={styles.join}>{inner}</View>;
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={a11y ?? label} style={({ pressed }) => [styles.join, pressed && styles.pressed]}>
      {inner}
    </Pressable>
  );
}

function LiveDot() {
  return <View style={styles.dot} />;
}

/** "Priya called · 2m 05s" (how long ago it started ringing). */
function Since({ e, name }: { e: CallLogEntry; name?: string | null }) {
  const now = useNow(1000);
  const who = name || callerLine(e);
  return <>{`${who} · ${callLength((now - Date.parse(e.at)) / 1000)}`}</>;
}

/** Every screen: floats above the tab bar while a call I was rung for is still going. */
export function LiveCallBar() {
  const user = useSession((s) => (s.kind === 'staff' ? s.user : null));
  const tenant = useMyTenant().data;
  const on = canSeeCalls(user, tenant);
  const live = useLiveCalls();
  const ringing = useRingingCall();
  const inCall = useInCall();
  const pathname = usePathname();
  const convs = useConversations(on && live.length > 0).data;
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const join = useJoinCall();
  useLiveCallCheck(on ? live : [], user?.id);

  const e = live.find((x) => !x.hidden && x.meetingId !== ringing && !(x.conversationId && pathname === `/chat/${x.conversationId}`));
  if (!on || !e || inCall || pathname.startsWith('/call/')) return null;
  const conv = e.conversationId ? convs?.find((c) => c.id === e.conversationId) : undefined;
  const group = conv?.type === 'group';
  const title = group ? conv?.name || 'Group call' : e.by?.name || conv?.name || 'A colleague';

  return (
    <Animated.View
      key={e.meetingId}
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.float, { left: gutter, right: gutter, bottom: Math.max(insets.bottom - 4, 10) + layout.tabBar.height + space.sm }]}>
      <View style={[styles.bar, styles.barFloat]}>
        <Pressable
          onPress={() => join(e, title)}
          accessibilityRole="button"
          accessibilityLabel={`Call in progress with ${title}. Join`}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
          <LiveDot />
          <View style={styles.text}>
            <Text variant="labelStrong" numberOfLines={1}>
              Call in progress
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              <Since e={e} name={title} />
            </Text>
          </View>
        </Pressable>
        <JoinPill onPress={() => join(e, title)} a11y={`Join the call with ${title}`} />
        <Pressable onPress={() => logHideBar(e.meetingId)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide this bar. The call stays in the chat." style={styles.close}>
          <X size={16} color={palette.textMuted} strokeWidth={2} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** The top of a chat: Join while a call in it that I was rung for is still going. */
export function ThreadCallBar({ conversationId, title }: { conversationId: string; title: string }) {
  const live = useLiveCalls();
  const inCall = useInCall();
  const join = useJoinCall();
  const e = live.find((x) => x.conversationId === conversationId);
  if (!e || inCall) return null;
  return (
    <View style={[styles.bar, styles.barInline]}>
      <View style={styles.main}>
        <LiveDot />
        <View style={styles.text}>
          <Text variant="labelStrong" numberOfLines={1}>
            Call in progress
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            <Since e={e} />
          </Text>
        </View>
      </View>
      <JoinPill onPress={() => join(e, title)} a11y={`Join the call in ${title}`} />
    </View>
  );
}

const styles = themedStyles(() => ({
  float: { position: 'absolute', zIndex: 900, elevation: 10 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
  barFloat: { paddingRight: space.xxs, ...shadow.float, elevation: 6 },
  barInline: { paddingRight: space.sm, marginTop: space.xs },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingLeft: space.sm, minHeight: 56 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: palette.success },
  join: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.successSoft,
  },
  pressed: { opacity: 0.85 },
  close: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
}));
