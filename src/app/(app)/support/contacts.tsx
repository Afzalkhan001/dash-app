// Wi-Fi & contacts (web: SupportView's "Support Centre" tab), read-only: branch Wi-Fi networks
// and the branch staff to call. Adding or editing entries is an IT Admin task on the website.
// Pull to refresh reloads whichever list is on screen (same keys as features/support/centre.tsx).

import { useQueryClient } from '@tanstack/react-query';

import { supportKeys } from '@/api/support';
import { useSession } from '@/auth/session';
import { SupportCentre } from '@/features/support/centre';
import { NavHeader, Screen } from '@/ui';
import { webNav } from '@/lib/access';
import { RouteGate } from '@/features/shared/route-gate';

// Help & support is for the roles whose web menu has it (not the platform owner or the office TV).
export default function SupportContactsScreen() {
  const user = useSession((s) => s.user);
  return (
    <RouteGate allow={webNav(user, 'support', null)}>
      <SupportContactsBody />
    </RouteGate>
  );
}

function SupportContactsBody() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: supportKeys.wifi(userId) }),
      qc.invalidateQueries({ queryKey: supportKeys.staff(userId) }),
      qc.invalidateQueries({ queryKey: supportKeys.tempStaff(userId) }),
    ]);

  return (
    <Screen header={<NavHeader title="Wi-Fi & contacts" />} onRefresh={refresh}>
      <SupportCentre />
    </Screen>
  );
}
