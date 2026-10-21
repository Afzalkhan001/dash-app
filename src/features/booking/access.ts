// Booking domain gates, ported from dash.html. The server checks no role on any booking route
// (routes/bookings.js, slot_bookings.js, server.js holds), so these are the only guard.
//
//   booking          navForRaw (dash.html:1508–1532, ceo/coo = super_admin) + the `booking` switch:
//                    super_admin, ceo, coo, admin, hr, manager, employee, professional, accounts,
//                    app_manager — not it_admin, visitor_manager, master_admin, announcement_viewer.
//                    lib/access webNav('booking') already holds the table and the switch.
//   requests         navForRaw `requests` (admin, manager, app_manager) + the `requests` switch, AND the
//                    page's own canApproveBk (dash.html:24112: manager, admin, super_admin, ceo, coo,
//                    app_manager). Super Admin / CEO / COO have no Requests page on the web.
//   pending reviews  AppManagerViews home → PendingReviewsMonitor (dash.html:25943–25944): app_manager.
//   ratings shown    canSeeReviews (dash.html:27489): who sees the last reviews on a professional.

import type { NavUser } from '@/lib/access';
import type { Access } from '@/lib/use-access';

type Role = string | null | undefined;

/** dash.html:24112 canApproveBk. */
export const BOOKING_APPROVER_ROLES = ['manager', 'admin', 'super_admin', 'ceo', 'coo', 'app_manager'];
/** dash.html:27489 canSeeReviews. */
export const REVIEW_READER_ROLES = ['manager', 'admin', 'hr', 'super_admin', 'ceo', 'coo', 'app_manager'];

export const canApproveBookings = (role: Role) => !!role && BOOKING_APPROVER_ROLES.includes(role);
export const canReadReviews = (role: Role) => !!role && REVIEW_READER_ROLES.includes(role);
/** The App Manager's landing page on the web (dash.html:25944). */
export const canSeePendingReviews = (u: Pick<NavUser, 'role'> | null | undefined) => u?.role === 'app_manager';
/** A professional sees "Booked for you" (dash.html:27305 isProfessional). */
export const isProfessional = (u: Pick<NavUser, 'role'> | null | undefined) => u?.role === 'professional';

/** The booking hub and its three flows. */
export const canBook = (access: Pick<Access, 'web'>) => access.web('booking');
/** The approver queue (Inbox "Bookings") and the requests tracker. */
export const canSeeBookingRequests = (access: Pick<Access, 'web' | 'user'>) => access.web('requests') && canApproveBookings(access.user?.role);
