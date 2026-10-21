// Expense claims (web: Accounts > Reimbursement > My reimbursements). Money I spent on work and am
// claiming back, newest first, each with one plain status word.
//
// Top to bottom (Payno list screen): state, then history —
//   1. the light summary hero: what I am still to get back, how much was paid back so far, and the one
//      primary action, "New expense claim" (the same words as the screen it opens);
//   2. "Needs you": each payment Accounts sent that I still have to confirm, as a "Did you get ₹X?" row
//      that opens the "Did you get the money?" sheet — the same rows and sheet as Petty cash (at most
//      three, then an "N more" line, as Petty cash);
//   3. for people who approve project claims, one "Approvals are in Inbox" row (the same row Petty cash
//      shows): approvals live only in the Inbox, which carries them for everyone this screen used to
//      show an Approvals tab to (features/inbox/use-inbox reads this screen's keka-all list for that);
//   4. my claims, newest first (20 at a time, "Show more" for the rest), each with its status pill,
//      filtered by a pill (All / Not paid yet / Paid / Rejected).

import { useRouter } from 'expo-router';
import { BadgeIndianRupee, HandCoins, Inbox, Plus } from 'lucide-react-native';
import { useState } from 'react';

import { useKekaOwnership } from '@/api/inbox';
import { type Reimbursement, useKekaReimbursements, useMyReimbursements } from '@/api/reimbursements';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { FilterPill } from '@/features/petty-cash/filter-pill';
import { ClaimRow } from '@/features/reimbursements/claim-row';
import { type ClaimGroup, claimGroup, purposeLabel, rowInr } from '@/features/reimbursements/format';
import { RespondSheet } from '@/features/reimbursements/sheets';
import { plural } from '@/lib/format';
import { palette, radius } from '@/theme/tokens';
import { ActivityList, ActivityRow, Button, EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, SummaryHero } from '@/ui';

import { themedStyles } from '@/theme/themed';
const PAGE = 20;
const NEEDS_YOU_ROWS = 3;

type Filter = 'all' | ClaimGroup;
const FILTER_LABEL: Record<Filter, string> = { all: 'All claims', open: 'Not paid yet', paid: 'Paid', rejected: 'Rejected' };

const isClaim = (r: unknown): r is Reimbursement => !!r && typeof r === 'object' && 'id' in r;
// Newest first by when it was sent (ISO strings sort as text); ties keep the server's order.
const newestFirst = (a: Reimbursement, b: Reimbursement) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
const amountOf = (r: Reimbursement) => {
  const n = Number(r.amount);
  return Number.isFinite(n) ? n : 0;
};

export default function ExpenseClaimsScreen() {
  const router = useRouter();
  const today = useTodayIst();
  const userId = useSession((s) => s.user?.id);
  const mine = useMyReimbursements();
  const keka = useKekaReimbursements();
  const ownership = useKekaOwnership();
  const [limit, setLimit] = useState(PAGE);
  const [picked, setFilter] = useState<Filter>('all');
  const [answering, setAnswering] = useState<Reimbursement | null>(null);

  const list = (Array.isArray(mine.data) ? mine.data : []).filter(isClaim).slice().sort(newestFirst);
  const kekaList = (Array.isArray(keka.data) ? keka.data : []).filter(isClaim);
  // Who approves project claims: a project-code owner, or anyone the server lists claims for (the old
  // Approvals tab's rule). Their decisions are all made in the Inbox.
  const approves = ownership.data?.owns === true || kekaList.length > 0;
  const waiting = kekaList.filter((r) => r.status === 'pending_keka_approval' && r.employee_id !== userId).length;
  const toConfirm = list.filter((r) => r.status === 'payment_processing');
  const moreToConfirm = toConfirm.length - NEEDS_YOU_ROWS;

  // The hero's figures: money still on its way to me, and what has been paid back so far.
  const open = list.filter((r) => claimGroup(r) === 'open');
  const toGetBack = open.reduce((s, r) => s + amountOf(r), 0);
  const paidBack = list.filter((r) => claimGroup(r) === 'paid').reduce((s, r) => s + amountOf(r), 0);

  const counts: Record<Filter, number> = { all: list.length, open: 0, paid: 0, rejected: 0 };
  for (const r of list) counts[claimGroup(r)] += 1;
  const groupsUsed = (['open', 'paid', 'rejected'] as const).filter((g) => counts[g] > 0).length;
  // A filter whose group has emptied (after a refresh) falls back to All, so the list never sits empty
  // with no pill to undo it.
  const filter: Filter = picked !== 'all' && !counts[picked] ? 'all' : picked;
  const filtered = filter === 'all' ? list : list.filter((r) => claimGroup(r) === filter);
  const shown = filtered.slice(0, limit);

  const loading = mine.isLoading;
  const failed = !loading && mine.isError && !mine.data;
  const ready = !loading && !failed;

  const newClaim = () => router.push('/reimbursements/new');
  const openClaim = (r: Reimbursement) => router.push(`/reimbursements/${encodeURIComponent(r.id)}`);

  return (
    <Screen header={<NavHeader title="Expense claims" />} onRefresh={() => Promise.all([mine.refetch(), keka.refetch()])}>
      {loading ? <Skeleton height={232} radius={radius.xxl} /> : null}
      {failed ? <ErrorState message={mine.error?.message ?? ''} onRetry={() => mine.refetch()} /> : null}
      {ready ? (
        <SummaryHero
          icon={BadgeIndianRupee}
          module="expenses"
          label="Still to get back"
          value={toGetBack}
          currency="₹"
          info={paidBack > 0 ? { label: 'Paid back so far', value: rowInr(paidBack) } : undefined}
          sub={open.length ? `${plural(open.length, 'claim')} not paid yet` : list.length ? 'Every claim is settled.' : undefined}
          action={{ title: 'New expense claim', icon: <Plus />, onPress: newClaim }}
        />
      ) : null}

      {ready && toConfirm.length ? (
        <ActivityList title="Needs you">
          {toConfirm.slice(0, NEEDS_YOU_ROWS).map((r) => (
            <ActivityRow
              key={r.id}
              module="expenses"
              icon={BadgeIndianRupee}
              title={`Did you get ${rowInr(r.amount)}?`}
              subtitle={`${[purposeLabel(r.purpose), r.keka_code].filter(Boolean).join(' · ')} · Accounts is paying you`}
              chevron
              onPress={() => setAnswering(r)}
            />
          ))}
          {moreToConfirm > 0 ? <ActivityRow key="more" title={`${moreToConfirm} more`} subtitle="In My claims below" /> : null}
        </ActivityList>
      ) : null}

      {approves && !ownership.isLoading ? (
        <ActivityList>
          <ActivityRow
            module="expenses"
            icon={Inbox}
            title="Approvals are in Inbox"
            subtitle={waiting ? `${waiting} waiting for you` : 'Nothing waiting'}
            chevron
            // The Inbox is a tab: back to the tab bar already underneath, on its project-claims filter.
            onPress={() => router.dismissTo('/inbox?type=keka')}
          />
        </ActivityList>
      ) : null}

      {ready && list.length ? (
        <ActivityList
          title="My claims"
          right={
            groupsUsed > 1 ? (
              <FilterPill<Filter>
                title="Show claims"
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setLimit(PAGE);
                }}
                options={(['all', 'open', 'paid', 'rejected'] as const)
                  .filter((k) => k === 'all' || counts[k] > 0 || k === filter)
                  .map((k) => ({ value: k, label: FILTER_LABEL[k], count: counts[k] }))}
              />
            ) : undefined
          }
          empty="No claims here.">
          {shown.map((r, i) => (
            <ClaimRow key={r.id || i} claim={r} today={today} onPress={() => openClaim(r)} />
          ))}
        </ActivityList>
      ) : null}
      {ready && filtered.length > shown.length ? (
        <Button
          title={`Show more (${filtered.length - shown.length})`}
          variant="text"
          size="md"
          onPress={() => setLimit((n) => n + PAGE)}
          style={styles.more}
        />
      ) : null}

      {loading ? <SkeletonList rows={4} avatar /> : null}
      {ready && !list.length ? (
        <EmptyState icon={<HandCoins color={palette.textMuted} />} title="No claims yet" message="Spent your own money on work? Claim it back here." />
      ) : null}

      <RespondSheet claim={answering} initial={null} onClose={() => setAnswering(null)} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  more: { alignSelf: 'center' },
}));
