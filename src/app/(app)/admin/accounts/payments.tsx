// Payments — the website's PaymentsPanel (dash.html:17360): every approved petty cash request, expense
// claim and vendor bill, by where its payment stands. Ready to pay · Being paid · Not received · Received.
// Accounts starts a payment (or starts it again) from the item; the person the money is for then says
// Received or Not received in DASH — only that completes it. There is no "mark paid" anywhere.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Banknote } from 'lucide-react-native';
import { useState } from 'react';

import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeAccountsDesk } from '@/features/accounts/access';
import { canStartPayment, isStage, PAYMENT_STAGES, paymentInfo, STAGE_META, type Stage, sumOf } from '@/features/accounts/model';
import { ItemRow } from '@/features/accounts/ui';
import { mayAct, useAccountsItems } from '@/features/accounts/use-items';
import { shortDate } from '@/features/petty-cash/logic';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import { ActivityList, Banner, Button, EmptyState, ErrorState, NavHeader, Screen, Segmented, SkeletonList, SummaryHero } from '@/ui';

const PAGE = 30;

export default function AccountsPaymentsScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const params = useLocalSearchParams<{ stage?: string }>();
  const desk = useAccountsItems(access);
  const [stage, setStage] = useState<Stage>(isStage(params.stage) && PAYMENT_STAGES.includes(params.stage) ? params.stage : 'ready');
  const [shown, setShown] = useState(PAGE);

  if (!canSeeAccountsDesk(access)) return <Redirect href="/" />;

  // Old petty cash bills are not payments (they are covered by the request they belong to).
  const pays = desk.items.filter((i) => i.type !== 'pcbill' && PAYMENT_STAGES.includes(i.stage));
  const rows = pays.filter((i) => i.stage === stage).sort((a, b) => b.movedAt.localeCompare(a.movedAt));
  const toStart = pays.filter((i) => canStartPayment(i) && mayAct(desk.gates, i.type) && !i.own);

  const note = (stage: Stage, i: (typeof rows)[number]) => {
    const p = paymentInfo(i);
    if (stage === 'ready') return i.own ? 'Yours — someone else has to pay it' : !mayAct(desk.gates, i.type) ? 'View only — Accounts pays it' : `Approved · ${shortDate(i.movedAt, today)}`;
    if (stage === 'processing') return `Started ${shortDate(p.startedAt, today)} · waiting for ${p.whoConfirms}`;
    if (stage === 'not_received') return p.response?.note ? `“${p.response.note}”` : `${p.whoConfirms} said it didn’t arrive`;
    return `Confirmed by ${p.response?.byName || p.whoConfirms}${p.response?.at ? ` · ${shortDate(p.response.at, today)}` : ''}`;
  };

  return (
    <Screen header={<NavHeader title="Payments" />} onRefresh={() => desk.refresh()}>
      <SummaryHero
        icon={Banknote}
        module="pay"
        label="Payments to start"
        value={sumOf(toStart)}
        currency="₹"
        decimals={0}
        info={{ label: plural(toStart.length, 'payment'), value: toStart.some((i) => i.stage === 'not_received') ? 'Some to start again' : 'Approved, not started' }}
        sub="Only the person it is for can say they got the money."
      />
      <Segmented
        options={PAYMENT_STAGES.map((s) => ({ key: s, label: STAGE_META[s].label, badge: pays.filter((i) => i.stage === s).length || undefined }))}
        value={stage}
        onChange={(s) => {
          setStage(s);
          setShown(PAGE);
        }}
      />
      {desk.error ? <ErrorState message={desk.error} onRetry={() => void desk.refresh()} /> : null}
      {desk.partial ? <Banner tone="warning" title="Some lists didn’t load" message={desk.partial} /> : null}
      {desk.loading && !desk.items.length ? (
        <SkeletonList rows={4} avatar />
      ) : rows.length ? (
        <ActivityList title={STAGE_META[stage].label}>
          {rows.slice(0, shown).map((it) => (
            <ItemRow key={it.key} item={it} today={today} note={note(stage, it)} onPress={() => router.push({ pathname: '/admin/accounts/item/[type]/[id]', params: { type: it.type, id: it.id } })} />
          ))}
        </ActivityList>
      ) : !desk.error ? (
        <EmptyState
          icon={<Banknote color={palette.textMuted} strokeWidth={1.8} />}
          title="Nothing here"
          message={pays.length ? `No payments are ${STAGE_META[stage].label.toLowerCase()}.` : 'Payments show up once Accounts approves a request or a bill.'}
        />
      ) : null}
      {rows.length > shown ? <Button title={`Show ${Math.min(PAGE, rows.length - shown)} more`} variant="ghost" size="md" onPress={() => setShown((n) => n + PAGE)} /> : null}
    </Screen>
  );
}
