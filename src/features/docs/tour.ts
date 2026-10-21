// Docs tour step (docs/TOUR.md copy rules): only when the Documents row is on this person's More screen.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('docs.hub', 'more.docs.hub', 'Make a PDF', 'Documents makes the website’s PDFs here. Preview one, then share or print it.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('docs.hub'),
    }),
  ];
}
