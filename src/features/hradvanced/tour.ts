// hradvanced — tour.ts. One step per persona that has a row: where the new editors live in More.

import { HRADV_TOUR } from '@/features/hradvanced/nav';
import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('hradvanced.payroll', HRADV_TOUR.payroll, 'Set up payroll here', 'Edit salary structures and the statutory and TDS settings. Every change is checked and confirmed first.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('hradvanced.payroll-setup'),
    }),
    tourStep('hradvanced.branding', HRADV_TOUR.branding, 'Your company’s look', 'Change the logo and the PDF report logo, and the categories people can book.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('hradvanced.branding'),
    }),
    tourStep('hradvanced.extend', HRADV_TOUR.extend, 'Shoot running long?', 'Give a team booking today a later end. The app checks their next booking first.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('hradvanced.extend'),
    }),
  ];
}
