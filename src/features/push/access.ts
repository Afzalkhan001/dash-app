// Push domain — access.ts. The website has no push notifications (it emails and WhatsApps,
// docs/port/signin-push.md §4.1), so there is no dash.html gate to copy: every signed-in staff member
// may turn notifications on for their own phone, exactly as the server's POST /api/push/devices
// allows any staff session (no requireRole). Vendors are phase 2 (they never reach this area).

import type { Access } from '@/features/plugin-types';

/** Any signed-in staff member, every role. */
export const canUsePush = (access: Pick<Access, 'user'>) => !!access.user?.id && typeof access.user.role === 'string';
