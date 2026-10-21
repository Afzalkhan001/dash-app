// Payroll domain (wave 2) — inbox.ts. Deliberately empty: payroll has no approval queue and sends no
// notices (hr_payroll.js sends nothing; a lock does not notify employees). A draft run waiting to be
// locked is shown on the Payroll hub, where the person who runs payroll looks, not as an Inbox item.
// The HR claim and salary-advance approvals stay the built-in Inbox kinds.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
