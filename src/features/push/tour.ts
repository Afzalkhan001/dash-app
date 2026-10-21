// Push domain (wave 3) — tour.ts. This domain’s first-sign-in tour steps.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the push agent (docs/port/PLAN.md
// §2.1; spec docs/port/signin-push.md). Scope: Push notifications (app side; the server side waits on owner decision D1). Routes: src/features/push/**, src/lib/push.ts, src/api/push.ts.
// API and rules: docs/port/EXTENSION-POINTS.md.
//   tourSteps(ctx)  TourStep[] appended before the demo step and "See this again". Build them with
//                   features/tour/step tourStep(), gate each with `when` (ctx.tourId, ctx.role,
//                   ctx.workspaceRows, ctx.createKeys, ctx.homeCards).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [];
}
