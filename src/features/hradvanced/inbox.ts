// hradvanced — inbox.ts. Deliberately empty: nothing here waits on anyone, and none of these routes
// sends a message (hr_payroll.js sends nothing; PUT /tenants and an end-time change to a booking
// email nobody).

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
