// People domain (wave 1) — one tour step: where the roster lives, for everyone who has it (HR, Super
// Admin, IT Admin, Admin, App Manager). Appended before the demo step (features/tour/role-tours).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';
import { tourStep } from '@/features/tour/step';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [
    tourStep('people.roster', 'more.people.roster', 'Your employee roster', 'Add people, edit their details and mark leavers in Employees.', {
      screen: '/more',
      when: () => ctx.workspaceRows.includes('people.roster'),
    }),
  ];
}
