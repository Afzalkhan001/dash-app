// Chat: my conversations, newest activity first (website MeetsHub list, dash.html:10192). A search
// pill filters on the phone by conversation name and the other members' names (:9940). Each row: the
// initials avatar, the name, a one-line preview ("Priya: …", "Message deleted", "You left this
// group"), the time and an unread count (99+ at most). The + opens "New chat" / "New group".
// Live updates come from the stream (features/chat/meets-watcher.tsx), and pull to refresh reloads.

import { Redirect, useRouter } from 'expo-router';
import { MessageCircle, MessageCirclePlus, Plus, Search, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type ConversationRow, useChatHealth, useConversations } from '@/api/chat';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeMeets } from '@/features/chat/access';
import { countLabel, previewLine, rowTime } from '@/features/chat/format';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, EmptyState, ErrorState, MenuSheet, NavHeader, PillField, Screen, SkeletonList, Text } from '@/ui';

function matches(c: ConversationRow, q: string) {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return [c.name, ...(c.others ?? []).map((o) => o.name)].some((v) => String(v || '').toLowerCase().includes(n));
}

export default function ChatListScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const tenant = useMyTenant().data;
  const on = canSeeMeets(user, tenant);
  const today = useTodayIst();
  const list = useConversations(on);
  const health = useChatHealth(on);
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);

  // Re-check the gate (the session may still be loading: only a signed-in person without chat goes home).
  if (user && !on) return <Redirect href="/" />;

  const rows = list.data ?? [];
  const shown = rows.filter((c) => matches(c, q));
  const notReady = health.data && health.data.chatReady === false;

  return (
    <Screen
      header={<NavHeader title="Chat" actions={[{ key: 'new', icon: Plus, label: 'New chat or group', onPress: () => setMenu(true) }]} />}
      onRefresh={() => Promise.all([list.refetch(), health.refetch()])}>
      {notReady ? <Banner tone="warning" title="Chat isn’t set up on DASH yet" message="Ask your DASH admin to finish the chat setup on the server." /> : null}

      {rows.length > 3 || q ? (
        <PillField
          icon={Search}
          placeholder="Search chats"
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search chats"
        />
      ) : null}

      <View>
        {shown.length ? (
          <ActivityList>
            {shown.map((c) => {
              const unread = c.leftAt ? 0 : c.unread || 0;
              const time = rowTime(c.lastMessage?.createdAt ?? c.createdAt, today);
              return (
                <ActivityRow
                  key={c.id}
                  person={{ name: c.name }}
                  title={c.name || 'Chat'}
                  titleLines={1}
                  subtitle={previewLine(c, user?.id)}
                  subtitleLines={1}
                  meta={time}
                  right={unread > 0 ? <UnreadPill n={unread} /> : undefined}
                  titleColor={c.leftAt ? palette.textMuted : undefined}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id, name: c.name } })}
                  accessibilityLabel={[c.name, c.type === 'group' ? 'group' : null, previewLine(c, user?.id), time, unread ? `${countLabel(unread)} unread` : null].filter(Boolean).join(', ')}
                />
              );
            })}
          </ActivityList>
        ) : list.isPending ? (
          <SkeletonList rows={6} avatar />
        ) : list.isError && !list.data ? (
          <ErrorState message={list.error?.message ?? ''} onRetry={() => void list.refetch()} />
        ) : q ? (
          <EmptyState title="No chats match that" action={<Button title="Clear search" variant="accent" size="md" onPress={() => setQ('')} />} />
        ) : (
          <EmptyState
            icon={<MessageCircle color={palette.textMuted} />}
            title="No conversations yet"
            message="Message a colleague, or start a group for your team."
            action={<Button title="Start a chat" size="md" icon={<MessageCirclePlus />} onPress={() => router.push('/chat/new')} />}
          />
        )}
      </View>

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Start"
        items={[
          { key: 'direct', label: 'New chat', hint: 'Message one colleague', icon: MessageCirclePlus, onPress: () => router.push('/chat/new') },
          { key: 'group', label: 'New group', hint: 'Name it and pick who is in it', icon: UsersRound, onPress: () => router.push({ pathname: '/chat/new', params: { mode: 'group' } }) },
        ]}
      />
    </Screen>
  );
}

function UnreadPill({ n }: { n: number }) {
  return (
    <View style={styles.pill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text variant="micro" color={palette.onPrimary} tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {countLabel(n)}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  pill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xxs,
  },
}));
