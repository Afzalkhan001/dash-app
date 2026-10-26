// The More tab's profile card (docs/REFERENCE-COMPONENTS.md §3 More, Payno profile): my photo or
// initials in a soft ring, my name, my job title and a quiet "View profile ›" link on the light warm
// wash (features/people WashCard). The whole card is the one button (→ My profile). The old module
// grid is gone: More is now the website's sidebar (features/more/nav.ts, nav-list.tsx).

import { View } from 'react-native';

import { ViewLink, WashCard } from '@/features/people/person-ui';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { Avatar, PressableScale, Text, useLayout } from '@/ui';

const PHOTO = 60;
const RING = 4;

/**
 * My profile, on top of More (Payno profile): photo in a soft ring, my name, my job title and a
 * "View profile ›" link on the warm wash; the whole card opens My profile.
 */
export function ProfileCard({ name, photo, title, onPress }: { name: string; photo?: string | null; title?: string; onPress: () => void }) {
  const { compact } = useLayout();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={[name, title].filter(Boolean).join(', ')}
      accessibilityHint="Opens your profile">
      <WashCard style={styles.profile}>
        <View style={styles.ring}>
          <Avatar name={name} uri={photo} size={compact ? PHOTO - 8 : PHOTO} ring={false} />
        </View>
        <View style={styles.profileText}>
          <Text variant="title" color={palette.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.name}>
            {name}
          </Text>
          {title ? (
            <Text variant="label" muted numberOfLines={1} style={styles.shrink}>
              {title}
            </Text>
          ) : null}
          <ViewLink />
        </View>
      </WashCard>
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ring: { padding: RING, borderRadius: PHOTO / 2 + RING, backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: palette.glassLine, flexShrink: 0 },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4, flexShrink: 1 },
  shrink: { flexShrink: 1 },
}));
