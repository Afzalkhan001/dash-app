// Hrtime domain (wave 1) — tour.ts. One step for Super Admin and HR: where HR setup lives in More.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { HRTIME_TOUR_ID } from '@/features/hrtime/nav';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('hrtime.setup', HRTIME_TOUR_ID, 'Set up HR', 'Offices, shifts, holidays, leave rules and policies are all in HR setup.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('hrtime.setup'),
    }),
  ];
}
