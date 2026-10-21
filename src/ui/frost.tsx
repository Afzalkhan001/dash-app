// Frosted heroes (docs/REFERENCE-COMPONENTS.md item 2). SummaryHero is Payno's LIGHT "Available
// Balance" / "Total Due Payments" / "Monthly Limit" card: a frosted-strong card (radius 28) with
//   top row   a white icon circle + muted label on the left, a round corner arrow button (brand fill,
//             white ↗) on the right
//   figure    a huge light number (type.numeral) with a small muted ₹ and greyed decimals — or any
//             node (a Numeral) — and an optional eye toggle that hides amounts
//   below     an info chip (ⓘ "Casual • 6 left ›", frosted pill, pressable) and/or a muted sub-line
//             ("Next due • Tomorrow"), an optional full-width primary pill ("Apply leave") and a
//             children slot (a striped progress bar)
// DASH: leave balance, petty cash balance, bounty coins, vendor dues, team attendance summary, Pay's
// light take-home. The vermilion gradient Card tone="primary" stays for the Home clock card only.

import { ArrowUpRight, ChevronRight, Eye, EyeOff, Info, type LucideIcon } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Platform, Text as RNText, type StyleProp, View, type ViewStyle } from 'react-native';

import { font, type ModuleKey, moduleTone, palette, radius, space, type as typeScale } from '@/theme/tokens';
import { hitSlopFor } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Amount, Button, Card, Metric, Skeleton } from '@/ui/primitives';
import { Text } from '@/ui/text';
import { TourTarget } from '@/ui/tour/target';

import { themedStyles } from '@/theme/themed';
const IOS = Platform.OS === 'ios';
// Payno's top row is small and quiet: a 38 white icon circle and a 38 corner arrow (both padded to a
// 48 dp touch target), so the giant figure under them carries the card.
const ICON = 38;
const ARROW = 38;
const EYE = 40;
const FIGURE_H = typeScale.numeral.lineHeight; // 54: the hero figure's line

export type SummaryHeroInfo = {
  /** Muted part of the chip ("Casual leave"). */
  label: string;
  /** Emphasised part after a dot ("6 left"). */
  value?: string;
  /** Makes the chip a button (adds a ›). */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Marks the chip as a tour target (docs/TOUR.md, e.g. 'vendor.vendorId'). */
  tourId?: string;
};

export type SummaryHeroAction = { title: string; onPress: () => void; icon?: ReactNode; loading?: boolean; disabled?: boolean };

export type SummaryHeroProps = {
  /** The muted label beside the icon ("Leave balance"). */
  label: string;
  /** Line icon in the white circle; tinted with `module`'s colour when given. */
  icon?: LucideIcon;
  module?: ModuleKey;
  /** The round corner arrow button (↗) — opens the detail. Hidden without it. */
  onArrowPress?: () => void;
  arrowLabel?: string;
  /** 'brand' (default, filled vermilion) or 'frost' (white, Payno Pay Bills). */
  arrowTone?: 'brand' | 'frost';
  /** Any figure node (e.g. a kit Numeral). Wins over `value`. */
  figure?: ReactNode;
  /** A plain figure: `value` with `currency` (₹, small + muted, greyed decimals) or a `unit` ("days"). */
  value?: number;
  decimals?: number;
  currency?: string;
  unit?: string;
  /** Shows the eye toggle. Controlled with `hidden` + `onHiddenChange`, otherwise it keeps its own state. */
  hideable?: boolean;
  hidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
  /** The frosted ⓘ chip under the figure. */
  info?: SummaryHeroInfo;
  /** A muted line under the figure ("Next due • Tomorrow"), up to 2 lines. */
  sub?: string;
  /** A full-width primary pill inside the card. */
  action?: SummaryHeroAction;
  /** 'frostStrong' (default, 0.80) or 'frost' (0.58). */
  tone?: 'frost' | 'frostStrong';
  /** Extra content at the bottom (e.g. a StripedProgress). */
  children?: ReactNode;
  /**
   * While the figure loads: a pulsing bar in its place at the figure's own height (and a bar for the
   * info chip / sub-line when they are passed), so the card keeps its size — no guessed skeleton height,
   * no "₹0" flash, no jump when the data lands. The label, icon and arrow show as usual.
   */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Payno's light summary hero. One per screen, at the top.
 *   <SummaryHero icon={CalendarDays} module="leave" label="Leave balance" value={14.5} decimals={1} unit="days"
 *     onArrowPress={() => router.push('/leave')} info={{ label: 'Casual', value: '6 left', onPress: openTypes }}
 *     action={{ title: 'Apply leave', onPress: () => router.push('/leave/apply?kind=leave') }} />
 *   <SummaryHero icon={Wallet} module="pettyCash" label="Petty cash left" value={8450} currency="₹" hideable
 *     sub="Last bill • 12 Oct" />
 */
export function SummaryHero({
  label,
  icon: Icon,
  module,
  onArrowPress,
  arrowLabel,
  arrowTone = 'brand',
  figure,
  value,
  decimals,
  currency,
  unit,
  hideable,
  hidden,
  onHiddenChange,
  info,
  sub,
  action,
  tone = 'frostStrong',
  children,
  loading,
  style,
}: SummaryHeroProps) {
  const [ownHidden, setOwnHidden] = useState(false);
  const isHidden = !!hideable && (hidden ?? ownHidden);
  const toggle = () => {
    const next = !isHidden;
    setOwnHidden(next);
    onHiddenChange?.(next);
  };
  const tint = module ? (moduleTone[module] ?? moduleTone.profile) : null;
  const brandArrow = arrowTone === 'brand';

  let shown: ReactNode = null;
  if (loading) {
    shown = <Skeleton width="62%" height={FIGURE_H - 14} radius={radius.sm} style={styles.figureSkeleton} />;
  } else if (isHidden) {
    shown = (
      <Text variant="numeral" color={palette.textFaint} numberOfLines={1} accessibilityLabel="Amount hidden" style={styles.flexShrink}>
        {currency ? <RNText style={styles.hiddenCurrency}>{`${currency}\u2009`}</RNText> : null}
        <RNText style={styles.hiddenDots}>••••••</RNText>
      </Text>
    );
  } else if (figure != null) {
    shown = figure;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    shown = currency ? (
      <Amount value={value} currency={currency} decimals={decimals ?? 2} variant="display" style={[typeScale.numeral, styles.flexShrink]} />
    ) : (
      <Metric value={value} decimals={decimals ?? 0} unit={unit} variant="display" style={[typeScale.numeral, styles.flexShrink]} />
    );
  }

  return (
    <Card tone={tone} style={[styles.card, style]}>
      <View style={styles.top}>
        {Icon ? (
          <View style={styles.iconCircle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon size={18} color={tint ? tint.fg : palette.text} strokeWidth={1.7} />
          </View>
        ) : null}
        <Text variant="label" muted numberOfLines={2} style={styles.flex}>
          {label}
        </Text>
        {onArrowPress ? (
          <PressableScale
            onPress={onArrowPress}
            scaleTo={0.92}
            hitSlop={hitSlopFor(ARROW)}
            accessibilityRole="button"
            accessibilityLabel={arrowLabel ?? `Open ${label}`}
            style={[styles.arrow, brandArrow ? styles.arrowBrand : styles.arrowFrost]}>
            <ArrowUpRight size={18} color={brandArrow ? palette.onPrimary : palette.text} strokeWidth={1.8} />
          </PressableScale>
        ) : null}
      </View>

      {shown != null || hideable || loading ? (
        <View style={styles.figureRow}>
          <View style={[styles.figure, loading && styles.flex]}>{shown}</View>
          {hideable && !loading ? (
            <PressableScale
              onPress={toggle}
              scaleTo={0.9}
              hitSlop={hitSlopFor(EYE)}
              accessibilityRole="button"
              accessibilityLabel={isHidden ? 'Show amount' : 'Hide amount'}
              style={styles.eye}>
              {isHidden ? <Eye size={22} color={palette.textMuted} strokeWidth={1.7} /> : <EyeOff size={22} color={palette.textMuted} strokeWidth={1.7} />}
            </PressableScale>
          ) : null}
        </View>
      ) : null}

      {loading && (info || sub) ? (
        <Skeleton width="44%" height={20} radius={radius.pill} style={styles.lineSkeleton} />
      ) : info ? (
        info.tourId ? (
          <TourTarget id={info.tourId} radius={radius.pill} style={styles.chipTarget}>
            <InfoChip info={info} />
          </TourTarget>
        ) : (
          <InfoChip info={info} />
        )
      ) : null}
      {sub && !loading ? (
        <Text variant="label" muted numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
      {action ? (
        <Button
          title={action.title}
          icon={action.icon}
          loading={action.loading}
          disabled={action.disabled}
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
      {children != null ? <View style={styles.children}>{children}</View> : null}
    </Card>
  );
}

/** The frosted ⓘ pill under a hero figure: muted label • emphasised value ›. */
function InfoChip({ info }: { info: SummaryHeroInfo }) {
  const spoken = info.accessibilityLabel ?? [info.label, info.value].filter(Boolean).join(', ');
  const body = (
    <>
      <Info size={14} color={palette.textMuted} strokeWidth={2} />
      <Text variant="caption" muted numberOfLines={2} style={styles.flexShrink}>
        {info.label}
        {info.value ? (
          <Text variant="caption" color={palette.ink} style={styles.chipValue}>
            {`  •  ${info.value}`}
          </Text>
        ) : null}
      </Text>
      {info.onPress ? <ChevronRight size={14} color={palette.textMuted} strokeWidth={2.2} /> : null}
    </>
  );
  if (!info.onPress) {
    return (
      <View style={styles.chip} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={info.onPress}
      scaleTo={0.96}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={styles.chip}>
      {body}
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  card: { borderRadius: radius.xxl, gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: ARROW },
  iconCircle: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  arrow: { width: ARROW, height: ARROW, borderRadius: ARROW / 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  arrowBrand: { backgroundColor: palette.primary },
  arrowFrost: { backgroundColor: palette.surface, borderWidth: 1, borderColor: IOS ? palette.glassEdge : palette.glassLine },
  figureRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm },
  figure: { flexShrink: 1, minWidth: 0 },
  figureSkeleton: { marginVertical: 7 },
  lineSkeleton: { marginVertical: 6 },
  // Hidden figure: the same line height as the number, a small muted ₹ and smaller spaced dots.
  hiddenCurrency: { fontSize: 29, color: palette.textMuted, letterSpacing: 0 },
  hiddenDots: { fontSize: 30, letterSpacing: 3 },
  eye: { width: EYE, height: EYE, borderRadius: EYE / 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipTarget: { alignSelf: 'flex-start', maxWidth: '100%' },
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
    backgroundColor: palette.frost,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
  chipValue: { fontFamily: font.semibold },
  action: { alignSelf: 'stretch', marginTop: space.xxs },
  children: { marginTop: space.xxs },
}));
