// Bounty admin — first-sign-in tour steps (docs/TOUR.md copy rules: short titles, at most two short
// sentences naming the control as it reads). Appended before the demo step.

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  const hub = ctx.workspaceRows.includes('bountyadmin.hub');
  const post = ctx.createKeys.includes('bountyadmin.post');
  return [
    tourStep(
      'bountyadmin.hub',
      'more.bountyadmin.hub',
      'Bounty admin',
      post ? 'Post bounty tasks, check the work people send and see your task funds.' : 'Give coins, choose who can post tasks and approve use-coins requests.',
      { screen: '/more', when: () => hub },
    ),
  ];
}
