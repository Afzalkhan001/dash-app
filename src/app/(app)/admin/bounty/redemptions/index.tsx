// Use-coins requests — the website's Redemption Requests tab (dash.html BountyRedemptionsView :13455):
// the company's requests to turn earned coins into an Amazon voucher, newest first, with the website's
// filters (Waiting · Approved · Declined · All). Each opens its own screen to approve or decline.
// Super Admin and HR decide; the App Manager sees them and decides only with the company switch on.

import { useRouter } from 'expo-router';
import { Gift } from 'lucide-react-native';
import { useState } from 'react';

import { useCompanyRedemptions } from '@/api/bountyadmin';
import { useTodayIst } from '@/features/attendance/use-now';
import { coins, dateTimeLabel, redemptionStatusMeta } from '@/features/bounty/logic';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { palette } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, Card, Chip, ChipRow, EmptyState, ErrorState, NavHeader, Screen, SkeletonList } from '@/ui';

const TITLE = 'Use-coins requests';
type Show = 'pending' | 'approved' | 'declined' | 'all';
const FILTERS: { key: Show; label: string }[] = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
  { key: 'all', label: 'All' },
];

export default function RedemptionsScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.redemptions} ready={ready} title={TITLE}>
      <Redemptions />
    </AdminGate>
  );
}

function Redemptions() {
  const router = useRouter();
  const today = useTodayIst();
  const { gates: g } = useBountyAdmin();
  const q = useCompanyRedemptions();
  const [show, setShow] = useState<Show>('pending');
  const all = Array.isArray(q.data) ? q.data : [];
  const list = show === 'all' ? all : all.filter((r) => r.status === show);
  const pending = all.filter((r) => r.status === 'pending').length;

  return (
    <Screen header={<NavHeader title={TITLE} />} onRefresh={() => q.refetch()}>
      {!g.decideRedemptions ? <Banner tone="info" title="View only" message="Approving is switched off for your role in Company settings." /> : null}
      {/* Four filters, one with a count: chips, so "Waiting 2" never squeezes into a quarter-width segment. */}
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            count={f.key === 'pending' && pending ? pending : undefined}
            selected={show === f.key}
            onPress={() => setShow(f.key)}
          />
        ))}
      </ChipRow>
      {q.isLoading ? (
        <SkeletonList rows={3} avatar tone="surface" />
      ) : q.error && !q.data ? (
        <Card>
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : list.length ? (
        <ActivityList>
          {list.map((r) => (
            <ActivityRow
              key={r.id}
              person={{ name: r.userName || 'Employee' }}
              title={r.userName || 'Employee'}
              subtitle={r.status === 'declined' && r.declineReason ? `Declined: ${r.declineReason}` : `Asked ${dateTimeLabel(r.requestedAt, today)}`}
              value={`${coins(r.coins)} coins`}
              status={redemptionStatusMeta(r)}
              chevron
              onPress={() => router.push(`/admin/bounty/redemptions/${encodeURIComponent(r.id)}`)}
            />
          ))}
        </ActivityList>
      ) : (
        <Card>
          <EmptyState
            icon={<Gift color={palette.textMuted} />}
            title={show === 'pending' ? 'Nothing waiting' : 'Nothing here'}
            message={show === 'pending' ? 'When someone asks to use their coins, it shows up here and in your Inbox.' : 'No requests with this status yet.'}
            action={show !== 'all' && all.length ? <Button title="Show all requests" variant="accent" size="md" onPress={() => setShow('all')} /> : undefined}
          />
        </Card>
      )}
    </Screen>
  );
}
