// The demo fixtures barrel: every domain's src/demo/fixtures/<domain>.ts, imported once. demo/server.ts
// puts these routes in front of the built-in fixtures, so a domain's handlers win over them, and never
// changes again (docs/port/PLAN.md §2.1.4, docs/port/EXTENSION-POINTS.md §10). Integrator-owned: a new
// domain's file is added here by the integrator, never by the domain.
//
// Within the domains, the first match wins: the order below is wave 1, then wave 2, then wave 3.
// Clashes between domains (two answering the same request) are settled in ./integration.ts, which
// every list passes through here: no domain file is edited for it.

import type { Route } from '@/demo/state';
import { integrate } from '@/demo/fixtures/integration';
import { workRoutes } from '@/demo/fixtures/work';
import { bookingRoutes } from '@/demo/fixtures/booking';
import { servicedeskRoutes } from '@/demo/fixtures/servicedesk';
import { peopleRoutes } from '@/demo/fixtures/people';
import { hrtimeRoutes } from '@/demo/fixtures/hrtime';
import { accountsRoutes } from '@/demo/fixtures/accounts';
import { companyRoutes } from '@/demo/fixtures/company';
import { deskRoutes } from '@/demo/fixtures/desk';
import { signinRoutes } from '@/demo/fixtures/signin';
import { chatRoutes } from '@/demo/fixtures/chat';
import { teamboardRoutes } from '@/demo/fixtures/teamboard';
import { insightsRoutes } from '@/demo/fixtures/insights';
import { itdeskRoutes } from '@/demo/fixtures/itdesk';
import { payrollRoutes } from '@/demo/fixtures/payroll';
import { hiringRoutes } from '@/demo/fixtures/hiring';
import { newsroomRoutes } from '@/demo/fixtures/newsroom';
import { bountyadminRoutes } from '@/demo/fixtures/bountyadmin';
import { platformRoutes } from '@/demo/fixtures/platform';
import { pushRoutes } from '@/demo/fixtures/push';
import { callsRoutes } from '@/demo/fixtures/calls';

export const domainRoutes: Route[] = [
  ...integrate('work', workRoutes),
  ...bookingRoutes,
  ...integrate('servicedesk', servicedeskRoutes),
  ...integrate('people', peopleRoutes),
  ...hrtimeRoutes,
  ...integrate('accounts', accountsRoutes),
  ...companyRoutes,
  ...deskRoutes,
  ...signinRoutes,
  ...chatRoutes,
  ...teamboardRoutes,
  ...insightsRoutes,
  ...itdeskRoutes,
  ...payrollRoutes,
  ...hiringRoutes,
  ...newsroomRoutes,
  ...bountyadminRoutes,
  ...platformRoutes,
  ...pushRoutes,
  ...callsRoutes,
];
