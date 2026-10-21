// Calls domain (wave 3) — tour.ts. This domain’s first-sign-in tour steps.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the calls agent (docs/port/PLAN.md
// §2.1; spec docs/port/meets.md). Scope: Voice and video calls (development build only, decision D3). Routes: src/app/(app)/call/**.
// API and rules: docs/port/EXTENSION-POINTS.md.
//   tourSteps(ctx)  TourStep[] appended before the demo step and "See this again". Build them with
//                   features/tour/step tourStep(), gate each with `when` (ctx.tourId, ctx.role,
//                   ctx.workspaceRows, ctx.createKeys, ctx.homeCards).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [];
}
