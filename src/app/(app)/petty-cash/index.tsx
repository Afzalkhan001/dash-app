// Petty cash — small office expenses (the employee side of dash.html's PettyCashHub, Accounts →
// Petty Cash ~L16277). One screen, in the order state → action → history (Payno list screen):
//   1. the light summary hero: what I have left to spend (my own totals, the website's Tracking
//      figures), money on the way, a striped bar of bills against the money given, and the one main
//      action, "Request money";
//   2. "Needs you" — only when a payment waits for my "did you get it?" or a request raised for me
//      waits for its code (each row opens the sheet that answers it);
//   3. shortcuts as a CategoryGrid: Add bills, My bills, Expense reports, and — for people who approve
//      petty cash — Approvals (they live only in the Inbox, the same place Expense claims sends them);
//   4. my latest requests, with "See all".
// Old links /petty-cash?tab=requests|bills|statements|approvals open the screen that holds that list.
// The Inbox is a tab, so it is reached with router.dismissTo (back to the tabs already underneath)
// rather than router.push, which would stack a second copy of the tab bar on top of this screen.

import { useQueryClient } from '@tanstack/react-query';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { BadgeIndianRupee, Camera, FileSpreadsheet, Inbox, KeyRound, Plus, ReceiptText, Wallet } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';

import { type PettyCashRequest, useKekaProjects, usePettyCashOverview } from '@/api/petty-cash';
import { useSession } from '@/auth/session';
import { OtpConfirmSheet, PaymentRespondSheet, PettyCashHero } from '@/features/petty-cash/components';
import { PettyRequestsCard } from '@/features/petty-cash/lists';
import {
  amount,
  awaitingMyApproval,
  billBatches,
  isKekaCodeOwner,
  isPettyCashApprover,
  list,
  myPettyTasks,
  myRequests,
  myTotals,
  roleSeesPettyCash,
  rowMoney,
} from '@/features/petty-cash/logic';
import { palette, radius } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  CategoryGrid,
  type CategoryItem,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  Skeleton,
  SkeletonList,
  toast,
  useLayout,
} from '@/ui';

const PREVIEW_ROWS = 3;

const INBOX_PETTY: Href = '/inbox?type=petty';
// Requests that have not been approved yet (the hero shows them while nothing is approved).
const NOT_APPROVED_YET = ['pending_confirmation', 'pending_approval', 'pending_accounts_approval'];

// Where each of the old tabs lives now.
const OLD_TABS: Record<string, Href> = {
  requests: '/petty-cash/requests',
  bills: '/petty-cash/bills',
  statements: '/petty-cash/statement',
  approvals: INBOX_PETTY,
};

export default function PettyCashScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { compact } = useLayout();
  const user = useSession((s) => s.user);
  const allowed = roleSeesPettyCash(user);
  const overviewQ = usePettyCashOverview(allowed);
  const projectsQ = useKekaProjects(allowed);
  const [otpFor, setOtpFor] = useState<PettyCashRequest | null>(null);
  const [respondTo, setRespondTo] = useState<PettyCashRequest | null>(null);

  // An old tab link opens the screen that now holds that list (once per link).
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const tab = typeof params.tab === 'string' ? params.tab : '';
    const to = OLD_TABS[tab];
    if (!allowed || !to || opened.current === tab) return;
    opened.current = tab;
    if (tab === 'approvals') router.dismissTo(to);
    else router.push(to);
  }, [params.tab, allowed, router]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['petty'] });
  const header = <NavHeader title="Petty cash" subtitle="Small office expenses" />;
  const data = overviewQ.data;

  if (!allowed) {
    return (
      <Screen header={header}>
        <EmptyState icon={<Wallet color={palette.textMuted} />} title="Petty cash isn’t available" message="It isn’t part of your role in DASH." />
      </Screen>
    );
  }

  if (!data) {
    // Skeletons sit in the same Screen slots as the content, so the data replaces them in place.
    const loading = overviewQ.isLoading;
    return (
      <Screen header={header} onRefresh={refresh}>
        {loading ? (
          <Skeleton height={compact ? 300 : 316} radius={radius.xxl} />
        ) : (
          <ErrorState message={overviewQ.error?.message || 'Could not load petty cash.'} onRetry={() => void overviewQ.refetch()} />
        )}
        {/* slot of "Needs you" */}
        {null}
        {loading ? <Skeleton height={96} radius={radius.xl} /> : null}
        {loading ? <SkeletonList rows={PREVIEW_ROWS} avatar /> : null}
      </Screen>
    );
  }

  const me = user?.id ?? '';
  const requests = list(data.requests).filter(Boolean);
  const subs = list(data.subs).filter(Boolean);
  const totals = myTotals(me, requests, list(data.bills), subs);
  const mine = myRequests(me, requests);
  // Money asked for me that is not approved yet.
  const notApproved = mine
    .filter((r) => r.employeeId === me && r.kind !== 'excess' && NOT_APPROVED_YET.includes(r.status))
    .reduce((s, r) => s + amount(r.amount), 0);
  const tasks = myPettyTasks(me, requests);
  const waiting = awaitingMyApproval(user, requests);
  // Who used to have the Approvals tab: Accounts, a project owner, or anyone with a request waiting on them.
  const approves = waiting.length > 0 || isPettyCashApprover(user) || isKekaCodeOwner(user, list(projectsQ.data));
  const reports = billBatches(subs);
  const overBills = list(data.excess).length > 0;

  // "Needs you": what only I can answer, at most three rows (the rest are in My requests).
  const taskRows = [
    ...tasks.answer.map((r) => (
      <ActivityRow
        key={`answer-${r.id}`}
        module="pettyCash"
        icon={BadgeIndianRupee}
        title={`Did you get ${rowMoney(r.amount)}?`}
        subtitle={`${r.kekaCode || 'Petty cash'} · Accounts is paying you`}
        chevron
        onPress={() => setRespondTo(r)}
      />
    )),
    ...tasks.confirm.map((r) => (
      <ActivityRow
        key={`confirm-${r.id}`}
        module="pettyCash"
        icon={KeyRound}
        title={`Confirm ${rowMoney(r.amount)}`}
        subtitle={`Asked for you by ${r.requestedByName || 'a teammate'} · enter the code`}
        chevron
        onPress={() => setOtpFor(r)}
      />
    )),
  ];
  const moreTasks = taskRows.length - PREVIEW_ROWS;

  const shortcuts: CategoryItem[] = [
    { key: 'add-bills', label: 'Add bills', icon: Camera, module: 'pettyCash', hint: 'For petty cash you were given', onPress: () => router.push('/petty-cash/bills/new') },
  ];
  if (subs.length) {
    shortcuts.push({
      key: 'bills',
      label: 'My bills',
      icon: ReceiptText,
      module: 'pettyCash',
      // A brand dot when some bills went over the petty cash (the screen explains it).
      badge: overBills ? true : undefined,
      accessibilityLabel: overBills ? 'My bills, some are over your petty cash' : `My bills, ${subs.length}`,
      onPress: () => router.push('/petty-cash/bills'),
    });
  }
  if (reports.length) {
    shortcuts.push({ key: 'reports', label: 'Expense reports', icon: FileSpreadsheet, module: 'pettyCash', onPress: () => router.push('/petty-cash/statement') });
  }
  if (approves) {
    shortcuts.push({
      key: 'approvals',
      label: 'Approvals',
      icon: Inbox,
      module: 'pettyCash',
      badge: waiting.length || undefined,
      hint: 'Opens Inbox',
      accessibilityLabel: waiting.length ? `Approvals in Inbox, ${waiting.length} waiting for you` : 'Approvals in Inbox, nothing waiting',
      onPress: () => router.dismissTo(INBOX_PETTY),
    });
  }

  return (
    <>
      <Screen header={header} onRefresh={refresh}>
        <PettyCashHero
          remaining={totals.remaining}
          advance={totals.advance}
          spent={totals.spent}
          awaitingPayment={totals.awaitingPayment}
          extra={totals.extra}
          waiting={notApproved}
          action={{ title: 'Request money', icon: <Plus />, onPress: () => router.push('/petty-cash/new') }}
        />

        {taskRows.length ? (
          <ActivityList title="Needs you">
            {taskRows.slice(0, PREVIEW_ROWS)}
            {moreTasks > 0 ? (
              <ActivityRow
                key="more"
                title={`${moreTasks} more`}
                subtitle="See them in Petty cash requests"
                chevron
                onPress={() => router.push('/petty-cash/requests')}
              />
            ) : null}
          </ActivityList>
        ) : null}

        <CategoryGrid items={shortcuts} />

        {mine.length ? (
          <PettyRequestsCard
            title="My requests"
            data={data}
            meId={me}
            limit={PREVIEW_ROWS}
            onSeeAll={mine.length > PREVIEW_ROWS ? () => router.push('/petty-cash/requests') : undefined}
          />
        ) : null}
      </Screen>

      <OtpConfirmSheet
        request={otpFor}
        visible={!!otpFor}
        onClose={() => setOtpFor(null)}
        onDone={() => {
          setOtpFor(null);
          toast.show('Request confirmed');
          void refresh();
        }}
      />
      <PaymentRespondSheet
        request={respondTo}
        initial={null}
        visible={!!respondTo}
        onClose={() => setRespondTo(null)}
        onDone={() => {
          setRespondTo(null);
          void refresh();
        }}
      />
    </>
  );
}
