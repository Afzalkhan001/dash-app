// Action layout (docs/DESIGN.md §7.2–7.3, rules A1–A18). The only way to put two labelled buttons
// together, and the sticky commit bar for pushed detail / form screens.

import { BlurView } from 'expo-blur';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { themedStyles } from '@/theme/themed';
import { layout, palette, space } from '@/theme/tokens';
import { useLayout } from '@/ui/layout';
import { type ButtonProps } from '@/ui/primitives';
import { isDarkScheme, withAlpha } from '@/ui/surface';
import { Text } from '@/ui/text';

export type ActionContext = 'card' | 'hero' | 'bar' | 'sheet' | 'screen';

const CHAR_DP = 8.3; // Plus Jakarta Sans SemiBold 15 px ≈ 0.55 em per character
const PAIR_PAD = 16; // horizontal padding of each button in a side-by-side pair
const ICON_ROOM = 26; // 18 dp icon + 8 dp gap

type ButtonLike = ReactElement<Partial<ButtonProps>>;

/**
 * Two buttons, side by side when both labels fit, otherwise stacked with the primary on top.
 * Pass children in row order — secondary FIRST, primary LAST:
 *
 *   <ActionRow context="card">
 *     <Button variant="danger" title="Reject" icon={<X />} onPress={…} />
 *     <Button variant="primary" title="Approve" icon={<Check />} onPress={…} />
 *   </ActionRow>
 *
 * The decision is deterministic (window width, gutter + padding of `context`, label length at
 * 8.3 dp per character and the font scale), so it never flickers. While one button is `loading`, the
 * others are disabled. One child renders full width; three or more are stacked (use a MenuSheet).
 */
export function ActionRow({
  context = 'card',
  children,
  stacked,
  style,
}: {
  context?: ActionContext;
  children: ReactNode;
  /** Force the stacked layout. */
  stacked?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { width, fontScale, gutter, cardPad, heroPad } = useLayout();
  const items = Children.toArray(children).filter(isValidElement) as ButtonLike[];

  if (__DEV__ && items.length > 2) {
    console.warn('ActionRow: more than 2 buttons — keep 1 primary + 1 secondary and move the rest into a MenuSheet.');
  }

  const outer = {
    screen: 2 * gutter,
    bar: 2 * gutter,
    card: 2 * gutter + 2 * cardPad,
    hero: 2 * gutter + 2 * heroPad,
    sheet: 2 * layout.sheetPad,
  }[context];
  const half = (width - outer - space.sm) / 2;
  const scale = Math.min(fontScale, 1.3);
  const fits = (b: ButtonLike) => {
    const title = typeof b.props.title === 'string' ? b.props.title : '';
    const need = title.length * CHAR_DP * scale * (b.props.size === 'sm' ? 0.87 : 1);
    const room = half - 2 * PAIR_PAD - (b.props.icon ? ICON_ROOM : 0);
    return need <= room;
  };
  const side = !stacked && items.length === 2 && items.every(fits);
  const busy = items.some((b) => !!b.props.loading);

  const prepared = items.map((b, i) => {
    const extra: Partial<ButtonProps> = {
      style: side
        ? [b.props.style, { flex: 1, minWidth: 0, alignSelf: 'stretch' }, b.props.size !== 'sm' && { paddingHorizontal: PAIR_PAD }]
        : [b.props.style, { flex: 0, alignSelf: 'stretch' }],
    };
    if (busy && !b.props.loading) extra.disabled = true;
    return cloneElement(b, { key: b.key ?? i, ...extra });
  });

  return (
    <View style={[side ? styles.row : styles.column, style]}>
      {side ? prepared : prepared.slice().reverse()}
    </View>
  );
}

/**
 * Sticky bottom bar for pushed detail and form screens — pass it as `<Screen footer={…}>` (never on
 * tab roots). Holds one lg Button or one `<ActionRow context="bar">`. `note` is a short centred
 * caption above the buttons: why the submit is disabled, or what the button will do.
 */
export function ActionBar({ children, note, style }: { children: ReactNode; note?: string | null; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  return (
    <View style={[styles.bar, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, space.md) }, style]}>
      {Platform.OS === 'ios' ? <BlurView intensity={40} tint={isDarkScheme() ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, styles.barFill]} pointerEvents="none" />
      {note ? (
        <Text variant="caption" muted align="center" numberOfLines={2}>
          {note}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
  column: { flexDirection: 'column', gap: space.sm },
  bar: {
    paddingTop: space.sm,
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: palette.glassLine,
    overflow: 'hidden',
  },
  // iOS: a frosted veil over the blur. Android (no blur): near-opaque ivory in light, the opaque card colour in dark.
  barFill: { backgroundColor: Platform.OS === 'ios' ? palette.glassStrong : isDarkScheme() ? palette.surface : withAlpha(palette.canvasTop, 0.96) },
}));
