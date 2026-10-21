// Itdesk domain (wave 2) — inbox.ts. The Inbox kinds this domain adds.
// Stub created by the integrator in Wave 0 and already wired into the shared screens through
// features/domains.ts, so filling it in needs no shared edit. Owner: the itdesk agent (docs/port/PLAN.md
// §2.1; spec docs/port/it-admin.md). Scope: Assets, rooms, locations, booking purposes, Support Centre admin. Routes: src/app/(app)/admin/it-desk/**.
// API and rules: docs/port/EXTENSION-POINTS.md.
//   inboxKinds  InboxKindPlugin[] (features/plugin-types): key, label, title, module, icon, the
//               useItems(access) hook, row(item, ctx), Detail and optional History. Wrap each one in
//               defineInboxKind() to keep your record type. Keys must be unique app-wide.

import type { InboxKindPlugin } from '@/features/plugin-types';

export const inboxKinds: InboxKindPlugin[] = [];
