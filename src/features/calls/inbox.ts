// Calls domain — Inbox kinds: none on purpose. A ring is answered on the spot (the incoming-call
// sheet), and the server keeps no missed-call list (`/meets/unread` always answers missedCalls: 0).

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
