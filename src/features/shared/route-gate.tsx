// A pushed screen that a role is never offered (no More tile, Workspace row, + action or link) sends
// that role away when it is opened by a typed or old link, the same way the admin screens do
// (<Redirect href="/" />). Visibility only: the server re-checks every request.

import { type Href, Redirect } from 'expo-router';
import type { ReactNode } from 'react';

export function RouteGate({ allow, to = '/', children }: { allow: boolean; to?: Href; children: ReactNode }) {
  if (!allow) return <Redirect href={to} />;
  return <>{children}</>;
}
