// Teamboard domain (wave 2) — first-sign-in tour steps (docs/port/EXTENSION-POINTS.md §7).
//
//   teamboard.board   More › Work › Team board (department admins and granted Team Roster managers)

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('teamboard.board', 'more.teamboard.board', 'Your team board', 'Plan projects, give out work and see who is busy.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('teamboard.board'),
    }),
  ];
}
