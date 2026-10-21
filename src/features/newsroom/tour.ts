// Newsroom domain (wave 2) — first-sign-in tour steps (docs/TOUR.md copy rules: ≤ 4-word titles,
// ≤ 2 short sentences naming the control as it reads). Appended before the demo step.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  const rows = ctx.workspaceRows;
  return [
    tourStep('newsroom.studio', 'more.newsroom.studio', 'Post the news', 'Share an update, a pop-up or a file with everyone, now or at a set time.', {
      screen: '/more',
      when: () => rows.includes('newsroom.studio'),
    }),
    tourStep('newsroom.tvs', 'more.newsroom.tvs', 'Office TVs', 'Pair a TV with the code on its screen, then show any post on it.', {
      screen: '/more',
      when: () => rows.includes('newsroom.tvs'),
    }),
  ];
}
