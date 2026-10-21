// IT desk — small shared pieces: a switch row, a booking-purpose chip, and the people directory the
// asset screens read (GET /users + GET /whitelist) for names, the assign pool and the Fix link.

import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useInvitees } from '@/api/itdesk';
import { usePickablePeople } from '@/features/shared/person-picker';
import { themedStyles } from '@/theme/themed';
import { type ModuleKey, palette, radius, space } from '@/theme/tokens';
import { ActivityRow, type ActivityRowProps, SwitchRow, Text } from '@/ui';

/**
 * A status row (no figure): the kit's ActivityRow, which now puts the pill under the text itself
 * whenever there is no value (DESIGN §0C). Kept under this name for the IT desk screens.
 */
export function StatusRow(props: ActivityRowProps) {
  return <ActivityRow {...props} />;
}

/** One switch as a list row: the whole row is the control (touch and screen readers). */
export function ToggleRow({
  bleed,
  ...rest
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
  module?: ModuleKey;
  /** Inside a padded card or sheet among fields: line the title up with the field labels. */
  bleed?: boolean;
}) {
  return <SwitchRow {...rest} flush={bleed} />;
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
  bleed: { marginHorizontal: -space.md },
  pressed: { backgroundColor: palette.pressedTint },
  dim: { opacity: 0.55 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeDot: { width: 14, height: 14, borderRadius: 4 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, maxWidth: '100%' },
}));
