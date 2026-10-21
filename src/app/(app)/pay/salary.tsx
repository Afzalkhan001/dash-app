// Salary details — the website's MySalaryCard (dash.html ~L5047) from GET /hr/salary/mine.
// NavHeader (with the eye), then the light SummaryHero: the annual salary (CTC) with what that is a
// month and since when, and how the month's pay splits between its parts as one bar (shares, so it
// stays while amounts are hidden). Then two Payno SummaryCards: what I earn each month (adding up to
// the monthly gross), and what the company pays on top as part of the CTC (adding up to its own
// total, so every bold line is the sum of the rows above it).
// Deductions (PF, tax) are worked out each month in payroll, so take-home pay is on the payslips.

import { BadgeIndianRupee } from 'lucide-react-native';
import { View } from 'react-native';

import { useMySalary } from '@/api/pay';
import { useTodayIst } from '@/features/attendance/use-now';
import { heroAmount, PayHeader, PaySkeleton, PayUnavailable } from '@/features/pay/components';
import { amountOf, rowsOf, ymdLabel } from '@/features/pay/format';
import { usePayMoney } from '@/features/pay/privacy';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { themedStyles } from '@/theme/themed';
import { moduleTone, space } from '@/theme/tokens';
import { ChartLegend, EmptyState, ErrorState, Screen, seriesColor, SplitBar, SummaryCard, SummaryHero, Text } from '@/ui';

export default function SalaryScreen() {
  const pa = usePayAccess();
  const money = usePayMoney();
  const today = useTodayIst();
  const q = useMySalary(pa.salary);

  const header = <PayHeader title="Salary details" privacy={pa.salary} />;

  if (pa.loading) {
    return (
      <Screen header={header}>
        <PaySkeleton card rows={0} />
      </Screen>
    );
  }
  if (!pa.salary) {
    return (
      <Screen header={header}>
        <PayUnavailable systemRole={pa.isSystemRole} feature="salary details" />
      </Screen>
    );
  }

  const s = q.data;
  const lines = rowsOf(s?.lines);
  const earnings = lines.filter((l) => l.kind === 'earning');
  const employer = lines.filter((l) => l.kind === 'employer');
  const employerTotal = employer.reduce((t, l) => t + amountOf(l.amount), 0);
  // Stale data under a failed refresh stays hidden behind the error.
  const ready = !!s && !q.isLoading && !q.isError;
  const since = ymdLabel(s?.effective_from, today);
  // The month's pay as one coloured bar: each earning's share of the gross (a share, not an amount,
  // so it stays even while amounts are hidden).
  const earnTotal = earnings.reduce((t, l) => t + Math.max(0, amountOf(l.amount)), 0);
  const mix = earnings.map((l, i) => ({ key: `e${i}`, label: l.name || l.code || 'Pay', value: Math.max(0, amountOf(l.amount)), color: seriesColor(i) }));

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {q.isLoading ? (
        <PaySkeleton card rows={0} />
      ) : q.isError ? (
        <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
      ) : !s ? (
        <EmptyState
          icon={<BadgeIndianRupee color={moduleTone.pay.fg} strokeWidth={1.8} />}
          title="No salary set up yet"
          message="Your salary details show here once HR sets them up."
        />
      ) : (
        <SummaryHero
          icon={BadgeIndianRupee}
          module="pay"
          label="Annual salary (CTC)"
          {...heroAmount(s.annual_ctc, money.hidden)}
          // The CTC a month: what you earn plus what the company pays on top (the two cards below).
          info={{
            label: `${money.inr(s.monthly_ctc, { decimals: false })} a month`,
            accessibilityLabel: money.hidden ? 'Amount a month hidden' : `${money.inr(s.monthly_ctc, { decimals: false })} a month`,
          }}
          sub={since !== '—' ? `Since ${since}` : undefined}>
          {earnTotal > 0 && mix.length > 1 ? (
            <View style={styles.mix}>
              <Text variant="label" muted>
                How your monthly pay splits
              </Text>
              <SplitBar segments={mix} />
              <ChartLegend items={mix.map((m) => ({ key: m.key, label: m.label, color: m.color, value: `${Math.round((m.value / earnTotal) * 100)}%` }))} />
            </View>
          ) : null}
        </SummaryHero>
      )}

      {ready && s ? (
        <SummaryCard
          title="You earn each month"
          rows={earnings.map((l, i) => ({ key: `e${i}`, label: l.name || l.code || 'Pay', value: money.inr(l.amount) }))}
          total={{ label: 'Gross pay', value: money.inr(s.monthly_gross) }}
        />
      ) : null}

      {ready && s && employer.length ? (
        <SummaryCard
          title="Company also pays"
          rows={employer.map((l, i) => ({ key: `c${i}`, label: l.name || l.code || 'Contribution', value: money.inr(l.amount) }))}
          // A short hint, so the total's label keeps its line; how this part relates to the CTC is
          // said in the note under the cards.
          total={{ label: 'Company pays in total', value: money.inr(employerTotal), hint: 'Not paid to you' }}
        />
      ) : null}

      {ready ? (
        <Text variant="caption" muted align="center">
          {employer.length ? 'What the company pays is part of your annual salary (CTC). ' : ''}PF and tax come off each month. Your payslips show what you take home.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  mix: { gap: space.sm, paddingTop: space.xs },
}));
