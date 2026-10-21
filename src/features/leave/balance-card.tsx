// Me › Leave balance, in the Payno / Lendora kit (docs/REFERENCE-COMPONENTS.md §3 "Me → Leave"):
//
//   BalanceHero   the light SummaryHero "Leave balance": the days left over every paid type as a giant
//                 Numeral, a frosted ⓘ chip with what is waiting for approval (opens the waiting
//                 requests), the leave year as a muted line, a StripedProgress of the days used out of
//                 the days this year has given, and the one primary pill (Apply leave, or the first kind
//                 this person can request). When HR has set up no leave type, the line says so.
//   BalanceRows   "By leave type": one Lendora MetricRow per type — a dot in the type's colour, the
//                 name, what is left as a light fraction of this year's days ("6/12 days"), what was
//                 used and is waiting under the name, and one soft pill only when something needs
//                 saying (Over by 1 day, Unpaid, Use by …). Tapping a row opens how its balance adds
//                 up, as the web shows it: per year (and "Adds up monthly"), entitled so far, HR
//                 adjustments, used, waiting and left (for comp-off: earned and use-by).
//
// Unpaid (loss-of-pay) types have no balance, so their row shows "—" with an "Unpaid" pill and what
// was used, as the web does (dash.html LeaveBalances: '—' plus used / pending).
// Fit: the Numeral shrinks to fit (never below 36 px); MetricRow wraps its pill under the fraction and
// its name to 2 lines, so nothing is cut at 320 dp or with large text.

import { TreePalm } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { LeaveBalanceRow } from '@/api/leave';
import { useTodayIst } from '@/features/attendance/use-now';
import { countsBalance, dayCount, decimalsOf, fmtNum, isYmd, shortDate } from '@/features/leave/rules';
import { type ModuleKey, moduleTone, palette, radius, space, type StatusTone } from '@/theme/tokens';
import {
  Button,
  Card,
  MetricRow,
  Numeral,
  SectionHeader,
  Sheet,
  Skeleton,
  StripedProgress,
  SummaryCard,
  SummaryHero,
  type SummaryItem,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

// The row dots, in order (one leave type each, wrapping round). Read at render, so they follow the theme.
const DOT_TONES: ModuleKey[] = ['leave', 'attendance', 'holidays', 'pay', 'support', 'tasks', 'people', 'visitors'];
const dotOf = (i: number) => moduleTone[DOT_TONES[i % DOT_TONES.length]!].fg;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const nameOf = (b: LeaveBalanceRow) => b.name || b.code || 'Leave';
const daysWord = (n: number) => (Number(n) === 1 ? 'day' : 'days');
/** What this year has given a type: entitled so far + HR adjustments (earned, for comp-off). */
const potOf = (b: LeaveBalanceRow) => (b.is_comp_off ? num(b.adjusted) : num(b.entitlement) + num(b.adjusted));

/** The hero's figures, over every type that counts a balance (paid and comp-off). */
export function balanceTotals(balances: LeaveBalanceRow[]) {
  const list = (Array.isArray(balances) ? balances : []).filter(Boolean);
  const counting = list.filter(countsBalance);
  const sum = (rows: LeaveBalanceRow[], pick: (b: LeaveBalanceRow) => number) => round2(rows.reduce((s, b) => s + pick(b), 0));
  return {
    counting: counting.length,
    left: sum(counting, (b) => num(b.available)),
    pot: sum(counting, potOf),
    used: sum(counting, (b) => num(b.used)),
    // Waiting days count against every type, unpaid ones too.
    waiting: sum(list, (b) => num(b.pending)),
  };
}

export type BalanceHeroAction = { title: string; onPress: () => void; disabled?: boolean };

/**
 * The Leave balance hero. `balances` are the types shown in Me › Leave; `noTypes` says HR has set up
 * none this person could pick (the pill then names the next kind, or stays disabled).
 */
export function BalanceHero({
  balances,
  period,
  noTypes,
  action,
  onWaiting,
}: {
  balances: LeaveBalanceRow[];
  period?: string | null;
  noTypes?: boolean;
  action: BalanceHeroAction;
  /** Opens the waiting requests (the ⓘ chip). */
  onWaiting?: () => void;
}) {
  const t = balanceTotals(balances);
  const hasFigure = t.counting > 0;
  // Without a figure the hero still says why: no types at all, or only unpaid ones (whose rows only
  // show once days were taken from them, so `balances` may be empty here).
  const sub = noTypes ? 'No leave types yet. Ask HR to set them up.' : !hasFigure ? 'Only unpaid leave is set up for you' : period ? `Leave year ${period}` : undefined;

  return (
    <SummaryHero
      icon={TreePalm}
      module="leave"
      label="Leave balance"
      figure={
        hasFigure ? (
          <Numeral
            value={t.left}
            decimals={decimalsOf(t.left)}
            unit={daysWord(t.left)}
            color={t.left < 0 ? palette.dangerInk : undefined}
            accessibilityLabel={`${fmtNum(t.left)} ${daysWord(t.left)} of leave left`}
          />
        ) : undefined
      }
      info={
        t.waiting > 0
          ? {
              label: 'Waiting for approval',
              value: dayCount(t.waiting),
              onPress: onWaiting,
              accessibilityLabel: `${dayCount(t.waiting)} waiting for approval${onWaiting ? '. Shows the waiting requests' : ''}`,
            }
          : undefined
      }
      sub={sub}>
      <View style={styles.heroFoot}>
        {hasFigure && t.pot > 0 ? (
          <StripedProgress
            label="Used so far"
            used={t.used}
            total={t.pot}
            valueText={`${fmtNum(t.used)} / ${dayCount(t.pot)}`}
            accessibilityLabel={`Used so far: ${fmtNum(t.used)} of ${dayCount(t.pot)}`}
          />
        ) : null}
        <Button variant="primary" title={action.title} disabled={action.disabled} onPress={action.onPress} />
      </View>
    </SummaryHero>
  );
}

/** Placeholder with the hero's real shape (label row, figure, bar, pill). */
export function BalanceHeroSkeleton() {
  return (
    <Card tone="frostStrong" style={styles.heroSkeleton} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View style={styles.skelTop}>
        <Skeleton width={38} height={38} radius={19} />
        <Skeleton width={110} height={14} radius={6} />
      </View>
      <Skeleton width={150} height={46} radius={10} style={styles.skelFigure} />
      <Skeleton width="55%" height={12} radius={6} />
      <Skeleton width="100%" height={20} radius={10} style={styles.skelBar} />
      <Skeleton width="100%" height={52} radius={radius.pill} />
    </Card>
  );
}

// ── By leave type ──────────────────────────────────────────────────────────

type RowStatus = { label: string; tone: StatusTone } | null;

/** The one soft pill a row may carry: a problem first, then what makes the type different. */
function statusOf(b: LeaveBalanceRow, today: string): RowStatus {
  if (!countsBalance(b)) return { label: 'Unpaid', tone: 'neutral' };
  const left = num(b.available);
  if (left < 0) return { label: `Over by ${dayCount(-left)}`, tone: 'failed' };
  if (b.is_comp_off && isYmd(b.expiring)) return { label: `Use by ${shortDate(b.expiring, today)}`, tone: 'pending' };
  return null;
}

/** "2 used · 1 waiting" under the name. */
function factsOf(b: LeaveBalanceRow) {
  const out = [`${fmtNum(num(b.used))} used`];
  const waiting = num(b.pending);
  if (waiting) out.push(`${fmtNum(waiting)} waiting`);
  return out.join(' · ');
}

// The figures behind one balance, in the order they add up.
function detailOf(b: LeaveBalanceRow, today: string): { rows: SummaryItem[]; total: { label: string; value: string; hint?: string | null } | null } {
  const used: SummaryItem = { label: 'Used', value: dayCount(num(b.used)) };
  const waiting: SummaryItem = { label: 'Waiting for approval', value: dayCount(num(b.pending)) };
  if (!countsBalance(b)) return { rows: [{ label: 'Pay', value: 'Unpaid (loss of pay)' }, used, waiting], total: null };
  const left = num(b.available);
  const total = { label: 'Left', value: dayCount(left), hint: left < 0 ? 'More than your balance' : null };
  if (b.is_comp_off) {
    const rows: SummaryItem[] = [{ label: 'Earned', value: dayCount(num(b.adjusted)) }, used, waiting];
    if (isYmd(b.expiring)) rows.push({ label: 'Use by', value: shortDate(b.expiring, today) });
    return { rows, total };
  }
  const monthly = b.accrual === 'monthly';
  const adjusted = num(b.adjusted);
  const rows: SummaryItem[] = [
    { label: 'Per year', value: dayCount(num(b.annual_quota)), hint: monthly ? 'Adds up monthly' : null },
    { label: monthly ? 'Entitled so far' : 'Entitled', value: dayCount(num(b.entitlement)) },
  ];
  if (adjusted) rows.push({ label: 'Adjusted by HR', value: `${adjusted > 0 ? '+' : ''}${dayCount(adjusted)}` });
  rows.push(used, waiting);
  return { rows, total };
}

function BalanceRow({ b, index, today, onPress }: { b: LeaveBalanceRow; index: number; today: string; onPress: () => void }) {
  const counts = countsBalance(b);
  const left = num(b.available);
  const pot = potOf(b);
  const name = nameOf(b);
  const facts = factsOf(b);
  const status = statusOf(b, today);
  const spoken = [
    name,
    counts ? (pot > 0 ? `${fmtNum(left)} of ${dayCount(pot)} left` : `${dayCount(left)} left`) : 'unpaid',
    facts,
    status && status.label !== 'Unpaid' ? status.label : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <MetricRow
      label={name}
      sub={facts}
      dotColor={dotOf(index)}
      value={counts ? fmtNum(left) : '—'}
      total={counts && pot > 0 ? fmtNum(pot) : null}
      unit={counts ? daysWord(pot > 0 ? pot : left) : undefined}
      status={status}
      onPress={onPress}
      accessibilityLabel={spoken}
      hint="Shows how this balance adds up"
    />
  );
}

/** "By leave type": one MetricRow per type, and the sheet with how a balance adds up. */
export function BalanceRows({ balances, period }: { balances: LeaveBalanceRow[]; period?: string | null }) {
  const today = useTodayIst();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const list = (Array.isArray(balances) ? balances : []).filter(Boolean);
  const open = list.find((b) => b.id === openId) ?? null;
  const detail = open ? detailOf(open, today) : null;
  if (!list.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="By leave type" />
      <View style={styles.rows}>
        {list.map((b, i) => (
          <BalanceRow
            key={b.id}
            b={b}
            index={i}
            today={today}
            onPress={() => {
              setOpenId(b.id);
              setSheetOpen(true);
            }}
          />
        ))}
      </View>

      {open && detail ? (
        <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={nameOf(open)} subtitle={period ? `Leave year ${period}` : undefined}>
          <SummaryCard rows={detail.rows} total={detail.total} />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  heroFoot: { gap: space.md },
  heroSkeleton: { borderRadius: radius.xxl, gap: space.sm },
  skelTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  skelFigure: { marginTop: space.sm },
  skelBar: { marginTop: space.xs },
  section: { gap: space.xxs },
  rows: { gap: space.xs },
}));
