// IT desk — small shared pieces: a switch row, a booking-purpose chip, and the people directory the
// asset screens read (GET /users + GET /whitelist) for names, the assign pool and the Fix link.

import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Switch, View } from 'react-native';

import { useInvitees } from '@/api/itdesk';
import { usePickablePeople } from '@/features/shared/person-picker';
import { themedStyles } from '@/theme/themed';
import { type ModuleKey, palette, radius, space } from '@/theme/tokens';
import { isDarkScheme, ListRow, ModuleBadge, Text } from '@/ui';

/** One switch as a list row: the whole row is the control (touch and screen readers). */
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
 * A booking purpose drawn in its own stored colours (the website's chip). Those colours are company
 * data picked from nine pairs; without them the chip uses the app's neutral tint.
 */
export function PurposeChip({ label, color, bg, muted }: { label: string; color?: string; bg?: string; muted?: boolean }) {
  const valid = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined);
  return (
    <View style={[styles.chip, { backgroundColor: valid(bg) ?? palette.surfaceMuted }, muted && styles.dim]}>
      <Text variant="labelStrong" color={valid(color) ?? palette.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A purpose's colour as a round badge (the list's left column). */
export function PurposeDot({ color, bg }: { color?: string; bg?: string }) {
  const valid = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined);
  return (
    <View style={[styles.badge, { backgroundColor: valid(bg) ?? palette.surfaceMuted }]}>
      <View style={[styles.badgeDot, { backgroundColor: valid(color) ?? palette.textMuted }]} />
    </View>
  );
}

/** Users (with email + Keka code kept, resigned people included for the lookup) and invitations. */
export function useAssetDirectory(enabled = true) {
  const users = usePickablePeople({ enabled, keep: ['email', 'kekaCode', 'employeeNumber'], includeLeft: true });
  const invitees = useInvitees(enabled);
  const ready = !!users.data && (!!invitees.data || invitees.isError);
  return {
    users,
    invitees,
    dir: ready ? { users: users.data ?? [], invitees: invitees.data ?? [] } : null,
  };
}

const styles = themedStyles(() => ({
  row: { borderRadius: radius.md },
  pressed: { backgroundColor: palette.pressedTint },
  dim: { opacity: 0.55 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeDot: { width: 14, height: 14, borderRadius: 4 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, maxWidth: '100%' },
}));
