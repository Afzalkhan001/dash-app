// One switch as a list row (the More › App lock pattern): the whole row is the switch for touch and
// screen readers; the system Switch inside is display only, so a tap can't toggle it twice.

import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Switch, View } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { type ModuleKey, palette, radius } from '@/theme/tokens';
import { isDarkScheme, ListRow, ModuleBadge } from '@/ui';

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
  busy,
  icon,
  module,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
  module?: ModuleKey;
}) {
  const offTrack = isDarkScheme() ? palette.hairline : palette.surfaceSunken;
  const off = !!disabled || !!busy;
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={off}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: off, busy: !!busy }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.dim]}>
      <ListRow
        left={icon && module ? <ModuleBadge module={module} icon={icon} /> : undefined}
        title={title}
        subtitle={subtitle}
        numberOfLines={2}
        subtitleLines={3}
        right={
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Switch value={value} disabled={off} trackColor={{ false: offTrack, true: palette.accentDeep }} thumbColor={palette.onAccent} ios_backgroundColor={offTrack} />
          </View>
        }
      />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: { borderRadius: radius.md },
  pressed: { backgroundColor: palette.pressedTint },
  dim: { opacity: 0.55 },
}));
