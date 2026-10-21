// Excel domain — one tour step on More's "Import & export" row (docs/TOUR.md copy rules), shown only
// to people who can upload a sheet (a download-only hub needs no introduction).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('excel.hub', 'more.excel.hub', 'Import and export', 'Upload the website’s Excel sheets after a preview, or download any report as an Excel file.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('excel.hub') && ['super_admin', 'hr', 'it_admin', 'admin'].includes(String(ctx.role)),
    }),
  ];
}
