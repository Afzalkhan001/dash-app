// Label / value rows (docs/DESIGN.md §7.11) — replace every fixed-width label column. Short values sit
// on the right of their label (label 42 % / value 58 %); long values stack under the label, so nothing
// ever overflows at 360 dp or with large text.

import { ChevronRight } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { useLayout } from '@/ui/layout';
import { Text } from '@/ui/text';

export type KeyValueTone = 'default' | 'muted' | 'success' | 'warning' | 'danger';

/** The value's text colour for a tone, read from the live theme at render time. */
function toneColor(tone: KeyValueTone): string {
  switch (tone) {
    case 'muted':
      return palette.textMuted;
    case 'success':
      return palette.successInk;
    case 'warning':
      return palette.warningInk;
    case 'danger':
      return palette.dangerInk;
    default:
      return palette.text;
  }
}

export type KeyValueRowProps = {
  label: string;
  value: string | number | null | undefined;
  hint?: string | null;
  tone?: KeyValueTone;
  /** Totals: label and value both bodyStrong. */
  strong?: boolean;
  tabular?: boolean;
  /** Makes the row pressable (chevron, pressed tint, 48 dp min height). */
  onPress?: () => void;
  /** Rendered under the value (e.g. a small link button). */
  action?: ReactNode;
  /** Long-press to copy the value. Defaults to true when there is no onPress. */
  selectable?: boolean;
  /** Hairline above the row (KeyValueList sets it on every row but the first). */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**   <KeyValueRow label="Net pay" value="₹48,250.00" strong tabular /> */
export function KeyValueRow({ label, value, hint, tone = 'default', strong, tabular, onPress, action, selectable, divider, style }: KeyValueRowProps) {
  const { compact } = useLayout();
  const text = value == null || value === '' ? '—' : typeof value === 'number' ? (Number.isFinite(value) ? value.toLocaleString('en-IN') : '—') : String(value);
  const inline = (compact ? text.length <= 18 : text.length <= 24) && (!hint || hint.length <= text.length);
  const color = toneColor(tone);
  const canSelect = selectable ?? !onPress;

  const labelEl = (
    <Text variant={strong ? 'bodyStrong' : 'label'} color={strong ? palette.text : palette.textMuted} numberOfLines={inline ? 2 : undefined} style={inline ? styles.inlineLabel : null}>
      {label}
    </Text>
  );
  const valueEl = (
    <Text variant="bodyStrong" color={color} tabular={tabular} selectable={canSelect} numberOfLines={inline ? 3 : undefined} align={inline ? 'right' : 'left'}>
      {text}
    </Text>
  );
  const hintEl = hint ? (
    <Text variant="caption" muted align={inline ? 'right' : 'left'}>
      {hint}
    </Text>
  ) : null;

  const content = inline ? (
    <View style={styles.inline}>
      {labelEl}
      <View style={styles.inlineValue}>
        {valueEl}
        {hintEl}
        {action}
      </View>
      {onPress ? <ChevronRight size={18} color={palette.textFaint} style={{ flexShrink: 0 }} /> : null}
    </View>
  ) : (
    <View style={styles.inline}>
      <View style={styles.stacked}>
        {labelEl}
        {valueEl}
        {hintEl}
        {action}
      </View>
      {onPress ? <ChevronRight size={18} color={palette.textFaint} style={{ flexShrink: 0 }} /> : null}
    </View>
  );

  const frame = [styles.row, divider && styles.divider, onPress && styles.pressableRow, style];
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}`}
      style={({ pressed }) => [...frame, pressed && { backgroundColor: palette.pressedTint }]}>
      {content}
    </Pressable>
  );
}

export type KeyValueItem = Omit<KeyValueRowProps, 'divider' | 'style'> & { key?: string };

/**
 *   <KeyValueList rows={[{ label: 'From', value: 'Mon, 12 Oct 2026' }, { label: 'Days', value: '3', tone: 'muted' }]} hideEmpty />
 * `hideEmpty` drops rows whose value is null, undefined or ''.
 */
export function KeyValueList({ rows, hideEmpty, style }: { rows: KeyValueItem[]; hideEmpty?: boolean; style?: StyleProp<ViewStyle> }) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && (!hideEmpty || (r.value != null && r.value !== '')));
  return (
    <View style={style}>
      {list.map(({ key, ...r }, i) => (
        <KeyValueRow key={key ?? `${r.label}-${i}`} {...r} divider={i > 0} />
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { paddingVertical: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator },
  pressableRow: { minHeight: 48, justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  inlineLabel: { flex: 0.42, minWidth: 0, paddingTop: 2 },
  inlineValue: { flex: 0.58, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  stacked: { flex: 1, minWidth: 0, gap: space.xxs },
}));
