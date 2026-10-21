// Signin domain (wave 1) — nav.ts. What this domain adds to More, the + sheet and Home.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the signin agent (docs/port/PLAN.md
// §2.1; spec docs/port/signin-push.md). Scope: Staff forgot password and sign-up (wave 1), Google sign-in (wave 3). Routes: src/app/(auth)/forgot.tsx, src/app/(auth)/signup.tsx.
// API and rules: docs/port/EXTENSION-POINTS.md.
// Signin is used BEFORE sign-in ((auth)/forgot.tsx, (auth)/signup.tsx, entered from (auth)/email.tsx), so
// it adds nothing to the signed-in app: no More rows, no + actions, no Home cards, no Inbox kinds and
// no tour steps. The stubs stay empty on purpose (see HANDOFF.md).
//   workspaceRows(access)  rows in More › Workspace (section: work, people, money, it, company,
//                          platform, reception, or links for a plain link under the app grid)
//   createActions(access)  round actions in the + sheet, after the built-in 8
//   homeCards(access)      Home cards (placement: hero, top, needs, end)
// Pure: read `access` only (access.web(id) is the website's sidebar test), return [] without the gate.

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  return [];
}

export function createActions(access: Access): CreateAction[] {
  return [];
}

export function homeCards(access: Access): HomeCard[] {
  return [];
}
