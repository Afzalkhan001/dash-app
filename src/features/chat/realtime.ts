// The one live Meets stream for the whole app (website: MeetsCallWatcher's EventSource, dash.html:8626,
// re-published on meetsBus, :7329). React Native has no EventSource, so this reads the SSE body with
// expo/fetch streaming (in Expo Go; spec §5.1):
//   1. POST /meets/stream-ticket  → { ticket } (single use, 30 s; 20 a minute)
//   2. GET  /meets/stream?ticket= → `event: <name>\ndata: <json>\n\n` frames, `ready` first, `: ping` every 25 s
//   3. on error / end: wait 5 s and start again with a NEW ticket (15 s when the ticket itself failed)
// The watcher (meets-watcher.tsx) stops it when the app goes to the background and starts it again on
// return; events missed meanwhile are not replayed, so every `ready` refetches (see the watcher).
//
// Demo: the demo account never talks to DASH (the ticket request answers { error: 'demo' }), so the
// stream listens to the demo fixtures' emitter instead (demo/fixtures/chat.ts chatDemoEvents).

import { fetch as expoFetch } from 'expo/fetch';

import { chatApi } from '@/api/chat';
import { isApiError, isDemoSession } from '@/api/client';
import { API_URL } from '@/config';
import { chatDemoEvents } from '@/demo/fixtures/chat';

export type ChatEventName =
  | 'ready'
  | 'message'
  | 'message-deleted'
  | 'conversation'
  | 'members'
  | 'read'
  | 'meeting'
  | 'meeting-started'
  | 'meeting-ended'
  | (string & {});

export type ChatEvent = { name: ChatEventName; data: any };
type Listener = (e: ChatEvent) => void;

const listeners = new Set<Listener>();

/** The app-wide Meets bus (like the website's meetsBus). */
export const chatBus = {
  /** The conversation on screen right now: no notice and no unread bump for it (meetsBus.viewing). */
  viewing: null as string | null,
  /** True while a call screen is open (calls domain): message notices stay silent. */
  callLive: false,
  /** True while the stream is connected (otherwise the unread badge polls every minute). */
  live: false,
  on(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  emit(name: ChatEventName, data: unknown) {
    for (const fn of [...listeners]) {
      try {
        fn({ name, data });
      } catch (e) {
        if (__DEV__) console.warn('[chat] listener failed', name, e);
      }
    }
  },
};

// ── SSE parsing ──────────────────────────────────────────────────────────────
/** Parses complete frames out of `buf`; returns what is left (an incomplete frame). */
export function parseFrames(buf: string, onEvent: (name: string, data: string) => void): string {
  const text = buf.replace(/\r\n/g, '\n');
  let rest = text;
  let cut = rest.indexOf('\n\n');
  while (cut !== -1) {
    const frame = rest.slice(0, cut);
    rest = rest.slice(cut + 2);
    let name = 'message';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue; // comment / ping
      const i = line.indexOf(':');
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') name = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length || name !== 'message') onEvent(name, data.join('\n'));
    cut = rest.indexOf('\n\n');
  }
  return rest;
}

// UTF-8 bytes → text across chunk boundaries. TextDecoder is in Expo's runtime; the fallback keeps an
// incomplete trailing sequence for the next chunk.
function makeDecoder() {
  const TD = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (TD) {
    const d = new TD('utf-8');
    return (bytes: Uint8Array) => d.decode(bytes, { stream: true });
  }
  let carry: number[] = [];
  return (bytes: Uint8Array) => {
    const b = carry.length ? Uint8Array.from([...carry, ...bytes]) : bytes;
    carry = [];
    let out = '';
    let i = 0;
    while (i < b.length) {
      const c = b[i]!;
      const need = c < 0x80 ? 1 : c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
      if (i + need > b.length) {
        carry = Array.from(b.slice(i));
        break;
      }
      let cp = need === 1 ? c : c & (0xff >> (need + 1));
      for (let k = 1; k < need; k++) cp = (cp << 6) | (b[i + k]! & 0x3f);
      out += String.fromCodePoint(cp);
      i += need;
    }
    return out;
  };
}

// ── The connection ───────────────────────────────────────────────────────────
type Run = { stopped: boolean; abort: AbortController | null; unsubDemo: (() => void) | null };
let run: Run | null = null;

const wait = (ms: number, r: Run) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    const poll = setInterval(() => {
      if (r.stopped) {
        clearTimeout(t);
        clearInterval(poll);
        resolve();
      }
    }, 250);
    setTimeout(() => clearInterval(poll), ms + 10);
  });

function setLive(v: boolean) {
  chatBus.live = v;
}

async function loop(r: Run) {
  while (!r.stopped) {
    if (isDemoSession()) {
      // The demo answers on the phone: its emitter is the stream.
      r.unsubDemo = chatDemoEvents.on((name, data) => chatBus.emit(name, data));
      setLive(true);
      chatBus.emit('ready', {});
      return;
    }
    const t = await chatApi.streamTicket();
    if (r.stopped) return;
    if (isApiError(t) || !t?.ticket) {
      await wait(15_000, r);
      continue;
    }
    const abort = new AbortController();
    r.abort = abort;
    try {
      const res = await expoFetch(`${API_URL}/meets/stream?ticket=${encodeURIComponent(t.ticket)}`, {
        headers: { Accept: 'text/event-stream' },
        signal: abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      const reader = res.body.getReader();
      const decode = makeDecoder();
      let buf = '';
      setLive(true);
      for (;;) {
        const { value, done } = await reader.read();
        if (done || r.stopped) break;
        if (value) buf = parseFrames(buf + decode(value), (name, raw) => {
          let data: unknown = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = {};
          }
          chatBus.emit(name, data);
        });
      }
    } catch {
      // Dropped (network change, server restart, abort): reconnect below.
    } finally {
      r.abort = null;
      setLive(false);
    }
    if (r.stopped) return;
    await wait(5_000, r);
  }
}

/** Opens the stream (no-op while one is running). */
export function startChatStream() {
  if (run && !run.stopped) return;
  const r: Run = { stopped: false, abort: null, unsubDemo: null };
  run = r;
  void loop(r);
}

/** Closes the stream (app in the background, sign-out, chat off). */
export function stopChatStream() {
  const r = run;
  run = null;
  if (!r) return;
  r.stopped = true;
  try {
    r.abort?.abort();
  } catch {
    // already closed
  }
  r.unsubDemo?.();
  setLive(false);
}
