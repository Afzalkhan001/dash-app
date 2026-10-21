// The visitor's check-in selfie (web: VisitPhoto). photoUrl is a signed Storage URL that the server
// re-signs on every poll, so the image is cached by visit id rather than by URL — otherwise every
// 30-second refresh would download it again. After the retention period the photo is purged and a
// "photo removed" mark is shown instead, as on the web.

import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Visit } from '@/api/visitors';
import { initials } from '@/features/visitors/format';
import { palette } from '@/theme/tokens';
import { avatarTone, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
export function VisitPhoto({ visit, size = 40 }: { visit: Pick<Visit, 'id' | 'photoUrl' | 'photoPurged' | 'visitorName'>; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: Math.round(size / 3.2) };
  const name = visit.visitorName || 'visitor';
  if (visit.photoUrl && !failed) {
    return (
      <Image
        source={{ uri: visit.photoUrl, cacheKey: `visit-photo-${visit.id}` }}
        recyclingKey={visit.id}
        style={[box, styles.fill]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={160}
        onError={() => setFailed(true)}
        accessibilityLabel={`Photo of ${name}`}
      />
    );
  }
  if (visit.photoPurged) {
    // Big enough for a word under the icon (≥ 64): say it; otherwise the icon + label carry it.
    return (
      <View style={[box, styles.fill, styles.center]} accessible accessibilityLabel={`Photo of ${name} removed after the retention period`}>
        <ImageOff size={Math.round(size * 0.36)} color={palette.textMuted} strokeWidth={1.8} />
        {size >= 64 ? (
          <Text variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.1}>
            Removed
          </Text>
        ) : null}
      </View>
    );
  }
  const fontSize = Math.max(13, Math.round(size * 0.34));
  // Initials wear the same per-name colour as every Avatar.
  const tone = avatarTone(visit.visitorName);
  return (
    <View style={[box, styles.fill, styles.center, { backgroundColor: tone.bg }]} accessible accessibilityLabel={name}>
      <Text variant="labelStrong" color={tone.fg} maxFontSizeMultiplier={1} style={{ fontSize, lineHeight: Math.round(fontSize * 1.25) }}>
        {initials(visit.visitorName)}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  fill: { backgroundColor: palette.surfaceSunken, flexShrink: 0 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2 },
}));
