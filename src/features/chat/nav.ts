// Chat domain — what it adds to More, the + sheet and Home (docs/port/EXTENSION-POINTS.md §3–6).
// Gate: canSeeMeets (features/chat/access.ts) — everyone signed in (dash.html:7000), unless the company
// switched Meets off. Spec docs/port/meets.md §4.1:
//   More     "Chat" as a plain link under the app grid (the `links` card), for everyone
//   + sheet  "New chat" (any role) → /chat/new
//   Home     no card: the chat button with its unread dot sits in Home's header (header-action.ts)
// Calls are not in the app yet (development build, PLAN D3), so the link says "Chat", not "Chat & calls".

import { MessageCircle, MessageCirclePlus } from 'lucide-react-native';

import { canSeeMeets } from '@/features/chat/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  if (!canSeeMeets(access.user, access.tenant)) return [];
  return [
    {
      key: 'chat.chat',
      section: 'links',
      label: 'Chat',
      subtitle: 'Message a colleague or a group',
      href: '/chat',
      icon: MessageCircle,
      module: 'news',
      order: 10,
      tourId: 'more.chat',
    },
  ];
}

export function createActions(access: Access): CreateAction[] {
  if (!canSeeMeets(access.user, access.tenant)) return [];
  return [{ key: 'chat.new', label: 'New chat', href: '/chat/new', icon: MessageCirclePlus, module: 'news', hint: 'Opens a new chat with a colleague or a group' }];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
