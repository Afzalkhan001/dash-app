// The desk's screens (src/app/(app)/admin/desk/**). Kiosk mode is a full-screen modal (Stack options in
// (app)/_layout.tsx, by the route name admin/desk/kiosk).
export const DESK_ROUTES = {
  board: '/admin/desk',
  log: '/admin/desk/log',
  invites: '/admin/desk/invites',
  qr: '/admin/desk/qr',
  kiosk: '/admin/desk/kiosk',
  /** The shared invite form (src/app/(app)/visitors/invite.tsx), open to the desk too. */
  invite: '/visitors/invite',
} as const;
