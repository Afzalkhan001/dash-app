// Voice-note playback in a thread: ONE shared expo-audio player for the whole thread (VoiceProvider),
// and a play/pause pill in each voice bubble (VoicePill). Starting a note stops the one before.
//
// Source, in order:
//   1. a clip this phone recorded and sent (features/chatvoice/clips.ts) — plays offline, and in demo;
//   2. the attachment route with the Bearer header (GET …/attachment?inline=1; the server sends audio
//      inline). The demo server has no bytes, so the demo says so instead.
// iOS cannot play WebM/Opus (recorded in Chrome on the website, spec R8): the pill says
// "Open on the website" and tapping shares the file instead.

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play, Share2 } from 'lucide-react-native';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { attachmentUrl, type MeetsMessage } from '@/api/chat';
import { authHeaders, isDemoSession } from '@/api/client';
import { voiceDuration } from '@/features/chat/format';
import { clock, localClip, recording, secondsOf } from '@/features/chatvoice/clips';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Text, toast } from '@/ui';

type Voice = {
  activeId: string | null;
  playing: boolean;
  position: number;
  duration: number;
  toggle: (m: MeetsMessage) => void;
};

const VoiceContext = createContext<Voice | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [activeId, setActiveId] = useState<string | null>(null);
  const err = activeId ? status.error : null;

  // A load error is reported once per error (a side effect, so not during render).
  useEffect(() => {
    if (err) toast.show('That voice message could not be played. Try again.', 'danger');
  }, [err]);

  const finished = !!activeId && (status.didJustFinish || (!status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.2));
  const toggle = (m: MeetsMessage) => {
    if (recording.live) {
      toast.show('Stop recording first, then play the voice message.', 'info');
      return;
    }
    if (activeId === m.id && !finished) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    const local = localClip(m.id);
    if (!local && isDemoSession()) {
      toast.show('Voice messages from others can’t play in the demo account. Record one and play it back.', 'info');
      return;
    }
    const source = local ? { uri: local } : { uri: attachmentUrl(m.conversationId, m.id, true), headers: authHeaders() };
    setActiveId(m.id);
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (activeId === m.id) {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    player.replace(source);
    player.play();
  };

  const value: Voice = {
    activeId,
    playing: !!activeId && status.playing && !finished,
    position: status.currentTime || 0,
    duration: status.duration || 0,
    toggle,
  };
  return <VoiceContext value={value}>{children}</VoiceContext>;
}

/** iOS has no WebM decoder: those notes are shared/opened instead of played. */
export const cannotPlayHere = (type: string | null | undefined) => Platform.OS === 'ios' && /webm/i.test(String(type || ''));

export function VoicePill({ m, mine, onShare, onLongPress }: { m: MeetsMessage; mine: boolean; onShare: (m: MeetsMessage) => void; onLongPress?: (m: MeetsMessage) => void }) {
  const v = use(VoiceContext);
  const a = m.attachment;
  const len = voiceDuration(a?.name);
  const total = secondsOf(len);
  const active = !!v && v.activeId === m.id;
  const playing = active && v.playing;
  const dur = active && v.duration > 0 ? v.duration : total;
  const pos = active ? Math.min(v.position, dur || v.position) : 0;
  const ratio = dur > 0 ? Math.min(1, pos / dur) : 0;
  const fg = mine ? palette.onPrimary : palette.text;
  const fgMuted = mine ? palette.onPrimaryMuted : palette.textMuted;
  const shareOnly = cannotPlayHere(a?.type) && !localClip(m.id);
  const Icon = shareOnly ? Share2 : playing ? Pause : Play;

  const press = () => {
    if (shareOnly || !v) onShare(m);
    else v.toggle(m);
  };

  const label = shareOnly ? 'Open on the website, or tap to share' : active ? `${clock(pos)} / ${clock(dur)}` : len ?? 'Voice message';
  return (
    <Pressable
      onPress={press}
      onLongPress={onLongPress ? () => onLongPress(m) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Voice message${len ? `, ${len}` : ''}`}
      accessibilityHint={shareOnly ? 'This phone cannot play it. Opens the share sheet' : playing ? 'Pauses it' : 'Plays it'}
      accessibilityState={{ selected: playing }}
      style={({ pressed }) => [styles.pill, mine ? styles.pillMine : styles.pillOther, pressed && styles.pressed]}>
      <View style={[styles.btn, mine ? styles.btnMine : styles.btnOther]}>
        <Icon size={18} color={mine ? palette.primary : palette.onPrimary} strokeWidth={2} fill={shareOnly ? 'transparent' : mine ? palette.primary : palette.onPrimary} />
      </View>
      <View style={styles.body}>
        <View style={[styles.track, mine ? styles.trackMine : styles.trackOther]}>
          <View style={[styles.fill, mine ? styles.fillMine : styles.fillOther, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
        <Text variant="caption" color={fgMuted} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="micro" color={fg} style={styles.tag}>
        Voice
      </Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, padding: space.xs, minWidth: 200, maxWidth: 260 },
  pillMine: { backgroundColor: palette.frostOnDark },
  pillOther: { backgroundColor: palette.surfaceMuted },
  pressed: { opacity: 0.8 },
  btn: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnMine: { backgroundColor: palette.onPrimary },
  btnOther: { backgroundColor: palette.primary },
  body: { flex: 1, minWidth: 0, gap: 6 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackMine: { backgroundColor: palette.frostEdgeOnDark },
  trackOther: { backgroundColor: palette.glassLine },
  fill: { height: 4, borderRadius: 2 },
  fillMine: { backgroundColor: palette.onPrimary },
  fillOther: { backgroundColor: palette.primary },
  tag: { opacity: 0.7 },
}));
