// Hiring domain — the "Refer & earn" card for the Bounty hub (PLAN §2.3 integrator pass 2 mounts it on
// app/(app)/bounty/index.tsx): referral bonuses are paid in the same coins. One AccountRow-style card:
// the number of open positions and the biggest bonus → /admin/hiring/refer.
// Renders nothing for people the website keeps off the Referral Program (navForRaw :1532: a
// job-opening creator, or at least one posting exists) and while the job list is loading.

import { useRouter } from 'expo-router';
import { Gift } from 'lucide-react-native';

import { useJobOpenings } from '@/api/hiring';
import { canSeeReferrals } from '@/features/hiring/access';
import { bonusOf, coins, isOpen } from '@/features/hiring/model';
import { useAccess } from '@/lib/use-access';
import { AccountRow } from '@/ui';

export function ReferCard() {
  const router = useRouter();
  const access = useAccess();
  const onMenu = canSeeReferrals(access.user, access.tenant, 1);
  const jobs = useJobOpenings(onMenu);
  const list = jobs.data ?? [];
  if (!onMenu || !jobs.data || !canSeeReferrals(access.user, access.tenant, list.length)) return null;
  const open = list.filter(isOpen);
  const top = open.reduce((m, j) => Math.max(m, bonusOf(j)), 0);
  const sub = open.length
    ? `${open.length} open ${open.length === 1 ? 'position' : 'positions'}${top ? ` · earn up to ${coins(top)}` : ''}`
    : 'No open positions right now';
  return (
    <AccountRow
      icon={Gift}
      module="bounty"
      title="Refer & earn"
      sub={sub}
      actionLabel="Refer"
      onPress={() => router.push('/admin/hiring/refer')}
      accessibilityLabel={`Refer and earn. ${sub}`}
      hint="Opens the open positions"
    />
  );
}
