// The line above the NumericKeypad on forms with several amounts (Request money, Add bills): which
// amount is being typed ("Expense 2 · Fuel") and what has been typed so far, in white on the keypad's
// deep wash. The amount card itself may be scrolled under the keypad, so the figure stays in sight.

import { View } from 'react-native';

import { palette, space } from '@/theme/tokens';
import { Text } from '@/ui';

/** '1234.5' → '₹1,234.5' (Indian grouping, the typed decimals kept as typed). */
export function typedAmount(value: string, currency = '₹') {
  const v = value ?? '';
  const [rawInt = '', dec] = v.split('.');
  const n = Number(rawInt || 0);
  const int = Number.isFinite(n) ? n.toLocaleString('en-IN') : rawInt;
  return `${currency}${int}${dec !== undefined ? `.${dec}` : ''}`;
}

export function KeypadReadout({ label, value }: { label: string; value: string }) {
  const shown = typedAmount(value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingHorizontal: space.xxs }} accessible accessibilityLabel={`${label}: ${shown}`} accessibilityLiveRegion="polite">
      <Text variant="label" color={palette.onPrimaryMuted} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </Text>
      <Text variant="title" color={palette.onPrimary} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 0, maxWidth: '60%' }}>
        {shown}
      </Text>
    </View>
  );
}
