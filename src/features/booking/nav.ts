// What booking adds to More › Work, the + sheet and Home (docs/port/EXTENSION-POINTS.md §3, §4, §6).
//   More › Work   Booking (booking roles) · Booking requests (approvers) · Pending reviews (App Manager)
//   + sheet       Book (booking roles)
//   Home          Pending reviews count (App Manager, whose website home is that page)
// Pure: decided from `access` only.

import { CalendarCheck2, CalendarPlus, ClipboardList } from 'lucide-react-native';

import { canBook, canSeeBookingRequests, canSeePendingReviews } from '@/features/booking/access';
import { PendingReviewsCard } from '@/features/booking/home-card';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const rows: WorkspaceRow[] = [];
  if (canBook(access))
    rows.push({
      key: 'booking.hub',
      section: 'work',
      label: 'Booking',
      subtitle: 'Book a professional, a room or a shooting location',
      href: '/admin/booking',
      icon: CalendarPlus,
      module: 'tasks',
      order: 30,
      tourId: 'more.booking.hub',
    });
  if (canSeeBookingRequests(access))
    rows.push({
      key: 'booking.requests',
      section: 'work',
      label: 'Booking requests',
      subtitle: 'Waiting, approved and rejected bookings of your team',
      href: '/admin/booking/requests',
      icon: CalendarCheck2,
      module: 'tasks',
      order: 31,
    });
  if (canSeePendingReviews(access.user))
    rows.push({
      key: 'booking.reviews',
      section: 'work',
      label: 'Pending reviews',
      subtitle: 'Booking work waiting for approval or a rating',
      href: '/admin/booking/reviews',
      icon: ClipboardList,
      module: 'tasks',
      order: 32,
      tourId: 'more.booking.reviews',
    });
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  if (!canBook(access)) return [];
  return [{ key: 'booking.book', label: 'Book', href: '/admin/booking', icon: CalendarPlus, module: 'tasks', hint: 'Opens booking: a professional, a room or a location', order: 20 }];
}

export function homeCards(access: Access): HomeCard[] {
  if (!canSeePendingReviews(access.user)) return [];
  return [{ key: 'booking.reviews', placement: 'needs', order: 40, Card: PendingReviewsCard }];
}

