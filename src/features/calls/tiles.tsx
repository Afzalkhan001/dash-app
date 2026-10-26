// Call tiles on the deep call surface (website MeetsPeerTile, dash.html:8019).
//   - Video: react-native-webrtc's RTCView in an installed app; a <video> element in the web build.
//   - Audio: native WebRTC plays remote audio by itself; the web build gives every peer its OWN hidden
//     <audio> element, never tied to the video, because hearing someone must never depend on seeing
//     them (dash.html:7990).
//   - No video (camera off, which is the default, or the demo): a big initials avatar.
// Status line: "Connecting…", the route ("same network · 18ms"), "No route", and a muted mark.

import { MicOff, Video, WifiOff } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import type { PeerView } from '@/features/calls/engine';
import { loadRtc } from '@/features/calls/rtc';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Avatar, Text } from '@/ui';

type AnyStream = { toURL?: () => string } | null | undefined;

/**
 * Draws a media stream. Null (nothing drawn) when this build has no way to show video.
 * `overlay`: Android draws every RTCView on its own surface, and two at the same depth hide each
 * other — my small preview sits ON the big remote video, so it must be drawn one level above it
 * (zOrder 1, SurfaceView media overlay). Without it the preview stays blank.
 */
export function StreamView({ stream, mirror, audioOnly, muted, overlay }: { stream: unknown; mirror?: boolean; audioOnly?: boolean; muted?: boolean; overlay?: boolean }) {
  if (!stream) return null;
  if (Platform.OS === 'web') return <WebMedia stream={stream} mirror={mirror} audioOnly={audioOnly} muted={muted} />;
  if (audioOnly) return null; // native WebRTC plays remote audio on its own
  const RTCView = loadRtc()?.RTCView;
  const url = (stream as AnyStream)?.toURL?.();
  if (!RTCView || !url) return null;
  return <RTCView streamURL={url} objectFit="cover" mirror={!!mirror} zOrder={overlay ? 1 : 0} style={StyleSheet.absoluteFill} />;
}

// The web build: a real <video>/<audio> element inside the tile's host <div> (react-native-web Views
// are DOM elements). Created once per stream, so playback never restarts on a re-render.
function WebMedia({ stream, mirror, audioOnly, muted }: { stream: unknown; mirror?: boolean; audioOnly?: boolean; muted?: boolean }) {
  const host = useRef<View>(null);
  useEffect(() => {
    const node = host.current as unknown as { appendChild?: (n: unknown) => void } | null;
    const doc = (globalThis as { document?: { createElement: (t: string) => any } }).document;
    if (!node?.appendChild || !doc || !stream) return;
    const el = doc.createElement(audioOnly ? 'audio' : 'video');
    el.autoplay = true;
    el.playsInline = true;
    el.muted = !!muted;
    el.srcObject = stream;
    if (!audioOnly) {
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.objectFit = 'cover';
      if (mirror) el.style.transform = 'scaleX(-1)';
    }
    node.appendChild(el);
    void el.play?.()?.catch?.(() => {});
    return () => {
      try {
        el.srcObject = null;
        el.remove();
      } catch {
        // already gone
      }
    };
  }, [stream, mirror, audioOnly, muted]);
  return <View ref={host} pointerEvents="none" style={audioOnly ? styles.hiddenAudio : StyleSheet.absoluteFill} />;
}

function statusOf(p: PeerView, dead: boolean, demo: boolean) {
  if (dead || p.conn === 'failed') return 'No route';
  if (p.conn === 'connected') return p.route || (demo ? 'Demo · no sound sent' : 'Live');
  if (p.conn === 'disconnected') return 'Reconnecting…';
  return 'Connecting…';
}

export function PeerTile({ peer, dead, demo, big }: { peer: PeerView; dead: boolean; demo: boolean; big?: boolean }) {
  const showVideo = !!peer.camStream && (peer.camLive || peer.state.cam);
  const status = statusOf(peer, dead, demo);
  const bad = status === 'No route';
  return (
    <View
      style={[styles.tile, big ? styles.tileBig : styles.tileSmall]}
      accessible
      accessibilityLabel={`${peer.name}. ${status}${peer.state.mic ? '' : '. Muted'}`}>
      {showVideo ? <StreamView stream={peer.camStream} /> : null}
      {/* Audio has its own element and is never conditional. */}
      <StreamView stream={peer.audioStream} audioOnly />
      {!showVideo ? (
        <View style={styles.face}>
          <Avatar name={peer.name} size={big ? 96 : 64} ring={false} />
          {!big ? null : (
            <Text variant="heading" color={palette.onPrimary} align="center" numberOfLines={1}>
              {peer.name}
            </Text>
          )}
          {peer.state.cam && !showVideo ? (
            <View style={styles.inline}>
              <Video size={14} color={palette.onPrimaryMuted} strokeWidth={1.8} />
              <Text variant="caption" color={palette.onPrimaryMuted}>
                {demo ? 'Camera on · not in the demo' : 'Camera starting…'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.caption}>
        {!peer.state.mic ? <MicOff size={14} color={palette.onPrimary} strokeWidth={2} /> : null}
        {bad ? <WifiOff size={14} color={palette.onPrimary} strokeWidth={2} /> : null}
        <View style={styles.captionText}>
          {big && !showVideo ? null : (
            <Text variant="labelStrong" color={palette.onPrimary} numberOfLines={1}>
              {peer.name}
            </Text>
          )}
          <Text variant="caption" color={palette.onPrimaryMuted} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** My own small preview (camera on) or a "You" chip. */
export function SelfTile({ stream, cam, mic, name, demo, compact }: { stream: unknown; cam: boolean; mic: boolean; name: string; demo: boolean; compact?: boolean }) {
  return (
    <View style={[styles.tile, compact ? styles.selfCompact : styles.tileSmall]} accessible accessibilityLabel={`You${mic ? '' : ', muted'}${cam ? ', camera on' : ''}`}>
      {cam && stream ? <StreamView stream={stream} mirror muted overlay /> : null}
      {!(cam && stream) ? (
        <View style={styles.face}>
          <Avatar name={name} size={compact ? 40 : 64} ring={false} />
          {cam && demo ? (
            <Text variant="caption" color={palette.onPrimaryMuted} align="center" numberOfLines={2}>
              Camera on · not in the demo
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.caption}>
        {!mic ? <MicOff size={14} color={palette.onPrimary} strokeWidth={2} /> : null}
        <Text variant="labelStrong" color={palette.onPrimary} numberOfLines={1}>
          You
        </Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  tile: {
    overflow: 'hidden',
    borderRadius: radius.xl,
    backgroundColor: palette.frostOnDark,
    borderWidth: 1,
    borderColor: palette.frostEdgeOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBig: { flex: 1, minHeight: 240 },
  tileSmall: { flex: 1, minHeight: 160, aspectRatio: 0.82 },
  selfCompact: { width: 96, height: 128, borderRadius: radius.lg },
  face: { alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  caption: {
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    bottom: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
    borderRadius: radius.sm,
    backgroundColor: palette.overlay,
  },
  captionText: { flex: 1, minWidth: 0 },
  hiddenAudio: { position: 'absolute', width: 1, height: 1, opacity: 0 },
}));
