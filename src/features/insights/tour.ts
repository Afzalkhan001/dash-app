// Insights domain (wave 2) — first-sign-in tour steps (docs/TOUR.md copy rules: ≤ 4-word titles,
// ≤ 2 short sentences naming the control as it reads). Appended before the demo step.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  const rows = ctx.workspaceRows;
  return [
    tourStep('insights.reports', 'more.insights.reports', 'Hours reports', 'See hours by person, project or project code, and share them as a CSV.', {
      screen: '/more',
      when: () => rows.includes('insights.reports'),
    }),
    tourStep('insights.devices', 'more.insights.devices', 'Device monitoring', 'Who is active or idle on their work computer right now, as TM360 records it.', {
      screen: '/more',
      when: () => rows.includes('insights.devices'),
    }),
  ];
}
