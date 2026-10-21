// One payslip. The employee API returns only its totals (gross, deductions, net — hr_payroll.js
// GET /hr/payslips/mine); the line-by-line earnings and deductions, paid days and loss-of-pay days
// live in the PDF (GET /hr/payslips/:itemId/pdf), which is downloaded with the bearer header and
// handed to the share sheet — the app equivalent of the website's "Download PDF" button.
//
// NavHeader (the month, with the eye), then the light SummaryHero: the take-home figure with how much
// of the gross reaches you as one bar (a share, so it stays while amounts are hidden), then a Payno
// SummaryCard with how it adds up (gross − deductions + salary claims paid = take-home), then "Save or
// share PDF" as the one primary in the sticky bar (it opens the phone's share menu, so the label says
// so — "Download" made people think it failed). A failed download shows right above it.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { payslipPdfPath, useMyPayslips } from '@/api/pay';
import { heroAmount, PayHeader, PaySkeleton, PayUnavailable } from '@/features/pay/components';
import { amountOf, monthName, rowsOf } from '@/features/pay/format';
import { usePayMoney } from '@/features/pay/privacy';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { downloadAuthed, shareFile } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import { ActionBar, Button, ChartLegend, EmptyState, ErrorState, haptic, Screen, SplitBar, SummaryCard, SummaryHero, Text } from '@/ui';

export default function PayslipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const pa = usePayAccess();
  const money = usePayMoney();
  const q = useMyPayslips(pa.payslips);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slip = rowsOf(q.data).find((s) => s.id === id);

  const header = <PayHeader title={slip ? monthName(slip.month) : 'Payslip'} privacy={pa.payslips} />;

  const download = async () => {
    if (!slip || busy) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await downloadAuthed(payslipPdfPath(slip.id), `Payslip-${slip.month}.pdf`);
      haptic.success();
      await shareFile(uri, 'application/pdf', `Payslip — ${monthName(slip.month)}`);
    } catch (e) {
      haptic.error();
      setError(e instanceof Error && e.message ? e.message : 'Couldn’t download the payslip. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (pa.loading || (pa.payslips && q.isLoading)) {
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
  if (q.isError && !slip) {
    return (
      <Screen header={header} onRefresh={() => q.refetch()}>
        <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  if (!slip) {
    return (
      <Screen header={header} onRefresh={() => q.refetch()}>
        <EmptyState
          icon={<FileText color={moduleTone.pay.fg} strokeWidth={1.8} />}
          title="Payslip not found"
          message="It isn’t in your list of payslips."
          action={<Button title="All payslips" variant="accent" size="md" onPress={() => router.replace('/pay/payslips')} />}
        />
      </Screen>
    );
  }

  const net = amountOf(slip.net);
  const gross = amountOf(slip.gross);
  const deductions = amountOf(slip.deductions);
  // net = gross − deductions + approved claims paid with this salary (hr_payroll_calc.js computeItem).
  const reimbursed = Math.round((net - (gross - deductions)) * 100) / 100;
  const signed = (sign: '−' | '+', n: number) => (money.hidden ? money.inr(n) : `${sign} ${money.inr(n)}`);
  // Gross pay as one bar: what reaches you (pay colour) and what comes off (red). Shares only.
  const kept = Math.max(0, gross - deductions);
  const split = [
    { key: 'kept', label: 'You keep', value: kept, color: moduleTone.pay.fg },
    { key: 'off', label: 'Deductions', value: Math.max(0, deductions), color: palette.danger },
  ];
  const pctOf = (n: number) => `${Math.round((n / gross) * 100)}%`;

  return (
    <Screen
      header={header}
      onRefresh={() => q.refetch()}
      footer={
        <ActionBar note={error ? null : 'Opens your phone’s share menu. Full breakdown is in the PDF.'}>
          {error ? (
            <Text variant="caption" color={palette.dangerInk} align="center" numberOfLines={2} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button title="Save or share PDF" icon={<Share2 />} loading={busy} onPress={download} />
        </ActionBar>
      }>
      <SummaryHero icon={FileText} module="pay" label="Take-home pay" {...heroAmount(slip.net, money.hidden)}>
        {gross > 0 && deductions > 0 ? (
          <View style={styles.split}>
            <SplitBar segments={split} />
            <ChartLegend items={split.map((x) => ({ key: x.key, label: x.label, color: x.color, value: pctOf(x.value) }))} />
          </View>
        ) : null}
      </SummaryHero>

      <SummaryCard
        title="How it adds up"
        rows={[
          { key: 'gross', label: 'Gross pay', value: money.inr(slip.gross) },
          { key: 'deductions', label: 'Deductions', value: signed('−', deductions), valueColor: palette.dangerInk },
          ...(reimbursed > 0 ? [{ key: 'reimbursed', label: 'Salary claims paid', value: signed('+', reimbursed), valueColor: palette.successInk }] : []),
        ]}
        total={{ label: 'Take-home pay', value: money.inr(slip.net) }}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  split: { gap: space.sm, paddingTop: space.xs },
}));
