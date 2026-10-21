// Chat domain — Inbox kinds: none. Unread messages are not requests to decide; they show as the red
// dot on Home's chat button (header-action.ts) and as counts on the chat list (spec meets.md §4.1:
// "dots, not numbers"), so the Inbox and its tab badge stay for approvals.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
