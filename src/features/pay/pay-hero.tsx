// The emerald hero at the top of Me › Pay (docs/REFERENCE-COMPONENTS.md §3 "Me → Pay"): the Payno
// balance card laid out on the Pay module's gradient — the screen's one dark element.
//   top row   a frosted icon circle + "Take-home pay" (small, muted) on the left; on the right a round
//             white corner arrow (↗) that opens the payslip
//   figure    the take-home of the latest payslip as a giant light Numeral (small ₹, greyed paise, a
//             tiny arrow for the change against the payslip before) across the card's full width
//   chip      a frosted ⓘ pill: the payslip's month • the change ("+2.4% vs Aug")
// Before the first payslip it shows the monthly gross from the salary structure, said plainly (never
// a made-up take-home), with "Your first payslip isn’t out yet" only when the person gets payslips in
// the app and has none yet. With neither, a short "nothing yet" card.
// The eye that hides every amount is the one in the Me header while Pay is open (docs/DESIGN.md §0A,
// the same place as on every pay detail screen), so the hero doesn't repeat it. While amounts are
// hidden the figure is a mask of the same height and the change is left out, since it hints at the
// amount.

import { ArrowUpRight, Info, type LucideIcon, Wallet } from 'lucide-react-native';
import { Text as RNText, View } from 'react-native';

import type { MySalary, PayslipSummary } from '@/api/pay';
import { amountOrNull, monthName, monthOnly } from '@/features/pay/format';
import { maskHeight } from '@/features/pay/components';
import { usePayMoney } from '@/features/pay/privacy';
import { themedStyles } from '@/theme/themed';
import { font, moduleTone, palette, radius, space } from '@/theme/tokens';
import { Card, hitSlopFor, Numeral, type NumeralDelta, PressableScale, Text, useLayout } from '@/ui';

const ICON = 40;
const ROUND = 40;

/** The change from the payslip before: a tiny arrow for the figure and words for the chip. */
function changeOf(net: number, previous: PayslipSummary | undefined): (NumeralDelta & { label: string }) | null {
  const before = amountOrNull(previous?.net);
  if (before == null || before <= 0) return null;
  const pct = ((net - before) / before) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return null;
  const vs = monthOnly(previous?.month);
  return {
    direction: pct > 0 ? 'up' : 'down',
    good: pct > 0,
    label: `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%${vs && vs !== '—' ? ` vs ${vs}` : ''}`,
  };
}

/** The frosted ⓘ chip on the gradient: muted label • emphasised value. */
function HeroChip({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.chip} accessible accessibilityLabel={[label, value].filter(Boolean).join(', ')}>
      <Info size={14} color={palette.onPrimaryMuted} strokeWidth={2} />
      <Text variant="caption" color={palette.onPrimaryMuted} numberOfLines={2} style={styles.shrink}>
        {label}
        {value ? (
          <Text variant="caption" color={palette.onPrimary} style={styles.chipValue}>
            {`  •  ${value}`}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function HeroFrame({
  label,
  icon: Icon = Wallet,
  onArrow,
  arrowLabel,
  figure,
  chip,
}: {
  label: string;
  icon?: LucideIcon;
  onArrow?: () => void;
  arrowLabel?: string;
  figure: { value: number; delta?: NumeralDelta | null; spoken: string };
  chip?: { label: string; value?: string | null } | null;
}) {
  const { hidden } = usePayMoney();
  const { fontScale } = useLayout();
  return (
    <Card tone="primary" gradient={moduleTone.pay.gradient} style={styles.card}>
      <View style={styles.top}>
        <View style={styles.iconCircle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon size={19} color={palette.onPrimary} strokeWidth={1.7} />
        </View>
        <Text variant="label" color={palette.onPrimaryMuted} numberOfLines={2} style={styles.flex}>
          {label}
        </Text>
        {onArrow ? (
          <PressableScale
            onPress={onArrow}
            scaleTo={0.92}
            hitSlop={hitSlopFor(ROUND)}
            accessibilityRole="button"
            accessibilityLabel={arrowLabel ?? `Open ${label}`}
            style={[styles.round, styles.arrow]}>
            <ArrowUpRight size={19} color={moduleTone.pay.gradient[1]} strokeWidth={1.9} />
          </PressableScale>
        ) : null}
      </View>

      {/* The figure gets the card's full width, so a six-figure take-home with paise fits a 320 dp phone. */}
      <View style={styles.figure}>
        {hidden ? (
          <View style={[styles.maskLine, { height: maskHeight(fontScale) }]}>
            <Text variant="numeral" color={palette.onPrimaryFaint} numberOfLines={1} accessibilityLabel="Amount hidden" style={styles.shrink}>
              <RNText style={styles.maskCurrency}>{'₹ '}</RNText>
              <RNText style={styles.maskDots}>••••••</RNText>
            </Text>
          </View>
        ) : (
          <Numeral value={figure.value} prefix="₹" decimals={2} onDark delta={figure.delta} accessibilityLabel={figure.spoken} />
        )}
      </View>

      {chip ? <HeroChip label={chip.label} value={chip.value} /> : null}
    </Card>
  );
}

export function PayHero({
  salary,
  latest,
  previous,
  onOpenPayslip,
  onOpenSalary,
  noPayslipsYet,
}: {
  salary: MySalary | null | undefined;
  latest: PayslipSummary | undefined;
  /** The payslip before the latest, for the change. */
  previous?: PayslipSummary;
  onOpenPayslip?: () => void;
  /** The arrow before the first payslip (Salary details), when the person has that page. */
  onOpenSalary?: () => void;
  noPayslipsYet?: boolean;
}) {
  const { hidden } = usePayMoney();
  const { compact } = useLayout();
  const net = amountOrNull(latest?.net);
  const gross = salary ? amountOrNull(salary.monthly_gross) : null;

  if (latest && net != null) {
    const change = hidden ? null : changeOf(net, previous);
    const month = monthName(latest.month);
    return (
      <HeroFrame
        label="Take-home pay"
        onArrow={onOpenPayslip}
        arrowLabel={`Open the ${month} payslip`}
        figure={{ value: net, delta: change, spoken: `Take-home pay ₹${net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${change ? `, ${change.label}` : ''}` }}
        chip={{ label: `${compact ? monthName(latest.month, 'short') : month} payslip`, value: change?.label }}
      />
    );
  }

  if (gross != null) {
    return (
      <HeroFrame
        label="Monthly pay before deductions"
        onArrow={onOpenSalary}
        arrowLabel="Open salary details"
        figure={{ value: gross, spoken: `Monthly pay before deductions ₹${gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }}
        chip={noPayslipsYet ? { label: 'Your first payslip isn’t out yet' } : null}
      />
    );
  }

  return (
    <Card tone="primary" gradient={moduleTone.pay.gradient} style={styles.emptyCard}>
      <View style={styles.iconCircle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Wallet size={19} color={palette.onPrimary} strokeWidth={1.7} />
      </View>
      <Text variant="heading" color={palette.onPrimary}>
        No pay details yet
      </Text>
      <Text variant="label" color={palette.onPrimaryMuted}>
        They show here once HR sets up your salary.
      </Text>
    </Card>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.sm },
  emptyCard: { gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: ROUND },
  // Translucent whites on the emerald gradient read the same in light and dark (the gradient doesn't change).
  iconCircle: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.frostOnDark,
    borderWidth: 1,
    borderColor: palette.frostEdgeOnDark,
    flexShrink: 0,
  },
  round: { width: ROUND, height: ROUND, borderRadius: ROUND / 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Payno's corner arrow: a solid white disc with the gradient's deep emerald arrow.
  arrow: { backgroundColor: palette.onPrimary },
  figure: { marginTop: space.xs, minWidth: 0 },
  maskCurrency: { fontFamily: font.light, fontSize: 29, color: palette.onPrimaryMuted, letterSpacing: 0 },
  maskDots: { fontSize: 30, letterSpacing: 3 },
  // The mask takes exactly the figure's line, so the hero doesn't jump when the eye is pressed.
  maskLine: { justifyContent: 'center', overflow: 'hidden' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.frostOnDark,
    borderWidth: 1,
    borderColor: palette.frostEdgeOnDark,
  },
  chipValue: { fontFamily: font.semibold },
}));
