// Signin domain (wave 1) — inbox.ts. The Inbox kinds this domain adds.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the signin agent (docs/port/PLAN.md
// §2.1; spec docs/port/signin-push.md). Scope: Staff forgot password and sign-up (wave 1), Google sign-in (wave 3). Routes: src/app/(auth)/forgot.tsx, src/app/(auth)/signup.tsx.
// API and rules: docs/port/EXTENSION-POINTS.md.
// Signin is used BEFORE sign-in ((auth)/forgot.tsx, (auth)/signup.tsx, entered from (auth)/email.tsx), so
// it adds nothing to the signed-in app: no More rows, no + actions, no Home cards, no Inbox kinds and
// no tour steps. The stubs stay empty on purpose (see HANDOFF.md).
//   inboxKinds  InboxKindPlugin[] (features/plugin-types): key, label, title, module, icon, the
//               useItems(access) hook, row(item, ctx), Detail and optional History. Wrap each one in
//               defineInboxKind() to keep your record type. Keys must be unique app-wide.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
