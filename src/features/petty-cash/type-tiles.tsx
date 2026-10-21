// Expense type, picked the Payno way: up to four SelectTiles with a thin icon each. The server's list
// can be longer (Food & Beverages, Travel & Conveyance, Equipment Rental, …), so with more than four
// types the first three get a tile and the fourth tile is "More types", which opens a sheet with all
// of them; a type chosen from the sheet then takes that fourth tile (ticked), so the choice is always
// visible. Types another line already uses can be passed in `taken` and are not offered again.

import {
  BedDouble,
  Camera,
  Car,
  Clapperboard,
  Fuel,
  type LucideIcon,
  MapPin,
  MoreHorizontal,
  Package,
  Printer,
  ReceiptText,
  Users,
  Utensils,
} from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { ExpenseHead } from '@/api/petty-cash';
import { palette, space } from '@/theme/tokens';
import { Button, FieldMessage, haptic, ListCard, ListRow, SelectTiles, Sheet, Skeleton, Text } from '@/ui';

const MORE = '__more__';

/** A line icon for an expense type, guessed from its name (the server only sends names). */
export function headIcon(name?: string | null): LucideIcon {
  const n = String(name || '').toLowerCase();
  if (/food|beverage|meal|tea|snack|lunch/.test(n)) return Utensils;
  if (/fuel|petrol|diesel/.test(n)) return Fuel;
  if (/travel|convey|transport|cab|taxi|auto/.test(n)) return Car;
  if (/rental|equipment|camera|gear/.test(n)) return Camera;
  if (/prop|set|material/.test(n)) return Package;
  if (/location|venue|place/.test(n)) return MapPin;
  if (/talent|artist|crew/.test(n)) return Users;
  if (/stay|hotel|accommodation|lodg/.test(n)) return BedDouble;
  if (/print|stationery/.test(n)) return Printer;
  if (/shoot|production|film/.test(n)) return Clapperboard;
  return ReceiptText;
}

export function ExpenseTypeTiles({
  heads,
  value,
  onChange,
  taken,
  loading,
  failed,
  error,
  label = 'Expense type',
}: {
  heads: ExpenseHead[];
  value: string | null;
  onChange: (id: string) => void;
  /** Types already used by another line (not offered again). */
  taken?: string[];
  loading?: boolean;
  /** The types didn't load (the screen shows the retry). */
  failed?: boolean;
  error?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const used = new Set((taken ?? []).filter((id) => id && id !== value));
  const all = (Array.isArray(heads) ? heads : []).filter((h) => !!h && !!h.id && !used.has(h.id));
  const many = all.length > 4;
  const first = many ? all.slice(0, 3) : all;
  const chosen = all.find((h) => h.id === value) ?? null;
  // A choice from the sheet that has no tile of its own takes the fourth tile.
  const chosenElsewhere = many && !!chosen && !first.some((h) => h.id === chosen.id);
  const options = [
    ...first.map((h) => ({ value: h.id, label: h.name || 'Expense type', icon: headIcon(h.name) })),
    ...(many
      ? [
          chosenElsewhere
            ? { value: chosen!.id, label: chosen!.name || 'Expense type', icon: headIcon(chosen!.name), hint: 'Use “Pick another type” to change it' }
            : { value: MORE, label: 'More types', icon: MoreHorizontal, hint: `Shows all ${all.length} types` },
        ]
      : []),
  ];

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="labelStrong" muted numberOfLines={1}>
        {label}
      </Text>
      {loading ? (
        <Skeleton height={88} radius={20} />
      ) : !all.length ? (
        <Text variant="label" muted>
          {failed ? 'Expense types couldn’t be loaded.' : 'No expense types are set up yet. Ask Accounts to add some.'}
        </Text>
      ) : (
        <SelectTiles
          accessibilityLabel={label}
          options={options}
          value={value}
          onChange={(v) => {
            if (v === MORE) {
              setOpen(true);
              return;
            }
            onChange(v);
          }}
        />
      )}
      {chosenElsewhere ? (
        <Button title="Pick another type" variant="text" size="md" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />
      ) : null}
      <FieldMessage error={error} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label} subtitle="What the money is for">
        <ListCard separatorInset={64}>
          {all.map((h) => {
            const Icon = headIcon(h.name);
            const on = h.id === value;
            return (
              <ListRow
                key={h.id}
                left={<Icon size={22} color={on ? palette.primaryText : palette.text} strokeWidth={1.6} />}
                title={h.name || 'Expense type'}
                titleColor={on ? palette.primaryText : undefined}
                accessibilityLabel={`${h.name || 'Expense type'}${on ? ', selected' : ''}`}
                onPress={() => {
                  setOpen(false);
                  if (!on) {
                    haptic.select();
                    onChange(h.id);
                  }
                }}
              />
            );
          })}
        </ListCard>
      </Sheet>
    </View>
  );
}
