// Me › Leave (docs/REFERENCE-COMPONENTS.md §3 "Me → Leave"). State, then action, then history:
//   1. the light Payno hero "Leave balance": the days left over every paid type as a giant Numeral,
//      a frosted ⓘ chip with what is waiting for approval (opens the waiting requests), the leave year,
//      a striped "used so far" bar and the one primary pill, "Apply leave" (or the first kind this
//      person can request). When HR has set up no leave types, leave is not offered (the form would
//      have nothing to choose) and the hero says so,
//   2. the other kinds (Work from home, Claim comp-off) as list links right under it, named only: what
//      each kind means is said once, on the form,
//   3. "By leave type": one Lendora MetricRow per type with a balance ("6/12 days"), plus unpaid types
//      once days were taken from them; a row opens how its balance adds up,
//   4. Leave requests: a Payno transactions list of the latest 3, waiting ones first, each with its
//      status pill, and a "See all" link; a row opens the request sheet (cancel lives there).
// Someone with work from home or comp-off but no leave gets no hero: just their primary pill and the
// links. Each part hides itself when empty. Gating is unchanged (useLeaveAccess). Leave setup stays on
// the website. Renders inside the Me screen (no Screen or header of its own).

import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useLeaveBalances } from '@/api/hr';
import { type LeaveBalanceRow, type LeaveBalances, type LeaveKind, type LeaveRequest, useMyLeaveRequests } from '@/api/leave';
import { BalanceHero, BalanceHeroSkeleton, BalanceRows } from '@/features/leave/balance-card';
import { KindBadge, LeaveRequestRow } from '@/features/leave/request-row';
import { LeaveRequestSheet } from '@/features/leave/request-sheet';
import { APPLY_TITLE, countsBalance, periodLabel } from '@/features/leave/rules';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { radius, space } from '@/theme/tokens';
import { ActivityList, Button, Card, ErrorState, ListCard, ListRow, TourTarget, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';

const PREVIEW_ROWS = 3; // the full list is one tap away ("See all")

const asArray = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v.filter(Boolean) : []);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function LeaveView() {
  const router = useRouter();
  const { gap } = useLayout();
  const access = useLeaveAccess();
  const balQ = useLeaveBalances(access.enabled && access.hasLeave);
  const reqQ = useMyLeaveRequests(access.enabled);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const data = balQ.data as LeaveBalances | undefined;
  const balances = asArray<LeaveBalanceRow>(data?.balances);
  const balancesFailed = balQ.isError && !data;
  const period = periodLabel(data?.period);
  // Types with a balance, plus unpaid (loss-of-pay) types once days were used or are waiting from them.
  const shown = balances.filter((b) => countsBalance(b) || num(b.used) > 0 || num(b.pending) > 0);
  // No leave type this person could pick on the form (the comp-off type only comes with comp-off).
  const noLeaveTypes = access.hasLeave && !!data && !balances.some((b) => !b.is_comp_off || access.hasCompOff);
  const requests = asArray<LeaveRequest>(reqQ.data?.requests);
  const typeOf = (id: string | null) => balances.find((b) => b.id === id) ?? null;
  const typeName = (id: string | null) => typeOf(id)?.name ?? null;
  // Waiting requests first, then the rest in the server's order (newest first).
  const latest = [...requests.filter((r) => r.status === 'pending'), ...requests.filter((r) => r.status !== 'pending')].slice(0, PREVIEW_ROWS);
  const requestsFailed = reqQ.isError && !reqQ.data;
  const openReq = requests.find((r) => r.id === openId) ?? null;

  const kinds = asArray(access.kinds).filter((k) => k !== 'leave' || !noLeaveTypes);
  const firstKind: LeaveKind | null = kinds[0] ?? null;
  const otherKinds = kinds.filter((k) => k !== firstKind);
  const apply = {
    title: APPLY_TITLE[firstKind ?? 'leave'],
    disabled: !firstKind,
    onPress: () => {
      if (firstKind) router.push(`/leave/apply?kind=${firstKind}`);
    },
  };

  // The hero carries the primary pill; without it (no leave, or balances failed) the pill stands alone.
  const heroState = !access.hasLeave ? 'none' : balQ.isLoading ? 'loading' : balancesFailed ? 'failed' : 'ready';

  const openRow = (id: string) => {
    setOpenId(id);
    setSheetOpen(true);
  };

  return (
    // Generous air between the parts (28, 24 on compact phones); tighter inside each part.
    <View style={{ gap: gap + space.sm }}>
      <View style={styles.top}>
        {heroState === 'loading' ? <BalanceHeroSkeleton /> : null}
        {heroState === 'failed' ? (
          <Card tone="frostStrong" style={styles.errorCard}>
            <ErrorState message={balQ.error?.message ?? ''} onRetry={() => void balQ.refetch()} />
          </Card>
        ) : null}
        {heroState === 'ready' ? (
          <TourTarget id="me.leaveBalance" radius={radius.xxl}>
            <BalanceHero
              balances={shown}
              period={period}
              noTypes={noLeaveTypes}
              action={apply}
              onWaiting={() => router.push('/leave/requests?filter=pending')}
            />
          </TourTarget>
        ) : null}
        {heroState === 'none' || heroState === 'failed' ? (
          <Button variant="primary" title={apply.title} icon={<Plus />} disabled={apply.disabled} onPress={apply.onPress} />
        ) : null}

        {otherKinds.length ? (
          <ListCard tone="surface">
            {otherKinds.map((k) => (
              <ListRow
                key={k}
                left={<KindBadge kind={k} />}
                title={APPLY_TITLE[k]}
                titleWeight="medium"
                chevron
                onPress={() => router.push(`/leave/apply?kind=${k}`)}
              />
            ))}
          </ListCard>
        ) : null}
      </View>

      {heroState === 'ready' && shown.length ? <BalanceRows balances={shown} period={period} /> : null}

      {/* History: hidden until there is something in it. */}
      {reqQ.isLoading || requestsFailed || requests.length > 0 ? (
        <ActivityList
          title="Leave requests"
          loading={reqQ.isLoading}
          onSeeAll={requests.length > PREVIEW_ROWS ? () => router.push('/leave/requests') : undefined}
          seeAllAccessibilityLabel="See all leave requests"
          empty={
            requestsFailed ? (
              <View style={styles.error}>
                <ErrorState message={reqQ.error?.message ?? ''} onRetry={() => void reqQ.refetch()} />
              </View>
            ) : undefined
          }>
          {requestsFailed
            ? null
            : latest.map((r) => (
                <LeaveRequestRow
                  key={r.id}
                  request={r}
                  typeName={typeName(r.leave_type_id)}
                  type={typeOf(r.leave_type_id)}
                  onPress={() => openRow(r.id)}
                />
              ))}
        </ActivityList>
      ) : null}

      <LeaveRequestSheet
        request={openReq}
        typeName={openReq ? typeName(openReq.leave_type_id) : null}
        visible={sheetOpen && !!openReq}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  top: { gap: space.sm },
  errorCard: { borderRadius: radius.xxl },
  error: { padding: space.md },
}));
