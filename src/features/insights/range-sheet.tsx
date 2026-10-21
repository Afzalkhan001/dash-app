// The date-range picker both insights screens use: preset rows, then two date fields for a custom range.
// Picking a preset closes at once; a custom range is applied with its button (from ≤ to is kept, as the
// website's date inputs do).

import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { palette, space } from '@/theme/tokens';
import { Button, DateField, ListCard, ListRow, Sheet, Text } from '@/ui';

export type RangeOption<K extends string> = { key: K; label: string; from: string; to: string };

export function RangeSheet<K extends string>({
  visible,
  onClose,
  title = 'Dates',
  options,
  value,
  onPick,
  maxDate,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: RangeOption<K>[];
  value: { key: K | 'custom'; from: string; to: string };
  onPick: (r: { key: K | 'custom'; from: string; to: string }) => void;
  maxDate?: string;
}) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [seen, setSeen] = useState(visible);
  // Re-seed the custom fields each time the sheet opens (derived from props, no effect needed).
  if (visible !== seen) {
    setSeen(visible);
    if (visible) {
      setFrom(value.from);
      setTo(value.to);
    }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ListCard>
        {options.map((o) => (
          <ListRow
            key={o.key}
            title={o.label}
            onPress={() => {
              onPick({ key: o.key, from: o.from, to: o.to });
              onClose();
            }}
            right={value.key === o.key ? <Check size={20} color={palette.primaryText} strokeWidth={2} /> : undefined}
            accessibilityHint={value.key === o.key ? 'Selected' : undefined}
          />
        ))}
      </ListCard>
      <Text variant="label" muted style={{ marginTop: space.sm }}>
        Or choose the days
      </Text>
      <View style={{ gap: space.sm }}>
        <DateField
          label="From"
          value={from}
          maximumDate={maxDate}
          onChange={(v) => {
            setFrom(v);
            if (v > to) setTo(v);
          }}
        />
        <DateField
          label="To"
          value={to}
          maximumDate={maxDate}
          onChange={(v) => {
            setTo(v);
            if (v < from) setFrom(v);
          }}
        />
        <Button
          title="Show these days"
          disabled={!from || !to}
          onPress={() => {
            onPick({ key: 'custom', from, to });
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}
