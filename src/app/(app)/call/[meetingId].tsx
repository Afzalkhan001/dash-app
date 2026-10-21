// The call screen (website MeetsCall, dash.html:7350–7942). Opens full screen from the bottom and can't
// be swiped away (app/(app)/_layout.tsx, route name `call/[meetingId]`).
//   - Installed app with WebRTC, or the web build: the real call (features/calls/engine.ts LiveEngine).
//   - The demo account: the same screen with no media (DemoEngine).
//   - Expo Go: "Available in the installed app" with the call's details, Decline and Close.
// One other person: their tile fills the screen and mine floats in the corner. More: a 2-column grid.
// A screen shared from a computer takes the top (only while the host allows sharing).
// Controls: Mute, Camera, Flip, Leave. Host (•••): Add person, screen-share switch, Remove, End for
// everyone — each that rings or cuts someone off goes through ConfirmSheet + SwipeToConfirm and says
// who is told. Nobody is ever emailed or WhatsApped by a call.

import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, MicOff, MonitorOff, MonitorUp, MoreHorizontal, PhoneOff, SwitchCamera, UserMinus, UserPlus, Video, VideoOff } from 'lucide-react-native';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { callsApi, type CallPerson, useMeeting } from '@/api/calls';
import { type MeetsPerson, useDirectory } from '@/api/chat';
import { isApiError, isDemoSession } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { useNow } from '@/features/attendance/use-now';
import { callSupport, canRemoveFromCall, canSeeCalls, isCallHost } from '@/features/calls/access';
import { activeCall, openCall, releaseCall, useCallState } from '@/features/calls/call-store';
import type { CallState, PeerView } from '@/features/calls/engine';
import { PeerTile, SelfTile, StreamView } from '@/features/calls/tiles';
import { UnavailableCard } from '@/features/calls/unavailable';
import { PeopleList } from '@/features/chat/people-list';
import { themedStyles } from '@/theme/themed';
import { gradient, palette, radius, space } from '@/theme/tokens';
import { Avatar, AvatarStack, Banner, Button, ConfirmSheet, haptic, MenuSheet, Sheet, SummaryCard, Text, toast, useLayout } from '@/ui';

export default function CallScreen() {
  const params = useLocalSearchParams<{ meetingId?: string; title?: string }>();
  const meetingId = String(params.meetingId ?? '');
  const title = params.title ? String(params.title) : null;
  const user = useSession((s) => s.user);
  const tenant = useMyTenant().data;
  const on = canSeeCalls(user, tenant);
  const support = callSupport(isDemoSession());

  if (user && !on) return <Redirect href="/" />;
  if (!meetingId) return <Redirect href="/call" />;
  if (support === 'unavailable') return <UnavailableCall meetingId={meetingId} title={title} />;
  return <InCall meetingId={meetingId} title={title} demo={support === 'demo'} />;
}

// ── Shared chrome ────────────────────────────────────────────────────────────
function CallSurface({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  return (
    <View style={styles.root}>
      <LinearGradient colors={gradient.brandDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.body, { paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.sm, paddingHorizontal: gutter }]}>{children}</View>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text variant="micro" color={palette.onPrimary}>
        {label}
      </Text>
    </View>
  );
}

function RoundControl({
  icon: Icon,
  label,
  onPress,
  active,
  danger,
  disabled,
  a11y,
}: {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  a11y: string;
}) {
  const bg = danger ? palette.danger : active ? palette.onPrimary : palette.frostOnDark;
  const fg = danger ? palette.onPrimary : active ? palette.primary : palette.onPrimary;
  return (
    <View style={[styles.control, disabled ? styles.disabled : null]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ disabled: !!disabled, selected: !!active }}
        style={({ pressed }) => [styles.round, { backgroundColor: bg }, pressed ? styles.pressed : null]}>
        <Icon size={24} color={fg} strokeWidth={1.9} />
      </Pressable>
      <Text variant="caption" color={palette.onPrimaryMuted} numberOfLines={1} align="center">
        {label}
      </Text>
    </View>
  );
}

function KeepAwake() {
  useKeepAwake('dash-call');
  return null;
}

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return <>{h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}</>;
}

const names = (xs: { name?: string | null }[]) => {
  const n = xs.map((x) => x.name || 'Colleague');
  return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`;
};

// ── The call ─────────────────────────────────────────────────────────────────
type Confirm = { kind: 'invite'; person: CallPerson } | { kind: 'remove'; peer: PeerView } | { kind: 'end' } | null;

function InCall({ meetingId, title, demo }: { meetingId: string; title: string | null; demo: boolean }) {
  const router = useRouter();
  const me = useSession((s) => s.user);
  const s = useCallState(meetingId);
  const [menu, setMenu] = useState(false);
  const [removeMenu, setRemoveMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const dir = useDirectory(adding);

  useEffect(() => {
    openCall(meetingId, demo);
    return () => releaseCall(meetingId);
  }, [meetingId, demo]);

  const leave = () => {
    activeCall()?.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/call');
  };

  if (!s) {
    return (
      <CallSurface>
        <View style={styles.center}>
          <ActivityIndicator color={palette.onPrimary} />
        </View>
      </CallSurface>
    );
  }

  const host = isCallHost(s);
  const heading = s.title || title || (s.peers.length === 1 ? s.peers[0]!.name : 'Call');
  const screenPeer = s.screenShareAllowed ? s.peers.find((p) => p.screenStream && p.screenLive) : undefined;
  const already = new Set([...s.peers.map((p) => p.id), ...s.expected.map((p) => p.id), s.self?.id ?? '']);
  const addable = (dir.data ?? []).filter((p) => !already.has(p.id));
  const myName = me?.name || 'You';

  const runConfirm = async () => {
    const e = activeCall();
    if (!e || !confirm) return;
    setBusy(true);
    const err =
      confirm.kind === 'invite' ? await e.invite(confirm.person) : confirm.kind === 'remove' ? await e.remove(confirm.peer.id) : await e.endForEveryone();
    setBusy(false);
    const done = confirm;
    setConfirm(null);
    if (err) {
      haptic.error();
      toast.show(err, 'danger');
      return;
    }
    haptic.success();
    if (done.kind === 'invite') toast.show(`Ringing ${done.person.name || 'them'}`);
    else if (done.kind === 'remove') toast.show(`${done.peer.name} removed from the call`);
  };

  const toggleShare = async () => {
    const e = activeCall();
    if (!e) return;
    const next = !s.screenShareAllowed;
    const err = await e.setScreenShareAllowed(next);
    if (err) toast.show(err, 'danger');
    else toast.show(next ? 'Screen sharing is allowed' : 'Screen sharing is off for everyone');
  };

  const status =
    s.phase === 'joining'
      ? 'Joining…'
      : s.phase !== 'live'
        ? 'Call over'
        : s.peers.length === 0
          ? s.expected.length
            ? `Ringing ${names(s.expected)}…`
            : 'Waiting for others to join'
          : `${s.peers.length + 1} in the call`;

  return (
    <CallSurface>
      {s.phase === 'live' ? <KeepAwake /> : null}

      <View style={styles.top}>
        <View style={styles.topText}>
          <Text variant="heading" color={palette.onPrimary} numberOfLines={1}>
            {heading}
          </Text>
          <Text variant="label" color={palette.onPrimaryMuted} numberOfLines={2} accessibilityLiveRegion="polite">
            {status}
            {s.phase === 'live' && s.liveAt && s.peers.length ? (
              <>
                {' · '}
                <Elapsed since={s.liveAt} />
              </>
            ) : null}
          </Text>
          <View style={styles.chips}>
            {host ? <Chip label="HOST" /> : null}
            {demo ? <Chip label="DEMO · NO SOUND SENT" /> : null}
          </View>
        </View>
        {host && s.phase === 'live' ? (
          <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Host controls" hitSlop={6} style={styles.topBtn}>
            <MoreHorizontal size={22} color={palette.onPrimary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {s.dead.length ? (
        <Banner
          tone="danger"
          title="No audio or video is flowing"
          message="The devices couldn’t find a route to each other, so nothing was sent. It isn’t your microphone. Ask whoever runs DASH to set up a relay (TURN) server."
        />
      ) : null}
      {s.notice ? <Banner tone="info" message={s.notice} action={{ label: 'Dismiss', onPress: () => activeCall()?.dismissNotice() }} /> : null}

      <View style={styles.stage}>
        {s.phase === 'ended' || s.phase === 'error' ? (
          <Ended state={s} onClose={leave} onChat={s.conversationId ? () => router.replace({ pathname: '/chat/[id]', params: { id: s.conversationId! } }) : undefined} />
        ) : s.phase === 'joining' ? (
          <View style={styles.center}>
            <Avatar name={heading} size={96} ring={false} />
            <ActivityIndicator color={palette.onPrimary} />
            <Text variant="label" color={palette.onPrimaryMuted} align="center">
              {demo ? 'Joining the demo call…' : 'Asking for the microphone, then joining…'}
            </Text>
          </View>
        ) : (
          <Tiles state={s} screenPeer={screenPeer} myName={myName} />
        )}
      </View>

      {s.phase === 'live' || s.phase === 'joining' ? (
        <View style={styles.controls}>
          <RoundControl icon={s.mic ? Mic : MicOff} label={s.mic ? 'Mute' : 'Unmute'} active={!s.mic} a11y={s.mic ? 'Mute your microphone' : 'Unmute your microphone'} disabled={s.phase !== 'live'} onPress={() => activeCall()?.toggleMic()} />
          <RoundControl icon={s.cam ? Video : VideoOff} label="Camera" active={s.cam} a11y={s.cam ? 'Turn your camera off' : 'Turn your camera on'} disabled={s.phase !== 'live'} onPress={() => void activeCall()?.toggleCam()} />
          <RoundControl icon={SwitchCamera} label="Flip" a11y="Switch between front and back camera" disabled={!s.cam} onPress={() => activeCall()?.flipCam()} />
          <RoundControl icon={PhoneOff} label="Leave" danger a11y="Leave the call" onPress={leave} />
        </View>
      ) : null}

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Host controls"
        subtitle="Only you, the host, see these."
        items={[
          { key: 'add', label: 'Add person', hint: 'Rings someone into this call only', icon: UserPlus, onPress: () => setAdding(true) },
          {
            key: 'share',
            label: s.screenShareAllowed ? 'Turn off screen sharing' : 'Allow screen sharing',
            hint: s.screenShareAllowed ? 'Nobody’s shared screen is shown' : 'People on a computer can share their screen',
            icon: s.screenShareAllowed ? MonitorOff : MonitorUp,
            onPress: () => void toggleShare(),
          },
          { key: 'remove', label: 'Remove someone', hint: s.peers.length ? 'They can’t rejoin this call' : 'Nobody else is here yet', icon: UserMinus, disabled: !s.peers.length, onPress: () => setRemoveMenu(true) },
          { key: 'end', label: 'End for everyone', hint: 'Cannot be undone', icon: PhoneOff, tone: 'danger', onPress: () => setConfirm({ kind: 'end' }) },
        ]}
      />

      <MenuSheet
        visible={removeMenu}
        onClose={() => setRemoveMenu(false)}
        title="Remove someone"
        items={s.peers
          .filter((p) => canRemoveFromCall(s, p.id, s.self?.id))
          .map((p) => ({ key: p.id, label: p.name, hint: p.dept ?? undefined, icon: UserMinus, tone: 'danger' as const, onPress: () => setConfirm({ kind: 'remove', peer: p }) }))}
      />

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add person" subtitle="They ring now and join this call only, not the chat.">
        <PeopleList
          people={addable}
          loading={dir.isLoading}
          error={dir.isError ? dir.error?.message ?? 'Couldn’t load people.' : null}
          onRetry={() => void dir.refetch()}
          selected={[]}
          multi={false}
          onPick={(p: MeetsPerson) => {
            setAdding(false);
            setConfirm({ kind: 'invite', person: { id: p.id, name: p.name, dept: p.dept, email: p.email, jobTitle: p.jobTitle } });
          }}
          emptyText="Everyone is already here or ringing."
        />
      </Sheet>

      <ConfirmSheet
        visible={confirm?.kind === 'invite'}
        onClose={() => setConfirm(null)}
        title={`Ring ${confirm?.kind === 'invite' ? confirm.person.name : ''}?`}
        subtitle="They can join this call. They don’t get the chat or its history."
        from={{ title: heading, subtitle: status, avatar: { name: heading } }}
        to={{ title: confirm?.kind === 'invite' ? confirm.person.name || 'Colleague' : '', subtitle: 'Rings now', avatar: { name: confirm?.kind === 'invite' ? confirm.person.name || '' : '' } }}
        confirmLabel="Swipe to ring"
        onConfirm={runConfirm}
        loading={busy}
        note={`Rings ${confirm?.kind === 'invite' ? confirm.person.name : 'them'} in DASH for 45 seconds, and tells the people in the call. No email or WhatsApp is sent.`}
      />

      <ConfirmSheet
        visible={confirm?.kind === 'remove'}
        onClose={() => setConfirm(null)}
        title={`Remove ${confirm?.kind === 'remove' ? confirm.peer.name : ''}?`}
        subtitle="They are cut off now and can’t rejoin or be added back to this call."
        confirmLabel="Swipe to remove"
        onConfirm={runConfirm}
        loading={busy}
        note={`${confirm?.kind === 'remove' ? confirm.peer.name : 'They'} sees that the host removed them, and the others see them leave. No email or WhatsApp is sent.`}>
        <SummaryCard rows={[{ label: 'Call', value: heading }, { label: 'Person', value: confirm?.kind === 'remove' ? confirm.peer.name : '' }]} />
      </ConfirmSheet>

      <ConfirmSheet
        visible={confirm?.kind === 'end'}
        onClose={() => setConfirm(null)}
        title="End the call for everyone?"
        subtitle="Everyone is disconnected. This can’t be undone; a new call has to be started."
        confirmLabel="Swipe to end for everyone"
        onConfirm={runConfirm}
        loading={busy}
        note="Everyone in the call, and everyone in the chat it came from, sees that the call ended. No email or WhatsApp is sent.">
        <SummaryCard rows={[{ label: 'Call', value: heading }, { label: 'In the call now', value: String(s.peers.length + 1) }, ...(s.expected.length ? [{ label: 'Still ringing', value: names(s.expected) }] : [])]} />
      </ConfirmSheet>
    </CallSurface>
  );
}

function Tiles({ state: s, screenPeer, myName }: { state: CallState; screenPeer?: PeerView; myName: string }) {
  const dead = new Set(s.dead);
  if (s.peers.length === 0) {
    return (
      <View style={styles.center}>
        {s.expected.length ? <AvatarStack people={s.expected.map((p) => ({ name: p.name || 'Colleague' }))} size={72} max={3} /> : <Avatar name={myName} size={96} ring={false} />}
        <Text variant="title" color={palette.onPrimary} align="center" numberOfLines={2}>
          {s.expected.length ? `Ringing ${names(s.expected)}` : 'You’re the only one here'}
        </Text>
        <Text variant="label" color={palette.onPrimaryMuted} align="center">
          {s.expected.length ? 'Their DASH is showing the call now.' : s.isHost ? 'Add someone from the ••• menu.' : 'Others appear as they join.'}
        </Text>
        {s.cam ? <SelfTile stream={s.selfStream} cam={s.cam} mic={s.mic} name={myName} demo={s.demo} compact /> : null}
      </View>
    );
  }
  const screen = screenPeer ? (
    <View style={styles.screenStage} accessible accessibilityLabel={`${screenPeer.name} is sharing their screen`}>
      <StreamView stream={screenPeer.screenStream} />
      <View style={styles.screenLabel}>
        <Text variant="caption" color={palette.onPrimary} numberOfLines={1}>
          {`${screenPeer.name} · screen`}
        </Text>
      </View>
    </View>
  ) : null;
  if (s.peers.length === 1) {
    const p = s.peers[0]!;
    return (
      <View style={styles.one}>
        {screen}
        <PeerTile peer={p} dead={dead.has(p.id)} demo={s.demo} big />
        <View style={styles.pip}>
          <SelfTile stream={s.selfStream} cam={s.cam} mic={s.mic} name={myName} demo={s.demo} compact />
        </View>
      </View>
    );
  }
  const all: ({ self: true } | { self: false; peer: PeerView })[] = [{ self: true }, ...s.peers.map((peer) => ({ self: false as const, peer }))];
  const rows: (typeof all)[] = [];
  for (let i = 0; i < all.length; i += 2) rows.push(all.slice(i, i + 2));
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
      {screen}
      {rows.map((row, i) => (
        <View key={i} style={styles.gridRow}>
          {row.map((t) =>
            t.self ? (
              <SelfTile key="self" stream={s.selfStream} cam={s.cam} mic={s.mic} name={myName} demo={s.demo} />
            ) : (
              <PeerTile key={t.peer.id} peer={t.peer} dead={dead.has(t.peer.id)} demo={s.demo} />
            ),
          )}
          {row.length === 1 ? <View style={styles.flex} /> : null}
        </View>
      ))}
    </ScrollView>
  );
}

function Ended({ state: s, onClose, onChat }: { state: CallState; onClose: () => void; onChat?: () => void }) {
  const failed = s.phase === 'error';
  return (
    <View style={styles.center}>
      <View style={styles.endIcon}>
        <PhoneOff size={32} color={palette.onPrimary} strokeWidth={1.8} />
      </View>
      <Text variant="title" color={palette.onPrimary} align="center">
        {failed ? 'You’re out of the call' : 'Call ended'}
      </Text>
      {s.error ? (
        <Text variant="body" color={palette.onPrimaryMuted} align="center">
          {s.error}
        </Text>
      ) : null}
      <View style={styles.endActions}>
        {onChat ? <Button title="Open the chat" variant="onPrimary" onPress={onChat} /> : null}
        <Button title="Close" variant="accent" onPress={onClose} />
      </View>
    </View>
  );
}

// ── Expo Go (no WebRTC) ──────────────────────────────────────────────────────
function UnavailableCall({ meetingId, title }: { meetingId: string; title: string | null }) {
  const router = useRouter();
  const m = useMeeting(meetingId);
  const [confirm, setConfirm] = useState<'decline' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const info = m.data?.meeting;
  const host = info?.host?.name || title || 'A colleague';
  const heading = info?.title || title || host;
  const inCall = m.data?.participants ?? [];

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/call');
  };

  const run = async () => {
    setBusy(true);
    const r = confirm === 'end' ? await callsApi.end(meetingId) : await callsApi.decline(meetingId);
    setBusy(false);
    setConfirm(null);
    if (isApiError(r)) {
      toast.show(r.error, 'danger');
      return;
    }
    haptic.success();
    toast.show(confirm === 'end' ? 'Call ended for everyone' : `Declined. ${host} sees that you declined.`);
    close();
  };

  return (
    <CallSurface>
      <View style={styles.stage}>
        <View style={styles.center}>
          <Avatar name={heading} size={96} ring={false} />
          <Text variant="title" color={palette.onPrimary} align="center" numberOfLines={2}>
            {heading}
          </Text>
          <Text variant="label" color={palette.onPrimaryMuted} align="center">
            {m.isPending ? 'Looking up the call…' : m.isError ? m.error?.message ?? 'This call isn’t available.' : inCall.length ? `In the call: ${names(inCall)}` : 'Nobody has joined yet'}
          </Text>
          <UnavailableCard onDark />
        </View>
      </View>
      <View style={styles.endActions}>
        {info && !info.isHost ? <Button title="Decline" variant="danger" icon={<PhoneOff />} onPress={() => setConfirm('decline')} /> : null}
        {info?.isHost ? <Button title="End for everyone" variant="danger" icon={<PhoneOff />} onPress={() => setConfirm('end')} /> : null}
        <Button title="Close" variant="accent" onPress={close} />
      </View>
      <ConfirmSheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'end' ? 'End the call for everyone?' : `Decline ${host}’s call?`}
        subtitle={confirm === 'end' ? 'Everyone is disconnected. This can’t be undone.' : 'You can still join on the DASH website while it rings.'}
        confirmLabel={confirm === 'end' ? 'Swipe to end for everyone' : 'Swipe to decline'}
        onConfirm={run}
        loading={busy}
        note={confirm === 'end' ? 'Everyone in the call and in its chat sees that it ended. No email or WhatsApp is sent.' : `Only ${host} is told, inside DASH. No email or WhatsApp is sent.`}
      />
    </CallSurface>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: palette.primaryDeep },
  body: { flex: 1, gap: space.sm },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  topText: { flex: 1, minWidth: 0, gap: 2 },
  topBtn: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.frostOnDark },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs, marginTop: space.xxs },
  chip: { paddingHorizontal: space.xs, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: palette.frostOnDark, borderWidth: 1, borderColor: palette.frostEdgeOnDark },
  stage: { flex: 1, minHeight: 0 },
  one: { flex: 1, gap: space.sm },
  pip: { position: 'absolute', top: space.sm, right: space.sm },
  grid: { gap: space.sm, paddingBottom: space.sm },
  gridRow: { flexDirection: 'row', gap: space.sm },
  screenStage: { height: 220, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: palette.frostOnDark },
  screenLabel: { position: 'absolute', left: space.xs, bottom: space.xs, paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: palette.overlay },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingTop: space.xs },
  control: { flex: 1, maxWidth: 88, alignItems: 'center', gap: space.xxs },
  round: { width: 60, height: 60, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  endIcon: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.danger },
  endActions: { gap: space.sm, alignSelf: 'stretch' },
}));
