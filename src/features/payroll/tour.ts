// Payroll domain (wave 2) — tour.ts. One step for Super Admin and HR: where Payroll lives in More.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { PAYROLL_TOUR_ID } from '@/features/payroll/nav';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('payroll.hub', PAYROLL_TOUR_ID, 'Run payroll', 'Calculate the month, check each person’s pay and lock it here. Salaries and tax settings are here too.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('payroll.hub'),
    }),
  ];
}
