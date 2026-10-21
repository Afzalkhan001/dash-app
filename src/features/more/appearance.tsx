// More → Account → Appearance: System (follow the phone), Light or Dark. The row shows the current
// choice; tapping it opens a sheet with three SelectTiles. Picking one switches the whole app at once
// (src/theme/theme-provider.tsx) and is remembered on this phone.

import { MonitorSmartphone, Moon, Palette as PaletteIcon, Sun } from 'lucide-react-native';
import { useState } from 'react';

import { type ThemePreference, useThemePreference } from '@/theme/theme-provider';
import { ListRow, ModuleBadge, SelectTiles, type SelectTileOption, Sheet, Text } from '@/ui';

const OPTIONS: SelectTileOption<ThemePreference>[] = [
  { value: 'system', label: 'System', icon: MonitorSmartphone, sub: 'Like the phone' },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const LABEL: Record<ThemePreference, string> = { system: 'Same as the phone', light: 'Light', dark: 'Dark' };

export function AppearanceRow() {
  const preference = useThemePreference((s) => s.preference);
  const setPreference = useThemePreference((s) => s.setPreference);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        left={<ModuleBadge module="profile" icon={PaletteIcon} />}
        title="Appearance"
        subtitle={LABEL[preference]}
        chevron
        onPress={() => setOpen(true)}
        accessibilityHint="Choose light, dark or the phone's setting"
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Appearance" subtitle="Dark is easier on the eyes at night.">
        <SelectTiles
          options={OPTIONS}
          value={preference}
          accessibilityLabel="Appearance"
          onChange={(next) => {
            setOpen(false);
            // Let the sheet close before the app re-renders in the new colours.
            setTimeout(() => setPreference(next), 280);
          }}
        />
        <Text variant="caption" muted>
          System follows your phone&apos;s light or dark setting automatically.
        </Text>
      </Sheet>
    </>
  );
}
