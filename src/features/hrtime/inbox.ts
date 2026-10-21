// Hrtime domain (wave 1) — inbox.ts. Deliberately empty: HR setup has no approval queue and sends no
// notices (offices, shifts, holidays, leave rules and policies are set up, not requested). The HR
// approval kinds (leave, WFH, comp-off, attendance fixes, claims) stay the built-in Inbox kinds.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
