// Demo API for the newsroom domain (wave 2). Stub created by the integrator in Wave 0; already in the
// fixtures barrel (demo/fixtures/index.ts), so routes added here are live with no shared edit, and
// they win over the built-in fixtures. Owner: the newsroom agent.
// Shapes mirror the real handlers; build responses from the app's own API types so tsc checks them.
// Read or change shared demo data only through the exported stores and mutators (org.ts upsertPerson,
// tasks.ts taskStore, visitors.ts visitStore, …) — never edit another fixture file. Every
// Afzal persona that can open this domain should find sample data here.

import type { Route } from '@/demo/state';

export const newsroomRoutes: Route[] = [];
