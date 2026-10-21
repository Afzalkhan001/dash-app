// People domain (wave 1) — Inbox kinds: none. The roster and departments have no approval queue and
// nothing that waits on anyone (docs/port/hr-people.md §1.A, §1.C), so this domain adds no kind.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
