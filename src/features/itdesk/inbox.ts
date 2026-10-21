// IT desk — Inbox kinds: none. Nothing in this domain waits on a decision: an asset acknowledgement is
// given by the employee from the email link (routes/assets.js:168), room bookings are confirmed when
// they are made, and equipment approvals are the Service desk's `desk-it` kind. What is waiting on the
// equipment side shows on Home (features/itdesk/home-card) and in Assets.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
