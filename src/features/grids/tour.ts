// Grids domain — tour.ts. One step: where the wide tables live in More.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { GRIDS_TOUR_ID } from '@/features/grids/nav';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('grids.tables', GRIDS_TOUR_ID, 'The big tables', 'The website’s wide tables, on your phone: swipe sideways for more columns and use the + and − buttons for text size.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('grids.tables'),
    }),
  ];
}
