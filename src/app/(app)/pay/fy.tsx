// Tax summary — GET /hr/payslips/fy-summary?fy=<start year> (hr_payroll.js ~L542): totals of my
// LOCKED payslips in one financial year. The website shows the current year as one line above the
// payslips table (dash.html ~L5061); here any year I have payslips for can be picked. It is not
// Form 16 — HR shares that separately, as the website says.
//
// NavHeader (with the eye), a year PillSelector (only with more than one year; it opens a menu of the
// years), then the light SummaryHero with the income tax (TDS) taken so far and the months it covers,
// then one Payno SummaryCard with how the year adds up.

import { CalendarDays, Landmark } from 'lucide-react-native';
import { useState } from 'react';

import { useFySummary, useMyPayslips } from '@/api/pay';
import { useTodayIst } from '@/features/attendance/use-now';
import { heroAmount, PayHeader, PaySkeleton, PayUnavailable } from '@/features/pay/components';
import { amountOf, fyLabel, fyOf, fyShort, monthRange, rowsOf } from '@/features/pay/format';
import { usePayMoney } from '@/features/pay/privacy';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { moduleTone } from '@/theme/tokens';
import { EmptyState, ErrorState, MenuSheet, PillSelector, Screen, SummaryCard, SummaryHero, Text } from '@/ui';

export default function FySummaryScreen() {
  const pa = usePayAccess();
  const money = usePayMoney();
  const currentFy = fyOf(useTodayIst().slice(0, 7));
  const [picked, setPicked] = useState(String(currentFy));
  const [picking, setPicking] = useState(false);
  const fy = Number(picked);
  const slipsQ = useMyPayslips(pa.payslips);
  const q = useFySummary(fy, pa.payslips);

  const header = <PayHeader title="Tax summary" privacy={pa.payslips} />;

  if (pa.loading) {
    return (
      <Screen header={header}>
        <PaySkeleton card rows={0} />
      </Screen>
    );
  }
  if (!pa.payslips) {
    return (
      <Screen header={header}>
        <PayUnavailable systemRole={pa.isSystemRole} feature="payslips" />
      </Screen>
    );
  }

  const slips = rowsOf(slipsQ.data);
  const years = [...new Set([currentFy, ...slips.map((s) => fyOf(s.month))])].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
  const s = q.data;
  const months = Array.isArray(s?.months) ? s.months.filter((m): m is string => typeof m === 'string') : [];
  const isCurrent = fy === currentFy;
  const ready = !!s && months.length > 0 && !q.isLoading && !q.isError;
  const range = monthRange(months[0], months[months.length - 1]);

  return (
    <>
      <Screen header={header} onRefresh={() => Promise.all([q.refetch(), slipsQ.refetch()])}>
        {years.length > 1 ? (
          <PillSelector
            icon={CalendarDays}
            label={fyLabel(fy)}
            onPress={() => setPicking(true)}
            accessibilityLabel={`${fyLabel(fy)}, change year`}
            style={styles.picker}
          />
        ) : null}

        {q.isLoading ? (
          <PaySkeleton card rows={0} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
        ) : !s || months.length === 0 ? (
          <EmptyState
            icon={<Landmark color={moduleTone.pay.fg} strokeWidth={1.8} />}
            title={`No payslips in financial year ${fyShort(fy)}`}
            message={isCurrent ? 'This fills in as each month’s payslip comes out.' : 'You have no payslips for that year.'}
          />
        ) : (
          <SummaryHero
            icon={Landmark}
            module="pay"
            label={isCurrent ? 'Income tax (TDS) so far' : 'Income tax (TDS) for the year'}
            {...heroAmount(s.tds, money.hidden)}
            info={{ label: range, value: plural(months.length, 'payslip') }}
            sub={years.length > 1 ? undefined : fyLabel(fy)}
          />
        )}

        {ready && s ? (
          <SummaryCard
            title="How the year adds up"
            rows={[
              { key: 'gross', label: 'Gross pay', value: money.inr(s.gross) },
              { key: 'taxable', label: 'Taxable pay', value: money.inr(s.taxable_gross) },
              { key: 'tds', label: 'Income tax (TDS)', value: money.inr(s.tds) },
              { key: 'pf', label: 'Provident fund (PF)', value: money.inr(s.pf) },
              ...(amountOf(s.esi) > 0 ? [{ key: 'esi', label: 'Health insurance (ESI)', value: money.inr(s.esi) }] : []),
              ...(amountOf(s.pt) > 0 ? [{ key: 'pt', label: 'Professional tax', value: money.inr(s.pt) }] : []),
            ]}
            total={{ label: 'Take-home pay', value: money.inr(s.net) }}
          />
        ) : null}

        {ready ? (
          <Text variant="caption" muted align="center">
            This is not Form 16. HR shares that separately.
          </Text>
        ) : null}
      </Screen>

      <MenuSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Financial year"
        items={years.map((y) => ({
          key: String(y),
          label: fyLabel(y),
          hint: [y === currentFy ? 'This year' : null, y === fy ? 'Showing now' : null].filter(Boolean).join(' · ') || undefined,
          icon: CalendarDays,
          onPress: () => setPicked(String(y)),
        }))}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  picker: { alignSelf: 'flex-start' },
}));
