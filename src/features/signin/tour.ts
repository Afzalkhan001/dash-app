// Signin domain (wave 1) — tour.ts. This domain’s first-sign-in tour steps.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the signin agent (docs/port/PLAN.md
// §2.1; spec docs/port/signin-push.md). Scope: Staff forgot password and sign-up (wave 1), Google sign-in (wave 3). Routes: src/app/(auth)/forgot.tsx, src/app/(auth)/signup.tsx.
// API and rules: docs/port/EXTENSION-POINTS.md.
// Signin is used BEFORE sign-in ((auth)/forgot.tsx, (auth)/signup.tsx, entered from (auth)/email.tsx), so
// it adds nothing to the signed-in app: no More rows, no + actions, no Home cards, no Inbox kinds and
// no tour steps. The stubs stay empty on purpose (see HANDOFF.md).
//   tourSteps(ctx)  TourStep[] appended before the demo step and "See this again". Build them with
//                   features/tour/step tourStep(), gate each with `when` (ctx.tourId, ctx.role,
//                   ctx.workspaceRows, ctx.createKeys, ctx.homeCards).

import type { DomainTourCtx, TourStep } from '@/features/plugin-types';

export function tourSteps(ctx: DomainTourCtx): TourStep[] {
  return [];
}
