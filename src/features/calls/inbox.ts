// Calls domain (wave 3) — inbox.ts. The Inbox kinds this domain adds.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the calls agent (docs/port/PLAN.md
// §2.1; spec docs/port/meets.md). Scope: Voice and video calls (development build only, decision D3). Routes: src/app/(app)/call/**.
// API and rules: docs/port/EXTENSION-POINTS.md.
//   inboxKinds  InboxKindPlugin[] (features/plugin-types): key, label, title, module, icon, the
//               useItems(access) hook, row(item, ctx), Detail and optional History. Wrap each one in
//               defineInboxKind() to keep your record type. Keys must be unique app-wide.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
