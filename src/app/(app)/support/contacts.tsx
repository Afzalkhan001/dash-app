// Wi-Fi & contacts (web: SupportView's "Support Centre" tab), read-only: branch Wi-Fi networks
// and the branch staff to call. Adding or editing entries is an IT Admin task on the website.
// Pull to refresh reloads whichever list is on screen (same keys as features/support/centre.tsx).

import { useQueryClient } from '@tanstack/react-query';

import { supportKeys } from '@/api/support';
import { useSession } from '@/auth/session';
import { SupportCentre } from '@/features/support/centre';
import { NavHeader, Screen } from '@/ui';

export default function SupportContactsScreen() {
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
