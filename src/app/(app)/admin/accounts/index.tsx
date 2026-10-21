// The Accounts desk — the website's Bill Approvals (dash.html:34803) shaped for a phone:
//   1. a light hero: the amount waiting for approval, and how many items;
//   2. the six stages as tiles (Waiting · Ready to pay · Being paid · Not received · Received · Rejected),
//      each opening the list on that stage;
//   3. the tools: the list, payments, vendors, agreements, expense reports, expense types, payment timeline;
//   4. the newest items waiting, with "See all".
// Accounts and Super Admin; CEO / COO see petty cash only, view only (canSeeAccountsDesk). The petty cash
// ledger, Excel and the full print stay on the website.

import { Redirect, useRouter } from 'expo-router';
import { CalendarClock, FileSignature, FileSpreadsheet, Landmark, ListChecks, Play, Shapes, Store } from 'lucide-react-native';

import { useTodayIst } from '@/features/attendance/use-now';
import { canEditPaymentTimeline, canSeeAccountsDesk, canSeeAgreements, canSeePettyAdmin, canSeeVendors } from '@/features/accounts/access';
import { STAGE_META, STAGES, sumOf } from '@/features/accounts/model';
import { ItemRow } from '@/features/accounts/ui';
import { useAccountsItems } from '@/features/accounts/use-items';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { radius } from '@/theme/tokens';
import { ActivityList, Banner, CategoryGrid, type CategoryItem, ErrorState, NavHeader, Screen, Skeleton, StatGrid, StatTile, SummaryHero, TourTarget, useLayout } from '@/ui';

const PREVIEW = 4;

export default function AccountsDeskScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const { compact } = useLayout();
  const desk = useAccountsItems(access);

  if (!canSeeAccountsDesk(access)) return <Redirect href="/" />;

  const g = desk.gates;
  const actor = g.actBills || g.actPetty || g.actClaims;
  const waiting = desk.items.filter((i) => i.stage === 'awaiting');
  const mine = waiting.filter((i) => !i.own);
  const loaded = !desk.loading || desk.items.length > 0;
  const count = (s: (typeof STAGES)[number]) => desk.items.filter((i) => i.stage === s).length;

  const tools: CategoryItem[] = [
    { key: 'list', label: 'All items', icon: ListChecks, module: 'expenses', hint: 'Opens everything on the desk, with filters', onPress: () => router.push('/admin/accounts/queue') },
    { key: 'pay', label: 'Payments', icon: Play, module: 'pay', hint: 'Opens the payments to start or follow up', onPress: () => router.push('/admin/accounts/payments') },
    ...(canSeeVendors(access) ? [{ key: 'vendors', label: 'Vendors', icon: Store, module: 'vendor' as const, hint: 'Opens vendor registrations and the vendor list', onPress: () => router.push('/admin/accounts/vendors') }] : []),
    ...(canSeeAgreements(access) ? [{ key: 'agree', label: 'Agreements', icon: FileSignature, module: 'vendor' as const, hint: 'Opens vendor agreements', onPress: () => router.push('/admin/accounts/agreements') }] : []),
    ...(canSeePettyAdmin(access)
      ? [
          { key: 'reports', label: 'Expense reports', icon: FileSpreadsheet, module: 'pettyCash' as const, hint: 'Opens everyone’s petty cash expense reports', onPress: () => router.push('/admin/accounts/petty/tracking') },
          { key: 'heads', label: 'Expense types', icon: Shapes, module: 'pettyCash' as const, hint: 'Opens the petty cash expense types', onPress: () => router.push('/admin/accounts/petty/heads') },
        ]
      : []),
    ...(canEditPaymentTimeline(access) ? [{ key: 'timeline', label: 'Payment timeline', icon: CalendarClock, module: 'vendor' as const, hint: 'Opens what vendor bill senders are told', onPress: () => router.push('/admin/accounts/settings') }] : []),
  ];

  return (
    <Screen header={<NavHeader title="Accounts desk" />} onRefresh={() => desk.refresh()}>
      {loaded ? (
        <SummaryHero
          icon={Landmark}
          module="expenses"
          label={actor ? 'Waiting for you to approve' : 'Waiting for Accounts'}
          value={sumOf(actor ? mine : waiting)}
          currency="₹"
          decimals={0}
          info={{ label: plural((actor ? mine : waiting).length, 'item'), value: actor ? 'Approve in the Inbox or here' : 'View only' }}
          onArrowPress={() => router.push({ pathname: '/admin/accounts/queue', params: { stage: 'awaiting' } })}
          arrowLabel="Open what is waiting"
        />
      ) : (
        <Skeleton height={compact ? 196 : 208} radius={radius.xxl} />
      )}

      {desk.error ? <ErrorState message={desk.error} onRetry={() => void desk.refresh()} /> : null}
      {desk.partial ? <Banner tone="warning" title="Some lists didn’t load" message={desk.partial} /> : null}

      <StatGrid columns={2}>
        {STAGES.map((s) => (
          <StatTile
            key={s}
            label={STAGE_META[s].label}
            value={loaded ? count(s) : '–'}
            caption={STAGE_META[s].hint}
            onPress={() => router.push({ pathname: '/admin/accounts/queue', params: { stage: s } })}
          />
        ))}
      </StatGrid>

      <TourTarget id="accounts.desk.tools">
        <CategoryGrid items={tools} columns={4} />
      </TourTarget>

      <ActivityList
        title="Waiting"
        onSeeAll={waiting.length > PREVIEW ? () => router.push({ pathname: '/admin/accounts/queue', params: { stage: 'awaiting' } }) : undefined}
        loading={!loaded}
        empty="Nothing waiting on Accounts right now.">
        {waiting.slice(0, PREVIEW).map((it) => (
          <ItemRow key={it.key} item={it} today={today} onPress={() => router.push({ pathname: '/admin/accounts/item/[type]/[id]', params: { type: it.type, id: it.id } })} />
        ))}
      </ActivityList>
    </Screen>
  );
}
