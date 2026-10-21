// Booking's tour steps (docs/TOUR.md copy rules: ≤ 4-word title, ≤ 2 short sentences naming the
// control as it reads). Each runs only when its row is on this person's More screen.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('booking.hub', 'more.booking.hub', 'Book people and rooms', 'Booking finds a free editor, room or shooting location. Your bookings and their status are there too.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('booking.hub'),
    }),
    tourStep('booking.reviews', 'more.booking.reviews', 'Reviews still owed', 'Pending reviews lists booking work nobody has approved or rated yet. Remind people on WhatsApp from there.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('booking.reviews'),
    }),
  ];
}
