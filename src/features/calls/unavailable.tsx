// What a call looks like in a copy of the app that cannot carry one (Expo Go today; see HANDOFF.md):
// a clear line, never a crash. Calls need react-native-webrtc, which only an installed DASH app has.

import { PhoneOff } from 'lucide-react-native';
import { View } from 'react-native';

import { UNAVAILABLE_IN_EXPO_GO } from '@/lib/capabilities';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { IconBadge, Text } from '@/ui';

export const UNAVAILABLE_LINE = 'Voice and video calls need the installed DASH app. Until then, answer on the DASH website.';

export function UnavailableCard({ onDark }: { onDark?: boolean }) {
  return (
    <View style={[styles.card, onDark ? styles.cardDark : null]}>
      <IconBadge bg={onDark ? palette.frostOnDark : palette.surface} size={48}>
        <PhoneOff size={22} color={onDark ? palette.onPrimary : palette.warningInk} strokeWidth={1.8} />
      </IconBadge>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={onDark ? palette.onPrimary : undefined}>
          {UNAVAILABLE_IN_EXPO_GO}
        </Text>
        <Text variant="label" color={onDark ? palette.onPrimaryMuted : undefined} muted={!onDark}>
          {UNAVAILABLE_LINE}
        </Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: palette.warningSoft,
  },
  cardDark: { backgroundColor: palette.frostOnDark, borderWidth: 1, borderColor: palette.frostEdgeOnDark },
  text: { flex: 1, minWidth: 0, gap: 2 },
}));
