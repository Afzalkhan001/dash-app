// Record a voice note in the composer (website: dash.html:9996–10050).
//   Recording  starts as soon as this mounts (the composer's mic opened it): a red dot, the timer,
//              Discard and Stop. It stops by itself at 2 minutes, like the website.
//   Staged     the clip waits with Play, Discard and Send. Nothing uploads until Send.
// Phones record AAC in .m4a (sent as audio/mp4, which passes the server's ftyp byte check); the web
// build records WebM (audio/webm). The name is the website's: "Voice message (m:ss).m4a|webm".
// Limits: 2 minutes, and the server's 3 MB for audio (checked here, and again on the server).

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Pause, Play, SendHorizontal, Square, Trash2 } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { useInCall } from '@/features/calls/call-store';
import { sizeLabel } from '@/features/chat/format';
import { clock, MAX_VOICE_SECONDS, recording, voiceName } from '@/features/chatvoice/clips';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { haptic, Text, toast } from '@/ui';

export type VoiceClip = { name: string; type: string; size: number; dataUrl: string; localUri: string; seconds: number };

async function readClip(uri: string): Promise<{ dataUrl: string; size: number; type: string }> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read'));
      r.readAsDataURL(blob);
    });
    const type = /webm/i.test(blob.type) ? 'audio/webm' : 'audio/mp4';
    return { dataUrl: dataUrl.replace(/^data:[^;,]*/, `data:${type}`), size: blob.size, type };
  }
  const f = new File(uri);
  const b64 = await f.base64();
  return { dataUrl: `data:audio/mp4;base64,${b64}`, size: f.size || Math.round((b64.length * 3) / 4), type: 'audio/mp4' };
}

async function releaseMic() {
  // iOS keeps playback on the earpiece while recording is allowed.
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
}

export function VoiceRecorder({
  maxBytes,
  sending,
  onDone,
  onSend,
}: {
  maxBytes: number;
  sending: boolean;
  /** Close the recorder (discarded, failed or sent). */
  onDone: () => void;
  onSend: (clip: VoiceClip) => Promise<boolean>;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'starting' | 'recording' | 'reading' | 'staged'>('starting');
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const player = useAudioPlayer(clip?.localUri ?? null, { updateInterval: 250 });
  const ps = useAudioPlayerStatus(player);
  const stopping = useRef(false);
  const live = useRef(false);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  // Start on mount: permission, then the audio session, then record.
  useEffect(() => {
    let gone = false;
    let cap: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const perm = await requestRecordingPermissionsAsync().catch(() => null);
      if (gone) return;
      if (!perm?.granted) {
        toast.show(
          Platform.OS === 'web' ? 'Allow the microphone for this site to record a voice message.' : 'Microphone permission is needed. Allow it in Settings and try again.',
          'danger',
        );
        onDone();
        return;
      }
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (gone) return;
        recorder.record();
        live.current = true;
        recording.live = true;
        // The website's 2-minute cap.
        cap = setTimeout(() => {
          if (!live.current) return;
          toast.show('Voice messages stop at 2 minutes.', 'info');
          void stopRef.current?.();
        }, MAX_VOICE_SECONDS * 1000);
        haptic.impact();
        setPhase('recording');
      } catch {
        if (gone) return;
        toast.show('Recording could not start on this device. Try again.', 'danger');
        await releaseMic();
        onDone();
      }
    })();
    return () => {
      gone = true;
      if (cap) clearTimeout(cap);
      recording.live = false;
      if (live.current) {
        live.current = false;
        void recorder.stop().catch(() => {});
      }
      void releaseMic();
    };
    // Runs once per mount: the recorder object is stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seconds = (rec.durationMillis || 0) / 1000;

  const stop = async () => {
    if (stopping.current || !live.current) return;
    stopping.current = true;
    setPhase('reading');
    try {
      const elapsed = (recorder.getStatus().durationMillis || 0) / 1000;
      await recorder.stop();
      live.current = false;
      recording.live = false;
      await releaseMic();
      const uri = recorder.uri;
      if (!uri) throw new Error('no file');
      // The website drops a take under a second (an accidental tap).
      if ((elapsed || seconds) < 1) {
        toast.show('That was too short to send. Hold on a little longer.', 'info');
        onDone();
        return;
      }
      const len = Math.max(1, Math.min(MAX_VOICE_SECONDS, Math.round(elapsed || seconds)));
      const out = await readClip(uri);
      if (out.size > maxBytes) {
        toast.show(`That voice message is ${sizeLabel(out.size)}. The limit is ${sizeLabel(maxBytes)}. Record a shorter one.`, 'danger');
        onDone();
        return;
      }
      setClip({ name: voiceName(len, out.type === 'audio/webm' ? 'webm' : 'm4a'), type: out.type, size: out.size, dataUrl: out.dataUrl, localUri: uri, seconds: len });
      setPhase('staged');
    } catch {
      toast.show('That recording could not be saved. Try again.', 'danger');
      onDone();
    } finally {
      stopping.current = false;
    }
  };

  useEffect(() => {
    stopRef.current = stop;
  });

  // A call needs the microphone: a take in progress stops (and is kept to send), like the website.
  const inCall = useInCall();
  useEffect(() => {
    if (inCall && live.current) void stopRef.current?.();
  }, [inCall]);

  const discard = () => {
    player.pause();
    onDone();
  };

  const send = async () => {
    if (!clip || sending) return;
    player.pause();
    const ok = await onSend(clip);
    if (ok) onDone();
  };

  const previewEnded = ps.duration > 0 && ps.currentTime >= ps.duration - 0.2 && !ps.playing;
  const togglePreview = () => {
    if (ps.playing) {
      player.pause();
      return;
    }
    if (previewEnded) void player.seekTo(0).then(() => player.play());
    else player.play();
  };

  if (phase === 'staged' && clip) {
    const pos = Math.min(ps.currentTime || 0, clip.seconds);
    const ratio = clip.seconds > 0 ? Math.min(1, pos / clip.seconds) : 0;
    return (
      <View style={styles.row}>
        <Round label="Discard the voice message" onPress={discard} disabled={sending} tone="plain">
          <Trash2 size={20} color={palette.dangerInk} strokeWidth={1.9} />
        </Round>
        <View style={styles.stage} accessibilityLabel={`Voice message, ${clock(clip.seconds)}, ${sizeLabel(clip.size)}. Not sent yet`}>
          <Pressable onPress={togglePreview} accessibilityRole="button" accessibilityLabel={ps.playing ? 'Pause' : 'Play it back'} hitSlop={6} style={styles.play}>
            {ps.playing ? <Pause size={16} color={palette.onPrimary} fill={palette.onPrimary} /> : <Play size={16} color={palette.onPrimary} fill={palette.onPrimary} />}
          </Pressable>
          <View style={styles.stageBody}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
            </View>
            <Text variant="caption" muted numberOfLines={1}>
              {ps.playing || pos > 0 ? `${clock(pos)} / ${clock(clip.seconds)}` : `${clock(clip.seconds)} · ${sizeLabel(clip.size)} · not sent yet`}
            </Text>
          </View>
        </View>
        <Round label="Send the voice message" onPress={send} disabled={sending} tone="send" busy={sending}>
          <SendHorizontal size={20} color={palette.onPrimary} strokeWidth={1.9} />
        </Round>
      </View>
    );
  }

  const busy = phase !== 'recording';
  return (
    <View style={styles.row}>
      <Round label="Discard the recording" onPress={discard} disabled={phase === 'reading'} tone="plain">
        <Trash2 size={20} color={palette.dangerInk} strokeWidth={1.9} />
      </Round>
      <View style={styles.stage} accessibilityLiveRegion="polite" accessibilityLabel={busy ? 'Starting the microphone' : `Recording, ${clock(seconds)}`}>
        <View style={[styles.dot, busy && styles.dotIdle]} />
        <Text variant="labelStrong" style={styles.timer}>
          {clock(seconds)}
        </Text>
        <Text variant="caption" muted numberOfLines={1} style={styles.flex}>
          {phase === 'starting' ? 'Starting the microphone…' : phase === 'reading' ? 'Saving…' : `Recording · up to ${clock(MAX_VOICE_SECONDS)}`}
        </Text>
      </View>
      <Round label="Stop recording" onPress={() => void stop()} disabled={busy} tone="stop" busy={phase === 'reading'}>
        <Square size={16} color={palette.onPrimary} fill={palette.onPrimary} />
      </Round>
    </View>
  );
}

function Round({
  label,
  onPress,
  disabled,
  tone,
  busy,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone: 'plain' | 'send' | 'stop';
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [styles.round, tone === 'plain' ? styles.plain : tone === 'send' ? styles.send : styles.stop, disabled && styles.dim, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={tone === 'plain' ? palette.primaryText : palette.onPrimary} /> : children}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  round: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  plain: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.glassLine },
  send: { backgroundColor: palette.charcoal },
  stop: { backgroundColor: palette.danger },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  stage: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.danger },
  dotIdle: { opacity: 0.35 },
  timer: { fontVariant: ['tabular-nums'] },
  flex: { flex: 1, minWidth: 0 },
  play: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  stageBody: { flex: 1, minWidth: 0, gap: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: palette.glassLine, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: palette.primary },
}));
