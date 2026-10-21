// Up to five photos for a room or a shooting location: square thumbnails in a horizontal row, each with
// a round remove button, then an "Add photo" tile while there is room. Photos are 900 px JPEG data URLs
// (features/itdesk/photos). Nothing here is saved until the form is.

import { ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';

import { MAX_PHOTOS, PhotoError, pickFacilityPhoto } from '@/features/itdesk/photos';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Text, toast } from '@/ui';

const SIZE = 96;

export function PhotoStrip({ photos, onChange, loading }: { photos: string[]; onChange: (next: string[]) => void; loading?: boolean }) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const url = await pickFacilityPhoto();
      if (url) onChange([...photos, url].slice(0, MAX_PHOTOS));
    } catch (e) {
      toast.show(e instanceof PhotoError ? e.message : 'That photo could not be added.', 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {loading ? (
          <View style={[styles.tile, styles.empty]}>
            <ActivityIndicator color={palette.textMuted} />
          </View>
        ) : (
          photos.map((uri, i) => (
            <View key={`${i}-${uri.length}`} style={styles.tile}>
              <Image source={{ uri }} style={styles.img} accessibilityLabel={`Photo ${i + 1}`} />
              <Pressable
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                hitSlop={10}
                style={styles.remove}>
                <X size={14} color={palette.onAccent} strokeWidth={2.4} />
              </Pressable>
            </View>
          ))
        )}
        {!loading && photos.length < MAX_PHOTOS ? (
          <Pressable onPress={() => void add()} disabled={busy} accessibilityRole="button" accessibilityLabel="Add a photo" style={({ pressed }) => [styles.tile, styles.empty, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color={palette.textMuted} /> : <ImagePlus size={24} color={palette.textMuted} strokeWidth={1.6} />}
            <Text variant="caption" muted numberOfLines={1}>
              Add photo
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <Text variant="caption" muted>
        {photos.length}/{MAX_PHOTOS} photos · shrunk to 900 px before saving
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: space.xs },
  row: { gap: space.xs, paddingVertical: space.xxs },
  tile: { width: SIZE, height: SIZE, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  img: { width: '100%', height: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: space.xxs, borderWidth: 1, borderColor: palette.hairline, borderStyle: 'dashed' },
  pressed: { backgroundColor: palette.pressedTint },
  remove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: palette.overlay, alignItems: 'center', justifyContent: 'center' },
}));
