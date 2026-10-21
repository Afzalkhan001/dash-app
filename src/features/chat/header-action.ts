// Home header's chat button (spec docs/port/meets.md §4.1): a round "Chat" button before the Inbox
// button, with a red dot while /meets/unread has messages (a dot, never a number — the website's
// launcher badge, dash.html:8857). Read by features/home/header.tsx. Null when chat is off for this
// person or company (then Home shows the Inbox button alone).

import { useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';

import { useUnread } from '@/api/chat';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { canSeeMeets } from '@/features/chat/access';
import type { NavAction } from '@/ui';

export function useChatHeaderAction(): NavAction | null {
  const router = useRouter();
  const user = useSession((s) => (s.kind === 'staff' ? s.user : null));
  const tenant = useMyTenant().data;
  const on = canSeeMeets(user, tenant);
  const unread = useUnread(on).data?.messages ?? 0;
  if (!on) return null;
  return {
    key: 'chat',
    icon: MessageCircle,
    label: unread > 0 ? `Chat, ${unread >= 99 ? '99+' : unread} unread` : 'Chat',
    dot: unread > 0,
    onPress: () => router.push('/chat'),
    tourId: 'home.chat',
  };
}
