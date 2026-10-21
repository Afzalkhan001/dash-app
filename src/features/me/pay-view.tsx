// Me › Pay (docs/REFERENCE-COMPONENTS.md §3 "Me → Pay"). State, then actions, then history:
//   1. the emerald hero: the latest payslip's take-home as a giant light Numeral (greyed paise), the
//      corner arrow to the payslip and an ⓘ chip with its month and the change against the month
//      before (or the monthly gross before the first payslip),
//   2. CategoryGrid, one row of frosted circles: Payslips · Salary details · Tax summary · Salary
//      advance (each only with its module; the one-line state the old link rows showed is read out
//      with the name),
//   3. Coming up (UpcomingCards, only from data already loaded): the next payslip's month, the salary
//      advance coming off each salary (or a request waiting for HR), and approved salary claims that
//      are paid with the next salary,
//   4. up to 3 earlier payslips as a Payno transactions list with "See all" when there are more (the
//      latest one is already in the hero),
//   5. take-home over the last payslips as a glow line — only from the payslips already loaded, with 3
//      or more of them, and never while amounts are hidden,
//   6. Salary claims, only for people who have old claims.
// With fewer than 2 grid tiles (salary details alone, or salary advances alone) the old link list is
// shown instead, with its one-line state under each name.
// Gating matches the website (usePayAccess): salary ← 'salary', payslips and the tax summary ←
// 'payslips', salary advances and claims ← 'reimbursements'.
// The eye that hides every amount is in the Me header while this segment is open (docs/DESIGN.md §0A).
// Renders inside the Me screen (no Screen or header of its own).

import { useRouter } from 'expo-router';
import { BadgeIndianRupee, CalendarClock, FileText, HandCoins, Landmark, type LucideIcon, Receipt } from 'lucide-react-native';
import { View } from 'react-native';

import { useMyClaims, useMyLoans, useMyPayslips, useMySalary } from '@/api/pay';
import { useTodayIst } from '@/features/attendance/use-now';
import { PayslipRow } from '@/features/pay/components';
import { amountOf, amountOrNull, fyLabel, fyOf, monthName, monthOnly, nextMonths, prevMonth, rowsOf } from '@/features/pay/format';
import { PayHero } from '@/features/pay/pay-hero';
import { usePayMoney } from '@/features/pay/privacy';
import { usePayAccess } from '@/features/pay/use-pay-access';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { moduleTone, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Card,
  CardHeader,
  type CategoryItem,
  CategoryGrid,
  ErrorState,
  GlowLineChart,
  SectionHeader,
  Skeleton,
  type UpcomingItem,
  UpcomingCards,
  useLayout,
} from '@/ui';

const PREVIEW_ROWS = 3;
const CHART_POINTS = 6; // the chart's last N payslips
const CHART_MIN = 3; // fewer points than this say nothing

type Link = { key: string; icon: LucideIcon; title: string; subtitle: string; href: string };

export function PayView() {
  const router = useRouter();
  const { gap } = useLayout();
  const pa = usePayAccess();
  const money = usePayMoney();
  const today = useTodayIst();
  const thisMonth = today.slice(0, 7);
  const salaryQ = useMySalary(pa.salary);
  const slipsQ = useMyPayslips(pa.payslips);
  const loansQ = useMyLoans(pa.advances);
  const claimsQ = useMyClaims(pa.advances);

  const salary = salaryQ.data;
  const slips = rowsOf(slipsQ.data);
  const latest = slips[0];
  const loans = rowsOf(loansQ.data);
  const claims = rowsOf(claimsQ.data);
  const pendingLoan = loans.find((l) => l.status === 'pending');
  const activeLoans = loans.filter((l) => l.status === 'approved' && amountOf(l.outstanding) > 0);
  const outstanding = activeLoans.reduce((t, l) => t + amountOf(l.outstanding), 0);
  const perMonth = activeLoans.reduce((t, l) => t + Math.min(amountOf(l.emi), amountOf(l.outstanding)), 0);
  const pendingClaims = claims.filter((c) => c.status === 'pending').length;
  const toBePaid = claims.filter((c) => c.status === 'approved' && !c.paid_at);
  const toBePaidSum = toBePaid.reduce((t, c) => t + amountOf(c.amount), 0);
  const openSlip = (id: string) => router.push(`/pay/payslip/${id}`);
  // The hero shows the latest payslip (with its arrow) only when its take-home is usable; then the
  // list under it starts from the one before, so the same slip isn't offered twice.
  const heroHasLatest = !!latest && amountOrNull(latest.net) != null;
  const previewFrom = heroHasLatest ? 1 : 0;
  const preview = slips.slice(previewFrom, previewFrom + PREVIEW_ROWS);
  // "See all" only when some payslips are not on this screen already (as in Me › Leave).
  const moreSlips = slips.length > previewFrom + preview.length;

  // Salary advances alone (no salary/payslips module) get no hero: there is no pay to show.
  const showHero = pa.salary || pa.payslips;
  const heroLoading = (pa.salary && salaryQ.isLoading) || (pa.payslips && slipsQ.isLoading);
  const heroError = (pa.salary && salaryQ.isError ? salaryQ.error : null) ?? (pa.payslips && slipsQ.isError ? slipsQ.error : null);
  const nothingLoaded = !salary && !latest;
  const retryHero = () => {
    if (pa.salary) void salaryQ.refetch();
    if (pa.payslips) void slipsQ.refetch();
  };

  // Take-home over the last payslips, oldest first. Payslips with a bad amount are left out.
  const points = slips
    .filter((s) => amountOrNull(s.net) != null)
    .slice(0, CHART_POINTS)
    .reverse();
  const showChart = pa.payslips && !slipsQ.isLoading && !slipsQ.isError && !money.hidden && points.length >= CHART_MIN;
  const chartValues = points.map((s) => amountOf(s.net));
  const chartAvg = chartValues.length ? chartValues.reduce((t, v) => t + v, 0) / chartValues.length : 0;

  // ── The links (grid tiles, or the fallback list) ──
  const links: Link[] = [];
  if (pa.payslips) {
    links.push({
      key: 'slips',
      icon: FileText,
      title: 'Payslips',
      subtitle: slipsQ.isLoading ? 'Loading…' : slipsQ.isError ? 'Couldn’t load' : slips.length ? plural(slips.length, 'payslip') : 'None yet',
      href: '/pay/payslips',
    });
  }
  if (pa.salary) {
    links.push({
      key: 'salary',
      icon: BadgeIndianRupee,
      title: 'Salary details',
      subtitle: salaryQ.isLoading
        ? 'Loading…'
        : salaryQ.isError
          ? 'Couldn’t load'
          : salary
            ? `Annual salary (CTC) ${money.inr(salary.annual_ctc, { decimals: false })}`
            : 'Not set up yet',
      href: '/pay/salary',
    });
  }
  if (pa.payslips) {
    const fy = fyOf(thisMonth);
    links.push({
      key: 'fy',
      icon: Landmark,
      title: 'Tax summary',
      subtitle: Number.isFinite(fy) ? fyLabel(fy) : 'This financial year',
      href: '/pay/fy',
    });
  }
  if (pa.advances) {
    links.push({
      key: 'advance',
      icon: HandCoins,
      title: 'Salary advance',
      subtitle: pendingLoan
        ? 'Request waiting for HR'
        : activeLoans.length
          ? `${money.inr(outstanding, { decimals: false })} left to repay`
          : 'Ask HR for a salary advance',
      href: '/pay/loans',
    });
  }
  // What a link says under its name, read out with it; amounts in it hide with the eye.
  const spokenState = (l: Link) => {
    if (!money.hidden) return l.subtitle;
    if (l.key === 'salary' && salary) return 'annual salary (CTC) hidden';
    if (l.key === 'advance' && activeLoans.length && !pendingLoan) return 'amount left to repay hidden';
    return l.subtitle;
  };
  const grid: CategoryItem[] = links.map((l) => ({
    key: l.key,
    label: l.title,
    icon: l.icon,
    module: 'pay',
    onPress: () => router.push(l.href),
    accessibilityLabel: `${l.title}, ${spokenState(l)}`,
  }));
  const gridMode = grid.length >= 2;

  // New claims are filed as Expense claims now, so this row is only for people with old HR claims.
  // Named "Salary claims", as the Inbox and the payslip call them, so it isn't mistaken for Expense
  // claims in More.
  const claimsRow =
    pa.advances && claims.length > 0 ? (
      <ActivityRow
        key="claims"
        module="pay"
        icon={Receipt}
        title="Salary claims"
        subtitle={pendingClaims ? `${pendingClaims} waiting for HR` : 'Older claims, paid with your salary'}
        chevron
        onPress={() => router.push('/pay/claims')}
      />
    ) : null;

  // ── Coming up: only what the loaded data says ──
  const upcoming: UpcomingItem[] = [];
  // The next payslip is the month after the latest one, while that is this month or the one before
  // (an older latest payslip says nothing about when the next one comes).
  const next = latest && /^\d{4}-\d{2}$/.test(latest.month) ? nextMonths(latest.month, 2)[1] : undefined;
  if (pa.payslips && heroHasLatest && next && next >= prevMonth(thisMonth)) {
    upcoming.push({
      key: 'next',
      icon: CalendarClock,
      module: 'pay',
      title: 'Next payslip',
      value: monthName(next, 'short'),
      sub: 'Shows here once HR runs payroll',
      accessibilityLabel: `Next payslip, ${monthName(next)}, shows here once HR runs payroll`,
    });
  }
  if (pa.advances && activeLoans.length) {
    const each = money.inr(perMonth, { decimals: false });
    const left = money.inr(outstanding, { decimals: false });
    upcoming.push({
      key: 'emi',
      icon: HandCoins,
      module: 'pay',
      title: 'Salary advance',
      value: each,
      meta: 'Each month',
      sub: `${left} left to repay`,
      onPress: () => router.push('/pay/loans'),
      accessibilityLabel: money.hidden
        ? 'Salary advance, amounts hidden'
        : `Salary advance, ${each} comes off your salary each month, ${left} left to repay`,
    });
  }
  if (pa.advances && pendingLoan) {
    const asked = money.inr(pendingLoan.principal, { decimals: false });
    upcoming.push({
      key: 'ask',
      icon: HandCoins,
      module: 'pay',
      title: 'Advance request',
      value: asked,
      sub: 'Waiting for HR',
      onPress: () => router.push('/pay/loans'),
      accessibilityLabel: `Salary advance request${money.hidden ? '' : ` for ${asked}`}, waiting for HR`,
    });
  }
  if (pa.advances && toBePaid.length) {
    const sum = money.inr(toBePaidSum, { decimals: false });
    upcoming.push({
      key: 'claims',
      icon: Receipt,
      module: 'pay',
      title: 'Salary claims',
      value: sum,
      meta: plural(toBePaid.length, 'claim'),
      sub: 'Paid with your next salary',
      onPress: () => router.push('/pay/claims'),
      accessibilityLabel: `Salary claims, ${plural(toBePaid.length, 'claim')}${money.hidden ? '' : ` for ${sum}`}, paid with your next salary`,
    });
  }

  return (
    // Generous air between the parts (24, 20 on compact phones).
    <View style={{ gap: gap + space.xs }}>
      {showHero || gridMode ? (
        <View style={{ gap: gap + space.xxs }}>
          {!showHero ? null : heroLoading ? (
            <Skeleton height={196} radius={radius.xxl} />
          ) : heroError && nothingLoaded ? (
            <Card tone="frostStrong">
              <ErrorState message={heroError.message} onRetry={retryHero} />
            </Card>
          ) : (
            <PayHero
              salary={salary}
              latest={latest}
              previous={slips[1]}
              onOpenPayslip={latest ? () => openSlip(latest.id) : undefined}
              onOpenSalary={pa.salary ? () => router.push('/pay/salary') : undefined}
              noPayslipsYet={pa.payslips && !slipsQ.isError && !latest}
            />
          )}

          {heroError && !nothingLoaded ? (
            <Banner tone="danger" message="Some pay details didn’t load." action={{ label: 'Try again', onPress: retryHero }} />
          ) : null}

          {/* Right under the hero, 4 across (2×2 with large text); always above the tab bar's space. */}
          {gridMode ? <CategoryGrid items={grid} /> : null}
        </View>
      ) : null}

      {upcoming.length ? (
        <View style={styles.section}>
          <SectionHeader title="Coming up" />
          <UpcomingCards items={upcoming} accessibilityLabel="Coming up" />
        </View>
      ) : null}

      {/* Earlier payslips: hidden while there is nothing beyond the one in the hero. */}
      {pa.payslips && !slipsQ.isError && (slipsQ.isLoading || preview.length > 0) ? (
        <ActivityList
          title={heroHasLatest ? 'Earlier payslips' : 'Payslips'}
          loading={slipsQ.isLoading}
          loadingRows={PREVIEW_ROWS}
          onSeeAll={moreSlips ? () => router.push('/pay/payslips') : undefined}
          seeAllAccessibilityLabel="See all payslips">
          {preview.map((s) => (
            <PayslipRow key={s.id} slip={s} onPress={() => openSlip(s.id)} />
          ))}
        </ActivityList>
      ) : null}

      {!gridMode && links.length ? (
        <ActivityList>
          {links.map((l) => (
            <ActivityRow
              key={l.key}
              module="pay"
              icon={l.icon}
              title={l.title}
              subtitle={l.subtitle}
              chevron
              onPress={() => router.push(l.href)}
              accessibilityLabel={`${l.title}, ${spokenState(l)}`}
            />
          ))}
        </ActivityList>
      ) : null}

      {showChart ? (
        <Card style={styles.chartCard}>
          <CardHeader overline={`Last ${points.length} payslips`} title="Take-home" />
          <GlowLineChart
            values={chartValues}
            labels={points.map((s) => monthOnly(s.month))}
            color={moduleTone.pay.fg}
            guides={[{ value: chartAvg, label: money.compact(chartAvg) }]}
            points={[{ index: points.length - 1, value: money.compact(chartValues[chartValues.length - 1]), label: monthOnly(points[points.length - 1]?.month) }]}
            formatValue={(v) => money.compact(v)}
            accessibilityLabel={`Take-home over the last ${points.length} payslips: ${points.map((s) => `${monthName(s.month)} ${money.compact(amountOf(s.net))}`).join(', ')}`}
          />
        </Card>
      ) : null}

      {claimsRow ? <ActivityList>{claimsRow}</ActivityList> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xxs },
  chartCard: { gap: space.sm },
}));
