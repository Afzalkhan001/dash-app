// Newsroom domain (wave 2) — Inbox kinds: none. Nothing in this domain waits on anyone's decision on
// the website (posts go live at once or at their scheduled time; TVs need no approval), so it adds no
// queue. Kept as an empty plug-in so features/domains.ts needs no change.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
