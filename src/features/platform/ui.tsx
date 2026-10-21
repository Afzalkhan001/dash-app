// Small pieces the platform screens share: a switch row, and the company picker (a PillSelector that
// opens a sheet of every company).

import type { LucideIcon } from 'lucide-react-native';
import { Building2, Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { companyName, companyStatus } from '@/api/platform';
import type { Tenant } from '@/api/me';
import { themedStyles } from '@/theme/themed';
import { type ModuleKey, palette, radius } from '@/theme/tokens';
import { Avatar, isDarkScheme, ListCard, ListRow, ModuleBadge, PillSelector, Sheet } from '@/ui';

/** One switch as a list row: the whole row is the switch for touch and screen readers (the Switch inside is display only). */
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

/**
 * "Company ⌄": a pill with the chosen company that opens a sheet listing every company. `allLabel` adds
 * an "every company" choice at the top (value '').
 */
export function CompanyPicker({
  tenants,
  value,
  onChange,
  allLabel,
}: {
  tenants: Tenant[];
  value: string;
  onChange: (id: string) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = tenants.find((t) => t.id === value) ?? null;
  const label = current ? companyName(current) : allLabel && !value ? allLabel : 'Choose a company';
  const pick = (id: string) => {
    setOpen(false);
    onChange(id);
  };
  return (
    <>
      <PillSelector icon={Building2} label={label} onPress={() => setOpen(true)} accessibilityLabel={`Company: ${label}`} accessibilityHint="Opens the list of companies" />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Choose a company">
        <ListCard>
          {allLabel ? (
            <ListRow
              left={<ModuleBadge module="policies" icon={Building2} />}
              title={allLabel}
              right={!value ? <Check size={20} color={palette.primaryText} /> : undefined}
              onPress={() => pick('')}
              accessibilityLabel={`${allLabel}${!value ? ', chosen' : ''}`}
            />
          ) : null}
          {tenants.map((t) => {
            const on = t.id === value;
            const name = companyName(t);
            return (
              <ListRow
                key={t.id}
                left={<Avatar name={name} size={40} ring={false} />}
                title={name}
                subtitle={companyStatus(t) === 'suspended' ? 'Suspended' : undefined}
                right={on ? <Check size={20} color={palette.primaryText} /> : undefined}
                onPress={() => pick(t.id)}
                accessibilityLabel={`${name}${on ? ', chosen' : ''}`}
              />
            );
          })}
        </ListCard>
      </Sheet>
    </>
  );
}

const styles = themedStyles(() => ({
  row: { borderRadius: radius.md },
  pressed: { backgroundColor: palette.pressedTint },
  dim: { opacity: 0.55 },
}));
