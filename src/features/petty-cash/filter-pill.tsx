// The list filter on the money screens (expense claims, petty cash, bounty): the kit's PillSelector
// ("All claims ⌄") that opens a short sheet of choices, each with its count, the chosen one ticked.
// One shared piece so the three modules filter the same way.

import { Check, ListFilter } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { palette } from '@/theme/tokens';
import { haptic, ListCard, ListRow, PillSelector, Sheet, Text } from '@/ui';

export type FilterOption<T extends string> = { value: T; label: string; count?: number };

/**
 * PillSelector + choice sheet.
 *   <FilterPill title="Show claims" value={filter} onChange={setFilter}
 *     options={[{ value: 'all', label: 'All claims', count: 12 }, { value: 'paid', label: 'Paid', count: 4 }]} />
 */
export function FilterPill<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  /** Sheet title, also the pill's spoken name ("Show claims"). */
  title: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = (Array.isArray(options) ? options : []).filter((o) => o && o.label);
  const current = list.find((o) => o.value === value) ?? list[0];
  if (!current) return null;
  return (
    <>
      <PillSelector
        icon={ListFilter}
        label={current.label}
        accessibilityLabel={`${title}: ${current.label}`}
        accessibilityHint="Opens the filter choices"
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <ListCard separatorInset={16}>
          {list.map((o) => {
            const on = o.value === current.value;
            return (
              <ListRow
                key={o.value}
                title={o.label}
                titleColor={on ? palette.primaryText : undefined}
                accessibilityLabel={`${o.label}${o.count != null ? `, ${o.count}` : ''}${on ? ', selected' : ''}`}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {o.count != null ? (
                      <Text variant="label" muted tabular numberOfLines={1}>
                        {o.count.toLocaleString('en-IN')}
                      </Text>
                    ) : null}
                    <View style={{ width: 20, alignItems: 'center' }}>{on ? <Check size={18} color={palette.primaryText} strokeWidth={2.2} /> : null}</View>
                  </View>
                }
                onPress={() => {
                  setOpen(false);
                  if (!on) {
                    haptic.select();
                    onChange(o.value);
                  }
                }}
              />
            );
          })}
        </ListCard>
      </Sheet>
    </>
  );
}
