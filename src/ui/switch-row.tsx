// SwitchRow — one on/off setting as a list row (the More › App lock pattern), the kit's single copy
// (it replaces the ToggleRow / SwitchRow copies that features kept). The whole row is the switch for
// touch and screen readers; the system Switch inside is display only, so a tap can't toggle it twice.
// The off track is textFaint (≥ 3:1 against a card in both themes, so an off switch is still visible
// — the old surfaceSunken / hairline track was ~1.2:1); on is accentDeep green with a white thumb.
// `flush`: inside a padded Card or a Sheet among fields — pulls the row out so its title lines up with
// the field labels (4 dp in from the card's content edge).

import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, Switch, View, type ViewStyle } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { type ModuleKey, palette, radius, space } from '@/theme/tokens';
import { ListRow, ModuleBadge } from '@/ui/list';

export type SwitchRowProps = {
  title: string;
  /** Muted line(s) under the title — what the setting does. Also the screen-reader hint. */
  subtitle?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Saving: the row can't be toggled and reads as busy. */
  busy?: boolean;
  /** A ModuleBadge on the left (`icon` + `module`), or any `left` node. */
  icon?: LucideIcon;
  module?: ModuleKey;
  left?: ReactNode;
  /** Lines for the subtitle (default 3). */
  subtitleLines?: number;
  /** Line the title up with field labels inside a padded card or sheet. */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 *   <SwitchRow title="Send reminders" subtitle="A push at 9 AM on working days" value={on} onChange={setOn} />
 */
export function SwitchRow({ title, subtitle, value, onChange, disabled, busy, icon, module, left, subtitleLines = 3, flush, style }: SwitchRowProps) {
  const off = !!disabled || !!busy;
  const offTrack = palette.textFaint;
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={off}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: off, busy: !!busy }}
      style={({ pressed }) => [styles.row, flush && styles.flush, pressed && styles.pressed, disabled && styles.dim, style]}>
      <ListRow
        left={left ?? (icon && module ? <ModuleBadge module={module} icon={icon} /> : undefined)}
        title={title}
        subtitle={subtitle}
        numberOfLines={2}
        subtitleLines={subtitleLines}
        right={
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Switch
              value={value}
              disabled={off}
              trackColor={{ false: offTrack, true: palette.accentDeep }}
              thumbColor={palette.onAccent}
              ios_backgroundColor={offTrack}
            />
          </View>
        }
      />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: { borderRadius: radius.md },
  // ListRow pads 16 each side; pull out by 12 so the title sits 4 dp in, like a field label.
  flush: { marginHorizontal: -(space.md - space.xxs) },
  pressed: { backgroundColor: palette.pressedTint },
  dim: { opacity: 0.55 },
}));
