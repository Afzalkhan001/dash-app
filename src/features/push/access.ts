// Push domain (wave 3) — access.ts. This domain’s gates.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the push agent (docs/port/PLAN.md
// §2.1; spec docs/port/signin-push.md). Scope: Push notifications (app side; the server side waits on owner decision D1). Routes: src/features/push/**, src/lib/push.ts, src/api/push.ts.
// API and rules: docs/port/EXTENSION-POINTS.md.
// Pure functions ported line for line from dash.html (cite the line), e.g.
//   export const canSeeX = (u: NavUser | null | undefined, t: Tenant | null | undefined) => …
// Shared building blocks are in lib/access.ts (webNav, grantMatches, isProjectCreator, …). A gate
// two domains need is promoted there by the integrator — list it in your HANDOFF.md.

export {};
