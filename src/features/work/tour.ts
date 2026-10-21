// Work domain (wave 1) — first-sign-in tour steps (docs/port/EXTENSION-POINTS.md §7), appended
// before the demo step. Each step is gated on what this person actually sees.
//
//   work.teamToday   Home › "Team today" (managers)
//   work.tasks       More › Work › Team tasks (admin, manager, app_manager)

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('work.teamToday', 'home.work.team', 'Your team today', 'See who is free or busy. Tap someone for their day.', {
      screen: '/',
      when: () => ctx.homeCards.includes('work.teamToday'),
    }),
    tourStep('work.tasks', 'more.work.tasks', 'Your team’s tasks', 'Assign work and see where it stands. The + button assigns a task too.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('work.tasks'),
    }),
  ];
}
