// Insights domain (wave 2) — Inbox kinds. None: Reports and Device monitoring never wait on a
// decision (docs/port/team-ops.md §3–4), so nothing here joins the Inbox.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
