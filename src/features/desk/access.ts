// Visitor desk gates, ported from dash.html (docs/port/visitor-desk.md §1.1). Pure functions.
//
//   VISIT_DESK_ROLES = ['visitor_manager','super_admin']   dash.html:35180 (lib/access VISIT_DESK_ROLES)
//     The only roles with desk screens; the server checks the same list on every desk route
//     (visitors.js:560 DESK_ROLES → 403 "You do not have permission to manage visitors"). The test is the
//     EXACT role: CEO and COO see the Super Admin menu on the web (n.ceo = n.super_admin, dash.html:1531)
//     but the desk injection (dash.html:1495) and the server both check the raw role, so they get no desk.
//   navForRaw visitor_manager (dash.html:1531): visitors-dashboard · visitors-kiosk · visitors-log ·
//     visitors-invites · visitors-qr · profile · support.
//   navFor injection (dash.html:1492-1495): Super Admin gets "Visitor Desk" (visitors-desk), whose tab
//     bar (VisitorDesk, dash.html:35924) holds the same five views.
//   VisitorQrPage canRegen = VISIT_DESK_ROLES.includes(user.role) (dash.html:35771).
//   No company feature switch covers visitors (not in FEATURE_REGISTRY, dash.html:1373).
//
// The desk's own Inbox queue ("At reception") and Home hero are the Visitor Manager's only: the Super
// Admin keeps the host queue and reaches the board from More (spec §4.1), so the owner's Inbox is not
// flooded with every visitor in the building.

import type { Access } from '@/lib/use-access';
import { VISIT_DESK_ROLES } from '@/lib/access';

type RoleUser = { role?: string | null } | null | undefined;

/** A desk role, by the exact role (dash.html:35180; server visitors.js:560). */
export const isDeskRole = (u: RoleUser) => !!u && typeof u.role === 'string' && VISIT_DESK_ROLES.includes(u.role);

/** The Visitor Manager: the desk is their whole app (DEFAULT_VIEW visitors-dashboard, dash.html:30257). */
export const isVisitorManager = (u: RoleUser) => !!u && u.role === 'visitor_manager';

// The website reaches each desk view through its own sidebar id (Visitor Manager) or through the
// "Visitor Desk" item and its tab bar (Super Admin). `access.web` is the website's navFor.
type WebOnly = Pick<Access, 'web'>;
const viaDesk = (a: WebOnly) => a.web('visitors-desk');

/** Today's board: Dashboard (visitors-dashboard) or the Super Admin's Visitor Desk. */
export const canSeeDeskBoard = (a: WebOnly) => a.web('visitors-dashboard') || viaDesk(a);
/** Visitor log (visitors-log). */
export const canSeeVisitorLog = (a: WebOnly) => a.web('visitors-log') || viaDesk(a);
/** The desk's Invites tab (visitors-invites): the invites the desk user created. */
export const canSeeDeskInvites = (a: WebOnly) => a.web('visitors-invites') || viaDesk(a);
/** The check-in QR code page (visitors-qr). */
export const canSeeDeskQr = (a: WebOnly) => a.web('visitors-qr') || viaDesk(a);
/** "Regenerate QR code…" (dash.html:35771 canRegen). */
export const canRegenerateQr = (u: RoleUser) => isDeskRole(u);

/** Every desk screen re-checks this (the server still answers 403 to anyone else). */
export const canRunDesk = (a: WebOnly & Pick<Access, 'user'>) => isDeskRole(a.user) && canSeeDeskBoard(a);
