// A video announcement, played right in the post (expo-video, in Expo Go for SDK 57). The video is a
// data URL from GET /announcements/<id>/media (annMediaCache), so nothing loads until "Play video" is
// tapped — a video can be large. On a phone it is written to the cache folder first (the native player
// wants a file); on the web the data URL plays as it is. Native controls, full screen and picture in
// picture come from the system player. The frame is black in both themes, like every video player.

import { useVideoPlayer, VideoView } from 'expo-video';
import { Play, RotateCw } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { type Announcement, annMediaCache } from '@/api/announcements';
import { FileError, saveDataUrl } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { radius, space } from '@/theme/tokens';
import { haptic, Text } from '@/ui';

// Player chrome colours: fixed, not themed (the frame is always dark).
const BLACK = '#000000';
const WHITE = '#FFFFFF';

type State = { phase: 'idle' } | { phase: 'loading' } | { phase: 'ready'; uri: string } | { phase: 'error'; message: string };

function extOf(dataUrl: string) {
  const mime = /^data:video\/([a-z0-9.+-]+)/i.exec(dataUrl)?.[1]?.toLowerCase() ?? 'mp4';
  return mime === 'quicktime' ? 'mov' : mime === 'x-matroska' ? 'mkv' : mime.replace(/[^a-z0-9]/g, '') || 'mp4';
}

export function AnnouncementVideo({ ann }: { ann: Announcement }) {
  const [state, setState] = useState<State>({ phase: 'idle' });

  const load = async () => {
    if (state.phase === 'loading') return;
    haptic.select();
    setState({ phase: 'loading' });
    try {
      const dataUrl = await annMediaCache.load(ann.id);
      if (!dataUrl) throw new FileError('This post has no video attached.');
      if (!/^data:video\//i.test(dataUrl)) throw new FileError('This video can’t be played here. Save it to your phone instead.');
      const uri = Platform.OS === 'web' ? dataUrl : await saveDataUrl(dataUrl, `announcement-${ann.id}.${extOf(dataUrl)}`);
      setState({ phase: 'ready', uri });
    } catch (e) {
      haptic.error();
      setState({ phase: 'error', message: e instanceof FileError ? e.message : 'The video could not be loaded. Try again.' });
    }
  };

  if (state.phase === 'ready') return <Player uri={state.uri} title={ann.title} />;

  const label = state.phase === 'error' ? 'Try the video again' : 'Play video';
  return (
    <Pressable
      onPress={() => void load()}
      disabled={state.phase === 'loading'}
      accessibilityRole="button"
      accessibilityLabel={ann.title ? `${label}: ${ann.title}` : label}
      accessibilityState={{ busy: state.phase === 'loading' }}
      style={({ pressed }) => [styles.frame, pressed && styles.pressed]}>
      <View style={styles.center}>
        <View style={styles.playDisc}>
          {state.phase === 'loading' ? (
            <ActivityIndicator color={BLACK} />
          ) : state.phase === 'error' ? (
            <RotateCw size={26} color={BLACK} strokeWidth={2} />
          ) : (
            <Play size={28} color={BLACK} fill={BLACK} strokeWidth={1.6} style={styles.playNudge} />
          )}
        </View>
        <Text variant="labelStrong" align="center" style={styles.white} accessibilityLiveRegion="polite">
          {state.phase === 'loading' ? 'Loading the video…' : state.phase === 'error' ? state.message : 'Play video'}
        </Text>
      </View>
    </Pressable>
  );
}

function Player({ uri, title }: { uri: string; title?: string | null }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <View style={styles.frame}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        accessibilityLabel={title ? `Video: ${title}` : 'Video'}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: BLACK },
  pressed: { opacity: 0.85 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  playDisc: { width: 64, height: 64, borderRadius: 32, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  playNudge: { marginLeft: 3 },
  white: { color: WHITE },
  video: { width: '100%', height: '100%' },
}));
