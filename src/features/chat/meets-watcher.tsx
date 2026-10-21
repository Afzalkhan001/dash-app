// The always-mounted Meets watcher (website: MeetsCallWatcher + useMessageAlert, dash.html:8612, :8281),
// mounted once in app/(app)/_layout.tsx. It:
//   - owns the one live stream (features/chat/realtime.ts): open while the app is in the foreground and
//     chat is on for this person, closed in the background and on sign-out;
//   - feeds the query cache from the stream: a new message goes into its open thread and bumps its list
//     row; a delete, a member or conversation change refetches; `ready` (every (re)connect) refetches
//     the list, the badge and the open thread, because events missed while away are not replayed;
//   - shows a small tappable notice for a message in a conversation that is not on screen (sender and
//     one line; tap opens the chat) with a light haptic — silent for my own messages, during a call and
//     for the thread on screen, at most one every 2.5 s, like the website's chime;
//   - tells the person when a colleague starts a call: calls are not in the app yet (they need the full
//     app build, docs/port/PLAN.md D3), so the notice says to answer on the DASH website. It never
//     declines for them, so the caller is not told "declined" for someone who simply has no calls.

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { MessageCircle, PhoneIncoming, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addMessageToCache, bumpRowInCache, chatKeys, clearRowUnread, markDeletedInCache, type MeetsMessage } from '@/api/chat';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { canSeeMeets } from '@/features/chat/access';
import { captionOf } from '@/features/chat/format';
import { type ChatEvent, chatBus, startChatStream, stopChatStream } from '@/features/chat/realtime';
import { themedStyles } from '@/theme/themed';
import { palette, radius, shadow, space } from '@/theme/tokens';
import { Avatar, haptic, IconBadge, Text, useLayout } from '@/ui';

type Notice = { key: number; kind: 'message' | 'call'; title: string; body: string; who: string; conversationId: string | null; meetingId?: string };

const NOTICE_MS = 4500;
const ALERT_GAP_MS = 2500;

export function MeetsWatcher() {
  const user = useSession((s) => (s.kind === 'staff' ? s.user : null));
  const tenant = useMyTenant().data;
  const on = canSeeMeets(user, tenant);
  const me = user?.id;
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [notice, setNotice] = useState<Notice | null>(null);
  const lastAlert = useRef(0);
  const onChatScreen = useRef(false);
  useEffect(() => {
    onChatScreen.current = pathname === '/chat';
  }, [pathname]);

  // The stream: on while the app is active and chat is on; off otherwise.
  useEffect(() => {
    if (!on || !me) {
      stopChatStream();
      return;
    }
    if (AppState.currentState !== 'background') startChatStream();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') startChatStream();
      else if (s === 'background') stopChatStream();
    });
    return () => {
      sub.remove();
      stopChatStream();
    };
  }, [on, me]);

  // Stream → cache and notices.
  useEffect(() => {
    if (!on || !me) return;
    const refetchAll = () => {
      void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
      void qc.invalidateQueries({ queryKey: chatKeys.unread(me) });
      if (chatBus.viewing) {
        void qc.invalidateQueries({ queryKey: chatKeys.messages(me, chatBus.viewing) });
        void qc.invalidateQueries({ queryKey: chatKeys.conversation(me, chatBus.viewing) });
      }
    };
    return chatBus.on(({ name, data }: ChatEvent) => {
      const convId: string | null = data && typeof data.conversationId === 'string' ? data.conversationId : null;
      switch (name) {
        case 'ready':
          refetchAll();
          return;
        case 'message': {
          const msg = data as MeetsMessage;
          if (!msg || !msg.id || !convId) return;
          const mine = String(msg.senderId) === String(me);
          const viewing = chatBus.viewing === convId;
          addMessageToCache(qc, me, msg);
          const found = bumpRowInCache(qc, me, msg, !mine && !viewing);
          if (!found) void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
          if (mine || viewing) return;
          void qc.invalidateQueries({ queryKey: chatKeys.unread(me) });
          const now = Date.now();
          if (chatBus.callLive || onChatScreen.current || now - lastAlert.current < ALERT_GAP_MS) return;
          lastAlert.current = now;
          const text = captionOf(msg).replace(/\s+/g, ' ').trim() || (msg.attachment ? `Sent ${msg.attachment.name}` : 'New message');
          haptic.select();
          setNotice({ key: now, kind: 'message', title: msg.senderName || 'New message', body: text, who: msg.senderName || '', conversationId: convId });
          return;
        }
        case 'message-deleted':
          if (convId && typeof data.messageId === 'string') markDeletedInCache(qc, me, convId, data.messageId);
          void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
          void qc.invalidateQueries({ queryKey: chatKeys.unread(me) });
          return;
        case 'read':
          if (convId) clearRowUnread(qc, me, convId, typeof data.at === 'string' ? data.at : null);
          void qc.invalidateQueries({ queryKey: chatKeys.unread(me) });
          return;
        case 'meeting-started':
        case 'meeting-ended':
          // The call was answered elsewhere or is over: take its notice away (the website clears the ring).
          if (typeof data?.meetingId === 'string') setNotice((n) => (n?.kind === 'call' && n.meetingId === data.meetingId ? null : n));
          if (name === 'meeting-started') return;
          void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
          return;
        case 'conversation':
        case 'members':
          void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
          void qc.invalidateQueries({ queryKey: chatKeys.unread(me) });
          if (convId) void qc.invalidateQueries({ queryKey: chatKeys.conversation(me, convId) });
          if (convId && name === 'members') void qc.invalidateQueries({ queryKey: chatKeys.messages(me, convId) });
          return;
        case 'meeting':
          // Incoming calls ring through features/calls IncomingCallWatcher (mounted next to this watcher in
          // app/(app)/_layout.tsx), so no second notice here (integrator pass 3).
          return;
        default:
      }
    });
  }, [on, me, qc]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice((n) => (n?.key === notice.key ? null : n)), notice.kind === 'call' ? 9000 : NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // Sign-out or chat switched off: no notice.
  if (!on || !me || !notice) return null;
  return (
    <ChatNotice
      notice={notice}
      onOpen={() => {
        setNotice(null);
        if (notice.conversationId) router.push(`/chat/${encodeURIComponent(notice.conversationId)}`);
      }}
      onClose={() => setNotice(null)}
    />
  );
}

function ChatNotice({ notice, onOpen, onClose }: { notice: Notice; onOpen: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const call = notice.kind === 'call';
  return (
    <Animated.View
      key={notice.key}
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + space.xs, left: gutter, right: gutter }]}>
      <View style={styles.card}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${notice.title}. ${notice.body}`}
          accessibilityHint={notice.conversationId ? 'Opens the chat' : undefined}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
          {call ? (
            <IconBadge bg={palette.successSoft}>
              <PhoneIncoming size={20} color={palette.successInk} strokeWidth={1.8} />
            </IconBadge>
          ) : notice.who ? (
            <Avatar name={notice.who} size={40} ring={false} />
          ) : (
            <IconBadge bg={palette.primarySoft}>
              <MessageCircle size={20} color={palette.primaryText} strokeWidth={1.8} />
            </IconBadge>
          )}
          <View style={styles.text}>
            <Text variant="labelStrong" numberOfLines={1}>
              {notice.title}
            </Text>
            <Text variant="caption" muted numberOfLines={call ? 2 : 1}>
              {notice.body}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.close}>
          <X size={16} color={palette.textMuted} strokeWidth={2} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  wrap: { position: 'absolute', zIndex: 1000, elevation: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: space.xxs,
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
    ...shadow.float,
    elevation: 6,
  },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingLeft: space.sm },
  pressed: { opacity: 0.92 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
}));
