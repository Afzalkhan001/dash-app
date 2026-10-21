// Subscriptions (SubscriptionsHub, dash.html:11523): software the company pays for. IT Admin, Super
// Admin, CEO and COO manage it; people granted in Company settings read it and share it.
//   GET /subscriptions?actorId, /subscriptions/summary?from&to, /subscriptions/payments?from&to
//   Renewals    active ones renewing within 30 days (overdue first, red) — above everything
//   Range       This financial year (default) · This month · All time · Pick dates (India time)
//   Overview    per month / per year, not in use, spent, missing project codes; by department; by month
//   List        search, status and department filters → a subscription's page
//   Payments    the ledger for the range; managers can delete one (swipe to confirm)
//   + / •••     Add subscription, Record a payment, Share the list as CSV
// Excel import and the three-sheet Excel export stay on the website.

import { Redirect, useRouter } from 'expo-router';
import { CalendarRange, CreditCard, ListFilter, MoreHorizontal, Plus, Receipt, Search, Share2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type SubPayment, useDeletePayment, useSubPayments, useSubscriptions, useSubSummary } from '@/api/company';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeSubscriptionsHub } from '@/features/company/access';
import { periodLabel, type RangeKey, rangeFor, rangeLabel, renewalTone, SUB_STATUSES, subStatus } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { PaymentFormSheet, SubscriptionFormSheet } from '@/features/company/subscription-forms';
import { shareCsv } from '@/lib/csv';
import { dateLabel, monthYear } from '@/lib/dates';
import { inr, plural } from '@/lib/format';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  DateField,
  EmptyState,
  ErrorState,
  HairlineBars,
  MenuSheet,
  NavHeader,
  PillField,
  PillSelector,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
  Skeleton,
  SkeletonList,
  StatGrid,
  StatTile,
  SummaryCard,
  SummaryHero,
  toast,
  useLayout,
} from '@/ui';

type Tab = 'overview' | 'list' | 'payments';
type StatusFilter = 'all' | 'active' | 'not_using' | 'cancelled' | 'renewing';

const money = (n: number) => inr(n, { decimals: false });

export default function SubscriptionsScreen() {
  const router = useRouter();
  const { gap } = useLayout();
  const today = useTodayIst();
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canSeeSubscriptionsHub(user, tenant);

  const [tab, setTab] = useState<Tab>('overview');
  const [rangeKey, setRangeKey] = useState<RangeKey>('fy');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const range = rangeKey === 'custom' ? { from: custom.from, to: custom.to || today } : rangeFor(rangeKey, today);
  const subs = useSubscriptions(allowed);
  const summary = useSubSummary(range, allowed && !subs.isError);
  const payments = useSubPayments(range, allowed && !subs.isError);
  const delPayment = useDeletePayment();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dept, setDept] = useState('');
  const [rangeMenu, setRangeMenu] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [deptMenu, setDeptMenu] = useState(false);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payOpen, setPayOpen] = useState<SubPayment | null>(null);
  const [payDelete, setPayDelete] = useState<SubPayment | null>(null);

  if (ready && !allowed) return <Redirect href="/" />;

  const list = subs.data?.subscriptions ?? [];
  const canManage = !!subs.data?.canManage;
  const denied = subs.error && (subs.error as { status?: number }).status === 403 ? subs.error.message : null;
  const t = summary.data?.totals;
  const departments = [...new Set(list.map((s) => s.department).filter(Boolean))].sort();
  const renewing = list.filter((s) => s.status === 'active' && s.daysToRenewal !== null && s.daysToRenewal <= 30).sort((a, b) => (a.daysToRenewal ?? 0) - (b.daysToRenewal ?? 0));
  const overdue = renewing.filter((s) => (s.daysToRenewal ?? 0) < 0);

  const needle = q.trim().toLowerCase();
  const visible = list.filter((s) => {
    if (status === 'renewing' ? !renewing.includes(s) : status !== 'all' && s.status !== status) return false;
    if (dept && s.department !== dept) return false;
    if (!needle) return true;
    return [s.name, s.department, s.plan, s.kekaCode, s.accountEmail, s.owner, s.comments].some((v) => String(v || '').toLowerCase().includes(needle));
  });
  const pays = payments.data ?? [];

  const shareList = async () => {
    try {
      await shareCsv(`subscriptions-${today}`, visible, [
        { label: 'Name', value: (s) => s.name },
        { label: 'Department', value: (s) => s.department },
        { label: 'Plan', value: (s) => s.plan },
        { label: 'Billing', value: (s) => periodLabel(s.period) },
        { label: 'Status', value: (s) => subStatus(s.status).label },
        { label: 'Amount (INR)', value: (s) => s.amountInr },
        { label: 'Amount (USD)', value: (s) => s.amountUsd },
        { label: 'Per month (INR)', value: (s) => s.monthlyInr },
        { label: 'Per year (INR)', value: (s) => s.yearlyInr },
        { label: 'Next renewal', value: (s) => s.renewalDate },
        { label: 'Project code', value: (s) => s.kekaCode },
        { label: 'Account email', value: (s) => s.accountEmail },
        { label: 'Paid by', value: (s) => s.payee },
        { label: 'How it is paid', value: (s) => s.paymentMode },
        { label: 'Who uses it', value: (s) => s.owner },
        { label: 'Notes', value: (s) => s.comments },
      ], 'Share subscriptions');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The list could not be shared.', 'danger');
    }
  };

  const statusChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: list.length },
    ...SUB_STATUSES.map((s) => ({ key: s.value as StatusFilter, label: s.label, count: list.filter((x) => x.status === s.value).length })),
    { key: 'renewing', label: 'Renewing soon', count: renewing.length },
  ];

  return (
    <Screen
      header={
        <NavHeader
          title="Subscriptions"
          actions={[
            ...(canManage ? [{ icon: Plus, label: 'Add subscription', onPress: () => setAdding(true) }] : []),
            ...(subs.data ? [{ icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) }] : []),
          ]}
        />
      }
      onRefresh={() => Promise.all([subs.refetch(), summary.refetch(), payments.refetch()])}>
      {subs.isPending ? (
        <SkeletonList rows={6} />
      ) : denied ? (
        <EmptyState icon={<CreditCard color={palette.textMuted} />} title="No access to subscriptions" message={denied} />
      ) : subs.isError ? (
        <ErrorState message={subs.error?.message ?? ''} onRetry={() => void subs.refetch()} />
      ) : (
        // A View, not a fragment: Screen spaces its direct children only, so a fragment's pieces sat
        // flush against each other.
        <View style={{ gap }}>
          {renewing.length ? (
            <Banner
              tone={overdue.length ? 'danger' : 'warning'}
              title={
                overdue.length
                  ? [`${plural(overdue.length, 'renewal')} past due`, renewing.length > overdue.length ? `${renewing.length - overdue.length} more in 30 days` : ''].filter(Boolean).join(', ')
                  : `${plural(renewing.length, 'renewal')} in the next 30 days`
              }
              message={renewing
                .slice(0, 3)
                .map((s) => `${s.name}: ${renewalTone(s.daysToRenewal)?.label.toLowerCase() ?? ''}`)
                .join('\n')}
              action={{
                label: 'See them',
                onPress: () => {
                  setTab('list');
                  setStatus('renewing');
                },
              }}
            />
          ) : null}

          <Segmented
            options={[
              { key: 'overview', label: 'Overview' },
              { key: 'list', label: 'All', badge: list.length },
              { key: 'payments', label: 'Payments' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Row style={{ gap: space.xs, flexWrap: 'wrap', marginTop: -space.xs }}>
            <PillSelector icon={CalendarRange} label={rangeLabel(rangeKey, range, today)} onPress={() => setRangeMenu(true)} accessibilityLabel={`Spending dates: ${rangeLabel(rangeKey, range, today)}`} />
          </Row>

          {tab === 'overview' ? (
            <>
              {t ? (
                <SummaryHero
                  icon={CreditCard}
                  module="vendor"
                  label="Costs per month"
                  value={t.monthlyInr}
                  currency="₹"
                  decimals={0}
                  info={{ label: 'A year', value: money(t.yearlyInr) }}
                  sub="Active subscriptions only"
                />
              ) : summary.isError ? (
                <ErrorState message={summary.error?.message ?? 'The totals could not be loaded.'} onRetry={() => void summary.refetch()} />
              ) : (
                <Skeleton height={236} radius={radius.xl} />
              )}
              {t ? (
                <StatGrid columns={2}>
                  <StatTile variant="light" label="Active" value={t.activeCount} caption={`${t.cancelledCount} cancelled`} />
                  <StatTile
                    variant="light"
                    label="Not in use, a month"
                    value={money(t.wastedMonthlyInr)}
                    caption={`${plural(t.notUsingCount, 'subscription')} · ${money(t.wastedYearlyInr)} a year`}
                    valueColor={t.wastedMonthlyInr > 0 ? palette.warningInk : undefined}
                  />
                  <StatTile variant="light" label="Spent" value={money(t.spendInRangeInr)} caption={plural(t.paymentsInRange, 'payment')} />
                  <StatTile
                    variant="light"
                    label="No project code"
                    value={t.kekaMissingCount}
                    caption="Active or not in use"
                    valueColor={t.kekaMissingCount > 0 ? palette.dangerInk : undefined}
                  />
                </StatGrid>
              ) : summary.isError ? null : (
                <StatGrid columns={2}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} height={128} radius={radius.xl} />
                  ))}
                </StatGrid>
              )}

              {summary.data?.byDepartment.length ? (
                <ActivityList title="By department" overline="Standing costs, and spend in these dates">
                  {summary.data.byDepartment.map((d) => (
                    <ActivityRow
                      key={d.department}
                      title={d.department}
                      subtitle={[`${d.activeCount} active · ${money(d.monthlyInr)} a month`, d.wastedMonthlyInr > 0 ? `${money(d.wastedMonthlyInr)} not in use` : ''].filter(Boolean).join(' · ')}
                      value={money(d.yearlyInr)}
                      meta={`a year · ${money(d.spendInRangeInr)} spent`}
                    />
                  ))}
                </ActivityList>
              ) : summary.data ? (
                <EmptyState title="Nothing tracked yet" message={canManage ? 'Tap + to add a subscription.' : undefined} />
              ) : null}

              {summary.data?.byMonth.length ? (
                <View style={{ gap: gap - 8 }}>
                  <SectionHeader title="Month by month" overline="Spent in these dates" />
                  <Card padded>
                    <HairlineBars
                      values={summary.data.byMonth.slice(-8).map((m) => m.amountInr)}
                      labels={summary.data.byMonth.slice(-8).map((m) => monthYear(m.month, 'short').slice(0, 3))}
                      highlight={Math.min(summary.data.byMonth.length, 8) - 1}
                      formatTop={(v) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : money(v))}
                    />
                  </Card>
                </View>
              ) : null}
            </>
          ) : tab === 'list' ? (
            <>
              <PillField icon={Search} placeholder="Search name, team, project code, owner" value={q} onChangeText={setQ} autoCorrect={false} />
              <ChipRow>
                {statusChips.map((c) => (
                  <Chip key={c.key} label={c.label} count={c.count} selected={status === c.key} onPress={() => setStatus(c.key)} />
                ))}
              </ChipRow>
              <View style={{ gap: gap - 8 }}>
                <SectionHeader
                  title={`${visible.length} of ${list.length}`}
                  right={departments.length ? <PillSelector icon={ListFilter} label={dept || 'Any team'} onPress={() => setDeptMenu(true)} accessibilityLabel={`Team: ${dept || 'any'}`} /> : undefined}
                />
                {visible.length ? (
                  <ActivityList>
                    {visible.map((s) => {
                      const rt = s.status === 'active' ? renewalTone(s.daysToRenewal) : null;
                      const st = subStatus(s.status);
                      return (
                        <ActivityRow
                          key={s.id}
                          module="vendor"
                          icon={CreditCard}
                          title={s.name}
                          subtitle={[s.department, s.plan].filter(Boolean).join(' · ') || undefined}
                          note={s.kekaMissing && s.status !== 'cancelled' ? 'No project code' : undefined}
                          value={money(s.amountInr)}
                          meta={rt ? undefined : periodLabel(s.period)}
                          status={rt ? { label: rt.label, tone: rt.tone } : s.status !== 'active' ? { label: st.label, tone: st.tone } : null}
                          chevron
                          onPress={() => router.push(`/admin/company/subscriptions/${encodeURIComponent(s.id)}`)}
                        />
                      );
                    })}
                  </ActivityList>
                ) : (
                  <EmptyState
                    title="Nothing matches"
                    action={<Button title="Show all" variant="accent" size="md" onPress={() => { setQ(''); setStatus('all'); setDept(''); }} />}
                  />
                )}
              </View>
            </>
          ) : (
            <View style={{ gap: gap - 8 }}>
              <SectionHeader title={payments.data ? money(t?.spendInRangeInr ?? pays.reduce((a, p) => a + p.amountInr, 0)) : '…'} overline={plural(pays.length, 'payment')} />
              {payments.isPending ? (
                <SkeletonList rows={5} />
              ) : payments.isError && !payments.data ? (
                <ErrorState message={payments.error?.message ?? ''} onRetry={() => void payments.refetch()} />
              ) : pays.length ? (
                <ActivityList>
                  {pays.map((p) => (
                    <ActivityRow
                      key={p.id}
                      module="pay"
                      icon={Receipt}
                      title={p.name}
                      subtitle={[dateLabel(p.paidOn, today), p.department].filter(Boolean).join(' · ')}
                      note={p.comments || (p.kekaMissing ? 'No project code' : undefined)}
                      value={inr(p.amountInr)}
                      meta={p.amountUsd ? `US$${p.amountUsd}` : undefined}
                      onPress={() => setPayOpen(p)}
                    />
                  ))}
                </ActivityList>
              ) : (
                <EmptyState title="No payments in these dates" message="Pick other dates from the date pill." />
              )}
            </View>
          )}
        </View>
      )}

      <MenuSheet
        visible={rangeMenu}
        onClose={() => setRangeMenu(false)}
        title="Spending dates"
        items={[
          { key: 'fy', label: rangeLabel('fy', range, today), onPress: () => setRangeKey('fy') },
          { key: 'month', label: 'This month', onPress: () => setRangeKey('month') },
          { key: 'all', label: 'All time', onPress: () => setRangeKey('all') },
          {
            key: 'custom',
            label: 'Pick dates',
            onPress: () => {
              setDraft({ from: range.from, to: range.to });
              setCustomOpen(true);
            },
          },
        ].map((i) => ({ ...i, icon: CalendarRange, selected: i.key === rangeKey }))}
      />
      <Sheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Pick dates"
        footer={
          <Button
            title="Show"
            disabled={!draft.from || (!!draft.to && draft.to < draft.from)}
            onPress={() => {
              setCustom(draft);
              setRangeKey('custom');
              setCustomOpen(false);
            }}
          />
        }>
        <DateField label="From" value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} maximumDate={today} />
        <DateField label="To" value={draft.to} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} maximumDate={today} />
      </Sheet>
      <MenuSheet
        visible={deptMenu}
        onClose={() => setDeptMenu(false)}
        title="Team"
        items={[{ key: '', label: 'Any team' }, ...departments.map((d) => ({ key: d, label: d }))].map((d) => ({
          key: d.key || 'any',
          label: d.label,
          selected: d.key === dept,
          onPress: () => setDept(d.key),
        }))}
      />
      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Subscriptions"
        items={[
          ...(canManage ? [{ key: 'pay', label: 'Record a payment', icon: Receipt, onPress: () => setPaying(true) }] : []),
          { key: 'share', label: `Share the list (${visible.length}) as CSV`, icon: Share2, onPress: () => void shareList() },
        ]}
      />

      <SubscriptionFormSheet visible={adding} onClose={() => setAdding(false)} existing={null} departments={departments} />
      <PaymentFormSheet visible={paying} onClose={() => setPaying(false)} subs={list} />

      <Sheet visible={!!payOpen} onClose={() => setPayOpen(null)} title={payOpen?.name ?? 'Payment'} subtitle={payOpen ? dateLabel(payOpen.paidOn, today) : undefined}>
        {payOpen ? (
          <>
            <SummaryCard
              rows={[
                { key: 'amount', label: 'Amount', value: inr(payOpen.amountInr), hint: payOpen.amountUsd ? `US$${payOpen.amountUsd}` : null },
                { key: 'dept', label: 'Department', value: payOpen.department || '—' },
                { key: 'plan', label: 'Plan', value: payOpen.plan || '—' },
                { key: 'code', label: 'Project code', value: payOpen.kekaCode || 'Missing', valueColor: payOpen.kekaCode ? undefined : palette.dangerInk },
                { key: 'notes', label: 'Notes', value: payOpen.comments || '—' },
              ]}
            />
            {canManage ? (
              <Button
                variant="danger"
                title="Delete this payment"
                icon={<Trash2 />}
                onPress={() => {
                  setPayDelete(payOpen);
                  setPayOpen(null);
                }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={!!payDelete}
        onClose={() => setPayDelete(null)}
        title="Delete this payment?"
        from={{ title: payDelete?.name ?? '', subtitle: payDelete ? dateLabel(payDelete.paidOn, today) : '', icon: Receipt, module: 'pay' }}
        to={{ title: 'Deleted', subtitle: 'Totals go down', icon: Trash2, module: 'security' }}
        confirmLabel="Swipe to delete"
        onConfirm={() => {
          const p = payDelete;
          if (!p) return;
          delPayment.mutate(p.id, {
            onSuccess: () => {
              setPayDelete(null);
              toast.show('Payment deleted', 'success');
            },
            onError: (e) => toast.show(`Couldn’t delete: ${e.message}`, 'danger'),
          });
        }}
        loading={delPayment.isPending}
        note="This can’t be undone. No one is notified.">
        {payDelete ? <SummaryCard rows={[{ key: 'amount', label: 'Amount', value: inr(payDelete.amountInr) }]} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}
