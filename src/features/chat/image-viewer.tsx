// A photo from a chat, full screen on a dark backdrop (website: the click-to-zoom overlay in
// MeetsInlineMedia, dash.html:7035). Close with the × or the back button. "Share" downloads the file
// and opens the share sheet.

import { Image } from 'expo-image';
import { Share2, X } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MeetsMessage } from '@/api/chat';
import { imageSource } from '@/features/chat/bubble';
import { stampLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { isDarkScheme, Text } from '@/ui';

export function ImageViewer({ m, today, onClose, onShare }: { m: MeetsMessage | null; today: string; onClose: () => void; onShare: (m: MeetsMessage) => void }) {
  const insets = useSafeAreaInsets();
  const src = m ? imageSource(m) : null;
  return (
    <Modal visible={!!m} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {src ? <Image source={src} cachePolicy="memory" contentFit="contain" style={styles.image} accessibilityLabel={m?.attachment?.name ?? 'Photo'} /> : null}
        <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.round}>
            <X size={22} color={palette.onPrimary} strokeWidth={1.8} />
          </Pressable>
          <View style={styles.titleCol}>
            <Text variant="labelStrong" color={palette.onPrimary} numberOfLines={1}>
              {m?.senderName ?? ''}
            </Text>
            <Text variant="caption" color={palette.onPrimaryMuted} numberOfLines={1}>
              {m ? stampLabel(m.createdAt, today) : ''}
            </Text>
          </View>
          <Pressable onPress={() => m && onShare(m)} accessibilityRole="button" accessibilityLabel="Share photo" hitSlop={8} style={styles.round}>
            <Share2 size={20} color={palette.onPrimary} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  // Always dark: the ink colour in light mode, the canvas in dark mode.
  root: { flex: 1, backgroundColor: isDarkScheme() ? palette.canvas : palette.ink, justifyContent: 'center' },
  image: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm },
  titleCol: { flex: 1, minWidth: 0, alignItems: 'center' },
  round: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: palette.frostOnDark, alignItems: 'center', justifyContent: 'center' },
}));
