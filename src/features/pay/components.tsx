// Building blocks for the pay screens (docs/REFERENCE-COMPONENTS.md §3 "Me → Pay", DESIGN.md §11 "Pay"):
//   heroAmount     the figure props for a kit SummaryHero: the amount (₹ small, greyed paise) or the
//                  privacy mask, so every light pay hero hides with the eye
//   PayHeader      NavHeader with the eye as a round action (each pay detail screen)
//   PayslipRow     a payslip as a Payno "transaction" (ActivityRow)
//   ErrorText      a failed request as a danger Banner
//   PayUnavailable / PaySkeleton   the off and loading states
// Everything sits on the kit, so the pay screens look and move like the rest of the app and stay
// inside 320 dp at large text.

import { FileText, Wallet } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Text as RNText, View } from 'react-native';

import type { PayslipSummary } from '@/api/pay';
import { amountOrNull, monthName } from '@/features/pay/format';
import { usePayMoney, usePrivacyAction } from '@/features/pay/privacy';
import { themedStyles } from '@/theme/themed';
import { font, moduleTone, palette, radius, space, type as typeScale } from '@/theme/tokens';
import { FIELD_LABEL_INSET, ActivityRow, Banner, EmptyState, MAX_FONT_SCALE, NavHeader, Skeleton, SkeletonList, Text, useLayout } from '@/ui';

// ── Hero figure ──────────────────────────────────────────────────────────────
/** The privacy mask in a light hero's figure line: a small muted ₹ and spaced faint dots. */
function MaskedFigure() {
  const { fontScale } = useLayout();
  return (
    <View style={[styles.maskLine, { height: maskHeight(fontScale) }]}>
      <Text variant="numeral" color={palette.textFaint} numberOfLines={1} accessibilityLabel="Amount hidden" style={styles.shrink}>
        <RNText style={styles.maskCurrency}>{'₹ '}</RNText>
        <RNText style={styles.maskDots}>••••••</RNText>
      </Text>
    </View>
  );
}

/** The figure line's height at this text size (the numeral grows to 110 % at most), so the mask matches it. */
export function maskHeight(fontScale: number) {
  return Math.round(typeScale.numeral.lineHeight * Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE.numeral));
}

function NoFigure() {
  return (
    <Text variant="numeral" color={palette.textFaint} numberOfLines={1} accessibilityLabel="No amount">
      —
    </Text>
  );
}

/**
 * Props for a kit SummaryHero showing a pay amount: `value` + `currency` (the kit's light figure with
 * a small ₹ and greyed paise) while amounts are shown, the mask while they are hidden, "—" when the
 * amount is missing.
 *   <SummaryHero label="Take-home pay" icon={FileText} module="pay" {...heroAmount(slip.net, money.hidden)} />
 */
export function heroAmount(v: unknown, hidden: boolean): { value?: number; currency?: string; decimals?: number; figure?: ReactNode } {
  if (hidden) return { figure: <MaskedFigure /> };
  const n = amountOrNull(v);
  if (n == null) return { figure: <NoFigure /> };
  return { value: n, currency: '₹', decimals: 2 };
}

// ── Header ───────────────────────────────────────────────────────────────────
/**
 * The pay detail screens' header: the kit NavHeader (round back, centred title) with the eye that
 * hides every amount as its one round action — only for people who have that part of pay.
 */
export function PayHeader({ title, subtitle, privacy = true, onBack }: { title: string; subtitle?: string; privacy?: boolean; onBack?: () => void }) {
  const eye = usePrivacyAction();
  return <NavHeader title={title} subtitle={subtitle} onBack={onBack} actions={privacy ? [eye] : undefined} />;
}

// ── Rows ─────────────────────────────────────────────────────────────────────
/**
 * Payslip row (docs/DESIGN.md §11 Pay), a Payno "transaction": the pay badge, the month, and the
 * take-home figure right-aligned over a muted "Take-home", with a chevron. The month shortens on
 * compact screens so it never truncates. Every payslip an employee can see comes from a LOCKED
 * payroll, so there is no status to show.
 */
export function PayslipRow({ slip, onPress }: { slip: PayslipSummary; onPress: () => void }) {
  const money = usePayMoney();
  const { compact } = useLayout();
  // Whole rupees in the list so six-figure salaries fit the right column at large text; the detail
  // screen shows the exact figure.
  const net = money.inr(slip.net, { decimals: false });
  return (
    <ActivityRow
      module="pay"
      icon={FileText}
      title={monthName(slip.month, compact ? 'short' : 'long')}
      titleLines={1}
      value={net}
      meta="Take-home"
      chevron
      onPress={onPress}
      accessibilityLabel={`${monthName(slip.month)}, take-home ${money.hidden ? 'hidden' : net}`}
    />
  );
}

// ── Notes and states ─────────────────────────────────────────────────────────
/** A failed request, as a danger Banner (renders nothing without text). */
export function ErrorText({ text, title }: { text?: string | null; title?: string }) {
  if (!text) return null;
  return <Banner tone="danger" title={title} message={text} />;
}

/**
 * `feature` names what is off as a plural noun, lower case: "payslips", "salary advances", "salary
 * details"… The title reads like the app's other off states ("Leave isn’t on for you").
 */
export function PayUnavailable({ systemRole, feature }: { systemRole: boolean; feature?: string }) {
  const title = feature ? `${feature.charAt(0).toUpperCase()}${feature.slice(1)} aren’t on for you` : 'Pay isn’t on for you';
  return (
    <EmptyState
      icon={<Wallet color={moduleTone.pay.fg} strokeWidth={1.8} />}
      title={systemRole ? 'Not available for this account' : title}
      message={systemRole ? 'Pay is for employees. Payroll is run under More › Payroll.' : `Ask HR to switch ${feature ? 'them' : 'it'} on.`}
    />
  );
}

/** Loading placeholder shaped like the pay screens: the hero, a summary card and a list of `rows` rows — each part optional. */
export function PaySkeleton({ hero = true, card = false, rows = 3 }: { hero?: boolean; card?: boolean; rows?: number }) {
  const { gap } = useLayout();
  return (
    <View style={{ gap }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {hero ? <Skeleton height={176} radius={radius.xxl} /> : null}
      {card ? <Skeleton height={220} radius={radius.xl} /> : null}
      {rows > 0 ? <SkeletonList rows={rows} avatar tone="surface" /> : null}
    </View>
  );
}

/** A labelled block of free text (a reason, HR's note) in a details sheet. */
export function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.textBlock}>
      <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
        {label}
      </Text>
      <Text variant="body" selectable>
        {text}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  shrink: { flexShrink: 1 },
  // The mask keeps the figure's line height: a small muted ₹ (Light, ≥ 24 px) and smaller spaced dots.
  maskCurrency: { fontFamily: font.light, fontSize: 29, color: palette.textMuted, letterSpacing: 0 },
  maskDots: { fontSize: 30, letterSpacing: 3 },
  // The mask takes exactly the figure's line, so the hero doesn't jump when the eye is pressed.
  maskLine: { justifyContent: 'center', overflow: 'hidden' },
  textBlock: { gap: space.xxs },
}));
