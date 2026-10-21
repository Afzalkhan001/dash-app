// Demo data for the desk QR features (features/deskqr). No new routes: scanning a pass uses the desk
// fixture's public invite / arrive handlers (fixtures/desk.ts), and the QR, poster and pass are drawn on
// the phone. This file only adds two more of today's invitations for the demo person, so reception can
// scan more than one pass (each code works once):
//   Rahul Menon   361904   11:00 – 12:00   (scan it on Visitor desk › Scan a pass)
//   Ananya Iyer   905218   17:00 – 18:00   (hold its pass QR up to the kiosk: "Scan my pass instead")
// Kavya Reddy (482615) is seeded by fixtures/desk.ts. All three show under Invites › Passes with a QR.

import type { Invite } from '@/api/visitors';
import { inviteStore } from '@/demo/fixtures/visitors';
import { minutesAgo, type Route, today } from '@/demo/state';

const T0 = today();

const SEED: Invite[] = [
  {
    id: 'inv-deskqr-01',
    guestName: 'Rahul Menon',
    guestMobile: '919900112233',
    visitDate: T0,
    timeFrom: '11:00',
    timeTo: '12:00',
    purpose: 'Camera rental hand-over',
    code: '361904',
    status: 'active',
    usedAt: null,
    createdAt: minutesAgo(60 * 26),
  },
  {
    id: 'inv-deskqr-02',
    guestName: 'Ananya Iyer',
    guestMobile: '919845567788',
    visitDate: T0,
    timeFrom: '17:00',
    timeTo: '18:00',
    purpose: 'Voice-over audition',
    code: '905218',
    status: 'active',
    usedAt: null,
    createdAt: minutesAgo(60 * 5),
  },
];

// Seed once (Fast Refresh may re-run this module).
for (const inv of SEED) if (!inviteStore.some((i) => i.id === inv.id)) inviteStore.push(inv);

export const deskqrRoutes: Route[] = [];
