// All my payslips, grouped by financial year (April–March), newest first — the website's
// MyPayslips table (dash.html ~L5056) as a list. Only payslips from LOCKED payroll runs exist here.
// NavHeader (with the eye), then a light SummaryHero with the newest financial year's take-home so far
// and how many payslips it holds, then one Payno transactions list per financial year (month +
// take-home). The tax summary lives in Me › Pay, so it is not repeated here.

import { useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';

import { useMyPayslips } from '@/api/pay';
import { heroAmount, PayHeader, PaySkeleton, PayslipRow, PayUnavailable } from '@/features/pay/components';
import { fyLabel, fyShort, groupByFy, monthRange, rowsOf } from '@/features/pay/format';
import { usePayMoney } from '@/features/pay/privacy';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { plural } from '@/lib/format';
import { moduleTone } from '@/theme/tokens';
import { ActivityList, EmptyState, ErrorState, Screen, SummaryHero } from '@/ui';

export default function PayslipsScreen() {
  const router = useRouter();
  const pa = usePayAccess();
  const money = usePayMoney();
  const q = useMyPayslips(pa.payslips);

  const header = <PayHeader title="Payslips" privacy={pa.payslips} />;

  if (pa.loading) {
    return (
      <Screen header={header}>
        <PaySkeleton rows={6} />
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

  const slips = rowsOf(q.data);
  // Stale payslips stay hidden behind the loading / error state.
  const groups = !q.isLoading && !q.isError ? groupByFy(slips) : [];
  const newest = groups[0];
  const open = (id: string) => router.push(`/pay/payslip/${id}`);
  // The newest year's months, oldest → newest ("Apr – Sep 2026"); the API sorts newest first.
  const first = newest?.items[newest.items.length - 1]?.month;
  const last = newest?.items[0]?.month;
  const range = monthRange(first, last);

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {q.isLoading ? (
        <PaySkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
      ) : !slips.length || !newest ? (
        <EmptyState
          icon={<FileText color={moduleTone.pay.fg} strokeWidth={1.8} />}
          title="No payslips yet"
          message="Your payslips show here after HR runs payroll."
        />
      ) : (
        <SummaryHero
          icon={FileText}
          module="pay"
          label={`Take-home in financial year ${fyShort(newest.fy)}`}
          {...heroAmount(newest.net, money.hidden)}
          info={{ label: plural(newest.items.length, 'payslip'), value: range || undefined }}
        />
      )}

      {groups.map((g) => (
        <ActivityList key={g.fy} title={fyLabel(g.fy)}>
          {g.items.map((s) => (
            <PayslipRow key={s.id} slip={s} onPress={() => open(s.id)} />
          ))}
        </ActivityList>
      ))}
    </Screen>
  );
}
