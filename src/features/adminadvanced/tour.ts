// Admin advanced — first-sign-in tour steps (docs/TOUR.md: ≤ 4-word titles, ≤ 2 short sentences).
// Only the everyday pages get a step; the delete tools and the playlist editor are found from More.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  const rows = ctx.workspaceRows;
  return [
    tourStep('adminadvanced.employees', 'more.adminadvanced.employees', 'Your team at a glance', 'See who has how much work and which equipment they hold.', {
      screen: '/more',
      when: () => rows.includes('adminadvanced.employees'),
    }),
    tourStep('adminadvanced.officemap', 'more.adminadvanced.officemap', 'Offices on a map', 'Tap the map to place an office and size its clock-in circle.', {
      screen: '/more',
      when: () => rows.includes('adminadvanced.officemap'),
    }),
  ];
}
