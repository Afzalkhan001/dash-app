// The top of My profile (Payno profile on the light warm wash): my photo in a soft ring with a small
// camera badge (tap it to change or remove), my name, my job title, a row of short facts (my team and
// time here) as small frosted chips, and one "Edit profile" pill. It is the More tab's
// profile card, only bigger, so tapping that card lands on the same look. Two actions in this area and
// no more: the photo and the button.

import { Camera, Pencil } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';

import { WashCard } from '@/features/people/person-ui';
import { themedStyles } from '@/theme/themed';
import { font, palette, radius, space } from '@/theme/tokens';
import { Avatar, Button, PressableScale, Skeleton, Text } from '@/ui';

const PHOTO = 96;
const RING = 4;
const BADGE = 34;

export function ProfileHero({
  name,
  title,
  photo,
  photoBusy,
  facts,
  onPhoto,
  onEdit,
}: {
  name: string;
  title?: string;
  photo?: string | null;
  photoBusy?: boolean;
  /** A few short facts shown as chips under the title ("EMP-104", "Video", "4+ years"). */
  facts?: string[];
  onPhoto: () => void;
  onEdit: () => void;
}) {
  const chips = (Array.isArray(facts) ? facts : []).map((f) => String(f || '').trim()).filter(Boolean).slice(0, 3);
  return (
    <WashCard style={styles.card}>
      <PressableScale
        onPress={onPhoto}
        disabled={photoBusy}
        scaleTo={0.96}
        accessibilityRole="button"
        accessibilityLabel={photo ? 'Change your photo' : 'Add your photo'}
        accessibilityState={{ disabled: !!photoBusy, busy: !!photoBusy }}
        style={styles.photo}>
        <View style={styles.ring}>
          <Avatar name={name} uri={photo} size={PHOTO} ring={false} />
        </View>
        {photoBusy ? (
          <View style={styles.busy} pointerEvents="none">
            <ActivityIndicator color={palette.onPrimary} accessibilityLabel="Updating photo" />
          </View>
        ) : null}
        <View style={styles.camera} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Camera size={16} color={palette.onPrimary} strokeWidth={2} />
        </View>
      </PressableScale>

      <View style={styles.names}>
        <Text variant="title" color={palette.ink} align="center" numberOfLines={2} accessibilityRole="header">
          {name}
        </Text>
        {title ? (
          <Text variant="body" muted align="center" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
      </View>

      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((c) => (
            <View key={c} style={styles.chip}>
              <Text variant="caption" color={palette.ink} numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.chipText}>
                {c}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Button title="Edit profile" variant="primary" icon={<Pencil />} onPress={onEdit} style={styles.edit} />
    </WashCard>
  );
}

/** Placeholder with the hero's shape (photo, two lines, the button). */
export function ProfileHeroSkeleton() {
  return (
    <WashCard style={styles.card} accessibilityLabel="Loading your profile" accessibilityRole="progressbar">
      <Skeleton width={PHOTO + 2 * RING} height={PHOTO + 2 * RING} radius={PHOTO / 2 + RING} />
      <View style={[styles.names, { gap: space.xs }]}>
        <Skeleton width={160} height={22} radius={11} />
        <Skeleton width={110} height={14} radius={7} />
      </View>
      <Skeleton height={52} radius={radius.pill} style={styles.edit} />
    </WashCard>
  );
}

const styles = themedStyles(() => ({
  card: { alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  photo: { borderRadius: PHOTO / 2 + RING },
  // A soft frosted halo around the photo (a white veil in light mode, a light veil on the dark wash).
  ring: { padding: RING, borderRadius: PHOTO / 2 + RING, backgroundColor: palette.frostStrong, borderWidth: 1, borderColor: palette.glassLine },
  busy: {
    position: 'absolute',
    top: RING + 1,
    left: RING + 1,
    width: PHOTO,
    height: PHOTO,
    borderRadius: PHOTO / 2,
    backgroundColor: palette.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The brand camera badge, cut out of the photo by a ring of the card colour.
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: palette.primary,
    borderWidth: 3,
    borderColor: palette.canvasTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: { alignSelf: 'stretch', alignItems: 'center', gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.xs, alignSelf: 'stretch' },
  chip: {
    maxWidth: '100%',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.frostStrong,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
  chipText: { fontFamily: font.medium },
  edit: { alignSelf: 'stretch' },
}));
