// Voice notes this phone recorded and sent, by message id → the local file (or blob URL on the web).
// Playing my own note back then needs no download. It is also how the demo account can play a note:
// the demo server cannot serve audio bytes, but the clip I just recorded is still on the phone.
// Module state, not React state: it lives for the app session only (files sit in the cache).

const clips = new Map<string, string>();

/** True while the composer's recorder holds the microphone (playback would reset the audio session). */
export const recording = { live: false };

export function rememberClip(messageId: string, uri: string) {
  if (messageId && uri) clips.set(messageId, uri);
}

export function localClip(messageId: string): string | null {
  return clips.get(messageId) ?? null;
}

/** 'Voice message (0:42).m4a' — the website's name, so the length can be read back from it. */
export function voiceName(seconds: number, ext: 'm4a' | 'webm') {
  const s = Math.max(1, Math.round(seconds));
  return `Voice message (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}).${ext}`;
}

/** m:ss for a timer. */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** '0:42' → 42 (the length in the file name). */
export function secondsOf(label: string | null | undefined) {
  const m = /^(\d+):(\d{2})$/.exec(String(label || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Recording limits (website: 2 minutes; server: 3 MB of audio). */
export const MAX_VOICE_SECONDS = 120;
