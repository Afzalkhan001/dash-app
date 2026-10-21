// The desk's screens (src/app/(app)/admin/desk/**). Kiosk mode (admin/desk/kiosk) arrives in wave 2.
export const DESK_ROUTES = {
  board: '/admin/desk',
  log: '/admin/desk/log',
  invites: '/admin/desk/invites',
  qr: '/admin/desk/qr',
  /** The shared invite form (src/app/(app)/visitors/invite.tsx), open to the desk too. */
  invite: '/visitors/invite',
} as const;
