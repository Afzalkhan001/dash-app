// Who sees Bounty rewards: the company has it switched on (tenant.bountyEnabled, as bountySystemOn()
// on the web) AND the role's web menu has it (roleSeesBounty). The hub and its pushed lists (My
// bounty tasks, Leaderboard, My coins, All tasks) all sit behind this one gate, so their queries only
// run when the person may see them — the same rule the hub applied to its old tabs.

import { Coins } from 'lucide-react-native';
import { type ReactNode } from 'react';

import { useSession } from '@/auth/session';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import { EmptyState, NavHeader, Screen } from '@/ui';

import { roleSeesBounty } from './logic';

export function useBountyOn() {
  const { feature } = useAccess();
  const user = useSession((s) => s.user);
  const companyOn = feature('bounty');
  return { companyOn, on: companyOn && roleSeesBounty(user) };
}

/** Renders `children` only for people who have Bounty rewards; everyone else gets a short notice. */
export function BountyGate({ title, children }: { title: string; children: ReactNode }) {
  const { companyOn, on } = useBountyOn();
  if (on) return <>{children}</>;
  return (
    <Screen header={<NavHeader title={title} />}>
      <EmptyState
        icon={<Coins color={palette.textMuted} />}
        title={companyOn ? 'Not part of your role' : 'Bounty rewards are off'}
        message={companyOn ? 'Bounty rewards are not part of your role in DASH.' : 'Your company has turned this off. Ask your admin if you expected it.'}
      />
    </Screen>
  );
}
