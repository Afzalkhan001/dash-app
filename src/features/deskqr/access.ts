// Desk QR gates. Scanning a guest's pass at reception does exactly what the kiosk's invite path does
// (POST /public/visit/<company>/<token>/invite, then …/arrive), with the desk's own check-in link, so it is
// open to exactly the people who may run the kiosk: the desk roles (VISIT_DESK_ROLES, dash.html:35180)
// with Kiosk Mode in their web menu (visitors-kiosk / visitors-desk). CEO and COO get nothing.

import { canRunDesk, canSeeKiosk } from '@/features/desk/access';
import type { Access } from '@/features/plugin-types';

export const canScanPass = (a: Access) => canRunDesk(a) && canSeeKiosk(a);
