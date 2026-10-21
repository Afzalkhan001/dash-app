// More › Notifications (src/app/(app)/admin/push). Whether this phone gets DASH notifications, what
// they are about, and a way to try one.
//
//   Installed app   Off → "Turn on" opens an explain sheet first, then the phone's prompt.
//                   On  → "Send a test notification" (POST /push/test, the whole chain).
//                   Blocked → "Open settings" (the phone's own page for DASH).
//   Expo Go         UNAVAILABLE_IN_EXPO_GO (remote push does not exist there).
//   Demo            sample notifications for the active role, sent to this phone as local
//                   notifications (Expo Go included), each opening the screen it is about.
//   Web preview     the same samples, shown as a banner inside the page.
//
// Nothing here messages anyone else: every notification goes to this phone only.

import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { Bell, BellOff, BellRing, ClipboardCheck, DoorOpen, type LucideIcon, Send, Settings, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { isDemoSession, unwrap } from '@/api/client';
import { getDemoPushSamples, type PushKind, type PushSample } from '@/api/push';
import { canUsePush } from '@/features/push/access';
import { usePushBridge } from '@/features/push/bridge';
import { UNAVAILABLE_IN_EXPO_GO } from '@/lib/capabilities';
import {
  dismissWebPreview,
  openPushSettings,
  openWebPreview,
  PUSH_CHANNELS,
  pushSupport,
  refreshPushPermission,
  requestPushPermission,
  sendDemoNotification,
  sendPushTest,
  usePushState,
} from '@/lib/push';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import type { ModuleKey } from '@/theme/tokens';
import { palette, radius, space } from '@/theme/tokens';
import { Banner, Button, haptic, ListCard, ListRow, ModuleBadge, NavHeader, Screen, Section, Sheet, shouldStack, Skeleton, StatusPill, Text, toast, useLayout } from '@/ui';

const KIND_LOOK: Record<PushKind | 'default', { icon: LucideIcon; module: ModuleKey }> = {
  approvals: { icon: ClipboardCheck, module: 'tasks' },
  visitors: { icon: DoorOpen, module: 'visitors' },
  updates: { icon: Bell, module: 'news' },
  default: { icon: Sparkles, module: 'profile' },
};

function StateRow() {
  const permission = usePushState((s) => s.permission);
  const registered = usePushState((s) => s.registered);
  const support = pushSupport();
  if (permission === 'unknown') return <ListRow left={<Skeleton width={40} height={40} radius={radius.sm} />} title="Checking this phone…" />;
  const on = permission === 'granted';
  const blocked = permission === 'denied';
  const title = support === 'web' ? 'Phone app only' : support === 'expo-go' ? UNAVAILABLE_IN_EXPO_GO : on ? 'On for this phone' : blocked ? 'Blocked on this phone' : 'Off';
  const subtitle =
    support === 'web'
      ? 'Notifications arrive on the DASH phone app, not in a browser.'
      : support === 'expo-go'
        ? 'Expo Go can’t receive DASH notifications. Install the DASH app to get them.'
        : support === 'simulator'
          ? 'This is a simulator. Use a real phone to receive notifications.'
          : on
            ? support === 'demo'
              ? 'Demo: samples arrive on this phone. Nothing is sent to anyone else.'
              : registered
                ? 'DASH will tell you when something needs you.'
                : 'Connecting this phone to DASH…'
            : blocked
              ? 'Notifications for DASH are turned off in your phone’s settings.'
              : 'Turn them on to hear about visitors, approvals and tasks.';
  return (
    <ListRow
      left={<ModuleBadge module="security" icon={on ? BellRing : BellOff} />}
      title={title}
      subtitle={subtitle}
      subtitleLines={3}
      right={support === 'remote' || support === 'demo' ? <StatusPill label={on ? 'On' : blocked ? 'Blocked' : 'Off'} tone={on ? 'done' : blocked ? 'failed' : 'neutral'} /> : undefined}
    />
  );
}

function ExplainSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const busy = usePushState((s) => s.busy);
  const turnOn = async () => {
    const p = await requestPushPermission();
    onClose();
    if (p === 'granted') {
      haptic.success();
      toast.show('Notifications are on');
    } else if (p === 'denied') toast.show('Notifications stay off. You can change this in your phone’s settings.', 'info');
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Turn on notifications?"
      subtitle="Your phone will ask you next. Here is what DASH sends."
      footer={<Button title="Continue" icon={<Bell />} loading={busy} onPress={() => void turnOn()} />}>
      <ListCard>
        <ListRow left={<ModuleBadge module="visitors" icon={DoorOpen} />} title="A visitor is at reception" subtitle="So nobody waits at the desk for you." subtitleLines={2} />
        <ListRow left={<ModuleBadge module="tasks" icon={ClipboardCheck} />} title="Something waits on you" subtitle="Tasks, tickets, claims and bills to approve." subtitleLines={2} />
        <ListRow left={<ModuleBadge module="security" icon={ShieldCheck} />} title="Never your codes" subtitle="Sign-in and confirmation codes stay in email and WhatsApp." subtitleLines={2} />
      </ListCard>
    </Sheet>
  );
}

function DemoSamples() {
  const q = useQuery({ queryKey: ['push', 'demo-samples'], queryFn: () => unwrap(getDemoPushSamples()), meta: { persist: false } });
  const permission = usePushState((s) => s.permission);
  const support = pushSupport();
  const [sending, setSending] = useState<string | null>(null);
  // On a narrow phone or with large text the Send button goes under the text, so the title isn't squeezed.
  const stack = shouldStack(useLayout(), { below: 'compact' });
  const needsPermission = support === 'demo' && permission !== 'granted';
  const send = async (s: PushSample) => {
    setSending(s.id);
    try {
      const r = await sendDemoNotification(s);
      toast.show(r.message, r.ok ? 'success' : 'danger');
    } finally {
      setSending(null);
    }
  };
  return (
    <Section title="Try a sample" overline="Demo">
      <Text variant="label" muted>
        {support === 'web'
          ? 'Each sample appears at the top of this page in 3 seconds. Tap it to open the screen it is about.'
          : 'Each sample arrives on this phone in 3 seconds. Lock the phone or leave DASH to see it as a real notification, then tap it.'}
      </Text>
      {q.data ? (
        <ListCard>
          {q.data.map((s) => {
            const look = KIND_LOOK[s.kind] ?? KIND_LOOK.default;
            return (
              <ListRow
                key={s.id}
                left={<ModuleBadge module={look.module} icon={look.icon} />}
                title={s.title}
                subtitle={s.body}
                subtitleLines={2}
                numberOfLines={2}
                stackRight={stack}
                right={<Button size="sm" variant="ghost" title="Send" icon={<Send />} loading={sending === s.id} disabled={needsPermission || (!!sending && sending !== s.id)} onPress={() => void send(s)} />}
              />
            );
          })}
        </ListCard>
      ) : q.isError ? (
        <Banner tone="danger" message="Couldn’t load the samples." action={{ label: 'Try again', onPress: () => void q.refetch() }} />
      ) : (
        <Skeleton height={140} radius={radius.lg} />
      )}
      {needsPermission ? <Text variant="caption" muted>Turn notifications on above to send a sample.</Text> : null}
    </Section>
  );
}

function WebPreview() {
  const p = usePushState((s) => s.webPreview);
  if (!p) return null;
  const look = KIND_LOOK[p.kind] ?? KIND_LOOK.default;
  return (
    <Pressable
      onPress={openWebPreview}
      accessibilityRole="button"
      accessibilityLabel={`Notification: ${p.title}. ${p.body}`}
      accessibilityHint="Opens the screen it is about"
      style={({ pressed }) => [styles.preview, pressed && styles.previewPressed]}>
      <ModuleBadge module={look.module} icon={look.icon} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" muted>
          DASH · now
        </Text>
        <Text variant="bodyStrong" numberOfLines={2}>
          {p.title}
        </Text>
        <Text variant="label" muted numberOfLines={2}>
          {p.body}
        </Text>
      </View>
      <Button size="sm" variant="text" title="Close" onPress={dismissWebPreview} />
    </Pressable>
  );
}

export function NotificationsScreen() {
  usePushBridge();
  const access = useAccess();
  const allowed = canUsePush(access);
  const permission = usePushState((s) => s.permission);
  const serverMissing = usePushState((s) => s.serverMissing);
  const [explain, setExplain] = useState(false);
  const [testing, setTesting] = useState(false);
  const support = pushSupport();
  const demo = isDemoSession();

  useEffect(() => {
    void refreshPushPermission();
  }, []);

  if (!allowed) return <Redirect href="/" />;

  const canTurnOn = (support === 'remote' || support === 'demo') && permission === 'undetermined';
  const blocked = (support === 'remote' || support === 'demo') && permission === 'denied';
  const test = async () => {
    setTesting(true);
    try {
      const r = await sendPushTest();
      toast.show(r.message, r.ok ? 'success' : 'danger');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen header={<NavHeader title="Notifications" />} onRefresh={() => refreshPushPermission()}>
      <WebPreview />
      <ListCard>
        <StateRow />
      </ListCard>

      {canTurnOn ? <Button title="Turn on notifications" icon={<Bell />} onPress={() => setExplain(true)} /> : null}
      {blocked ? (
        <Banner
          tone="warning"
          title="Notifications are blocked"
          message="Open your phone’s settings for DASH and allow notifications, then come back here."
          action={{ label: 'Open settings', onPress: openPushSettings }}
        />
      ) : null}
      {support === 'expo-go' && !demo ? (
        <Banner tone="info" title={UNAVAILABLE_IN_EXPO_GO} message="Everything else in DASH works here. Notifications need the DASH app from your company’s install link." />
      ) : null}
      {serverMissing ? (
        <Banner tone="warning" title="DASH isn’t sending notifications yet" message="Your phone is ready. You’ll start getting them once your admin switches them on." />
      ) : null}
      {support === 'remote' && permission === 'granted' && !demo ? (
        <Button variant="ghost" title="Send a test notification" icon={<Send />} loading={testing} onPress={() => void test()} />
      ) : null}

      {demo ? <DemoSamples /> : null}

      <Section title="What you’ll hear about">
        <ListCard>
          {PUSH_CHANNELS.filter((c) => c.id !== 'default').map((c) => {
            const look = KIND_LOOK[c.id];
            return <ListRow key={c.id} left={<ModuleBadge module={look.module} icon={look.icon} />} title={c.name} subtitle={c.description} subtitleLines={2} />;
          })}
        </ListCard>
        {Platform.OS === 'android' && (support === 'remote' || support === 'demo') ? (
          <Button variant="text" title="Sound and vibration for each kind" icon={<Settings />} onPress={openPushSettings} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </Section>

      <Text variant="caption" muted style={{ paddingHorizontal: space.xs }}>
        Sign-in and confirmation codes are never sent as notifications. Signing out stops notifications on this phone.
      </Text>

      <ExplainSheet visible={explain} onClose={() => setExplain(false)} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  previewPressed: { backgroundColor: palette.pressedTint },
}));
