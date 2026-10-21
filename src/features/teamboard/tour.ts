// Teamboard domain (wave 2) — tour.ts. This domain’s first-sign-in tour steps.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the teamboard agent (docs/port/PLAN.md
// §2.1; spec docs/port/team-ops.md). Scope: Team Roster board and My team tasks. Routes: src/app/(app)/admin/team-board/**.
// API and rules: docs/port/EXTENSION-POINTS.md.
//   tourSteps(ctx)  TourStep[] appended before the demo step and "See this again". Build them with
//                   features/tour/step tourStep(), gate each with `when` (ctx.tourId, ctx.role,
//                   ctx.workspaceRows, ctx.createKeys, ctx.homeCards).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [];
}
