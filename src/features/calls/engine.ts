// The call itself: a peer-to-peer WebRTC mesh, ported from the website's MeetsCall (dash.html:7350–7942)
// so a phone and a browser can be in the same call. Outside React: the screen reads `state` through
// call-store.ts (useSyncExternalStore), so render stays pure.
//
// The protocol has to match the website exactly (spec §4.3), or calls connect and stay silent:
//   1. Microphone first, then POST /join, then one RTCPeerConnection per peer with
//      { iceServers: <from join>, bundlePolicy: 'max-bundle' }.
//   2. Who calls whom: callsFirst (earlier joinedAt, then the lower user id). The caller is impolite.
//   3. The caller creates three transceivers in this order: 0 audio, 1 camera, 2 screen. Camera on and
//      off is replaceTrack on slot 1 — never a renegotiation. Slot 2 is receive-only on the phone.
//   4. The answerer sets every transceiver to 'sendrecv' after reading the offer (dash.html:7446).
//   5. Signals: offer/answer {type, sdp}; ice candidate.toJSON(); state {mic, cam, screen}; bye.
//      ICE that arrives before the remote description is held, then added (dash.html:7570).
//   6. Perfect negotiation (dash.html:7575): an offer that collides is ignored by the impolite side and
//      accepted (implicit rollback) by the polite side.
//   7. A failed connection gets one retry forced through the relay (only when a TURN server is
//      configured; only the impolite side restarts ICE), then the red "No audio or video" bar.
//   8. Heartbeat every heartbeatSeconds, reconciling the peer list; leaving sends bye to everyone,
//      closes the connections, stops the tracks and posts /leave.
//
// DemoEngine plays the same screen with no media: the demo account never talks to DASH, so colleagues
// "answer" on timers and every host action still goes through the demo API (demo/fixtures/calls.ts).

import { type CallPerson, callsApi, CAMERA_CONSTRAINTS, type IceServer, type MediaState, type PeerCard, RING_SECONDS, type SignalKind } from '@/api/calls';
import type { ConversationResponse } from '@/api/chat';
import { apiFetch, isApiError } from '@/api/client';
import { callsFirst } from '@/features/calls/access';
import type { Rtc } from '@/features/calls/rtc';
import { chatBus } from '@/features/chat/realtime';

export type CallPhase = 'joining' | 'live' | 'ended' | 'error';

export type PeerView = {
  id: string;
  name: string;
  dept: string | null;
  joinedAt: string | null;
  /** RTCPeerConnection.connectionState ('new' until the first offer). */
  conn: string;
  /** What they say they are sending (the `state` courtesy signal). */
  state: MediaState;
  camLive: boolean;
  screenLive: boolean;
  camStream: unknown | null;
  screenStream: unknown | null;
  audioStream: unknown | null;
  /** "same network · 24ms" / "via relay · 90ms", from getStats every 3 s (dash.html:7376). */
  route: string;
};

export type CallState = {
  meetingId: string;
  demo: boolean;
  phase: CallPhase;
  error: string | null;
  title: string | null;
  conversationId: string | null;
  isHost: boolean;
  screenShareAllowed: boolean;
  maxParticipants: number;
  /** Rung but not here yet ("Ringing Priya…"). */
  expected: CallPerson[];
  self: PeerCard | null;
  peers: PeerView[];
  mic: boolean;
  cam: boolean;
  front: boolean;
  selfStream: unknown | null;
  /** Peers whose media never found a route (the red bar). */
  dead: string[];
  notice: string | null;
  /** When the call went live (epoch ms), for the timer. */
  liveAt: number | null;
};

export interface CallEngine {
  readonly meetingId: string;
  getState(): CallState;
  subscribe(fn: () => void): () => void;
  start(): void;
  /** Leaves the call (bye to everyone, /leave). */
  stop(): void;
  toggleMic(): void;
  toggleCam(): Promise<void>;
  flipCam(): void;
  dismissNotice(): void;
  // Host only (the server checks host_id too). Each resolves to an error message or null.
  invite(person: CallPerson): Promise<string | null>;
  setScreenShareAllowed(allowed: boolean): Promise<string | null>;
  remove(peerId: string): Promise<string | null>;
  endForEveryone(): Promise<string | null>;
}

const MEDIA_OFF: MediaState = { mic: true, cam: false, screen: false };

function initialState(meetingId: string, demo: boolean): CallState {
  return {
    meetingId,
    demo,
    phase: 'joining',
    error: null,
    title: null,
    conversationId: null,
    isHost: false,
    screenShareAllowed: true,
    maxParticipants: 8,
    expected: [],
    self: null,
    peers: [],
    mic: true,
    cam: false,
    front: true,
    selfStream: null,
    dead: [],
    notice: null,
    liveAt: null,
  };
}

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// ── Shared: the store and the host routes ────────────────────────────────────
abstract class BaseEngine implements CallEngine {
  protected state: CallState;
  protected alive = true;
  private listeners = new Set<() => void>();
  protected meta = new Map<string, PeerView>();

  constructor(
    readonly meetingId: string,
    demo: boolean,
  ) {
    this.state = initialState(meetingId, demo);
  }

  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  protected set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of [...this.listeners]) fn();
  }

  /** Publishes the peer map (a fresh array of copies, so React sees the change). */
  protected publish() {
    if (!this.alive) return;
    this.set({ peers: [...this.meta.values()].map((p) => ({ ...p })) });
  }

  protected patchPeer(id: string, fn: (p: PeerView) => Partial<PeerView>) {
    const cur = this.meta.get(id);
    if (!cur) return;
    this.meta.set(id, { ...cur, ...fn(cur) });
    this.publish();
  }

  protected remember(peer: PeerCard) {
    if (!peer?.id || peer.id === this.state.self?.id) return;
    if (!this.meta.has(peer.id)) {
      this.meta.set(peer.id, {
        id: peer.id,
        name: peer.name || 'Colleague',
        dept: peer.dept ?? null,
        joinedAt: peer.joinedAt ?? null,
        conn: 'new',
        state: { ...MEDIA_OFF },
        camLive: false,
        screenLive: false,
        camStream: null,
        screenStream: null,
        audioStream: null,
        route: '',
      });
    }
    // Someone who arrived is no longer "ringing".
    if (this.state.expected.some((x) => x.id === peer.id)) this.set({ expected: this.state.expected.filter((x) => x.id !== peer.id) });
    this.publish();
  }

  protected dropPeer(id: string) {
    this.meta.delete(id);
    this.set({ dead: this.state.dead.filter((x) => x !== id) });
    this.publish();
  }

  protected end(phase: 'ended' | 'error', message: string) {
    if (this.state.phase === 'ended' || this.state.phase === 'error') return;
    this.set({ phase, error: message });
    this.stop();
  }

  dismissNotice() {
    this.set({ notice: null });
  }

  abstract start(): void;
  abstract stop(): void;
  abstract toggleMic(): void;
  abstract toggleCam(): Promise<void>;
  abstract flipCam(): void;
  protected onShareAllowedChanged(_allowed: boolean) {}

  /** Pulls one more person in: they ring exactly as for a new call (dash.html:7764). */
  async invite(person: CallPerson) {
    const r = await callsApi.invite(this.meetingId, person.id);
    if (isApiError(r)) return r.error;
    const p = r?.invited?.id ? r.invited : person;
    this.set({ expected: [...this.state.expected.filter((x) => x.id !== p.id), p] });
    this.afterInvite(p);
    return null;
  }

  protected afterInvite(_p: CallPerson) {}

  async setScreenShareAllowed(allowed: boolean) {
    const r = await callsApi.setScreenShare(this.meetingId, allowed);
    if (isApiError(r)) return r.error;
    this.set({ screenShareAllowed: allowed });
    this.onShareAllowedChanged(allowed);
    return null;
  }

  async remove(peerId: string) {
    const r = await callsApi.remove(this.meetingId, peerId);
    if (isApiError(r)) return r.error;
    this.removedPeer(peerId);
    return null;
  }

  protected removedPeer(peerId: string) {
    this.dropPeer(peerId);
  }

  async endForEveryone() {
    const r = await callsApi.end(this.meetingId);
    if (isApiError(r)) return r.error;
    this.end('ended', 'You ended the call for everyone.');
    return null;
  }
}

// ── The real call (WebRTC) ───────────────────────────────────────────────────
type PcState = {
  pc: any;
  peer: PeerView;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pending: unknown[];
  relayTried: boolean;
};

export class LiveEngine extends BaseEngine {
  private pcs = new Map<string, PcState>();
  private local: { mic: any; cam: any } = { mic: null, cam: null };
  private ice: IceServer[] = [];
  private beat: ReturnType<typeof setInterval> | null = null;
  private stats: ReturnType<typeof setInterval> | null = null;
  private offBus: (() => void) | null = null;
  private left = false;

  constructor(
    meetingId: string,
    private rtc: Rtc,
  ) {
    super(meetingId, false);
  }

  private signal(to: string, kind: SignalKind, payload: unknown) {
    void callsApi.signal(this.meetingId, to, kind, payload);
  }

  /** Tells every peer what we are sending, so their screen shows an avatar instead of a frozen frame. */
  private announce(over?: Partial<MediaState>) {
    const s: MediaState = { mic: this.state.mic, cam: this.state.cam, screen: false, ...over };
    for (const id of this.pcs.keys()) this.signal(id, 'state', s);
  }

  /** Our microphone and camera into a connection's three slots; slot 2 (screen) stays empty on a phone. */
  private bindLocal(st: PcState) {
    const tx: any[] = st.pc.getTransceivers?.() ?? [];
    const want = [this.local.mic, this.local.cam, null];
    for (let i = 0; i < 3; i++) {
      const t = tx[i];
      if (!t) continue;
      try {
        // Not optional, and silent when forgotten: a transceiver created while reading an offer starts
        // 'recvonly', and the answer would say "I will not send you anything" (dash.html:7432).
        if (t.direction !== 'sendrecv') t.direction = 'sendrecv';
      } catch {
        // read-only on some builds; the offerer's sendrecv still stands
      }
      try {
        void t.sender?.replaceTrack?.(want[i] ?? null);
      } catch {
        // a slot that cannot take a track stays silent for that peer
      }
    }
  }

  private putInSlot(index: number, track: any) {
    for (const st of this.pcs.values()) {
      try {
        const tx = st.pc.getTransceivers?.()[index];
        if (!tx) continue;
        try {
          if (tx.direction !== 'sendrecv') tx.direction = 'sendrecv';
        } catch {
          // see bindLocal
        }
        void tx.sender?.replaceTrack?.(track ?? null);
      } catch {
        // see bindLocal
      }
    }
  }

  private closePc(id: string) {
    const st = this.pcs.get(id);
    if (st) {
      try {
        st.pc.close();
      } catch {
        // already closed
      }
      this.pcs.delete(id);
    }
  }

  protected override dropPeer(id: string) {
    this.closePc(id);
    super.dropPeer(id);
  }

  private desc(d: any) {
    const init = d && typeof d === 'object' ? { type: d.type, sdp: d.sdp } : d;
    return this.rtc.RTCSessionDescription && !this.rtc.web ? new this.rtc.RTCSessionDescription(init) : init;
  }

  private cand(c: any) {
    return this.rtc.RTCIceCandidate && !this.rtc.web ? new this.rtc.RTCIceCandidate(c) : c;
  }

  private static descJson(d: any) {
    return d ? { type: d.type, sdp: d.sdp } : null;
  }

  /** A parameterless setLocalDescription where it exists (perfect negotiation), the explicit form where not. */
  private async setLocal(pc: any, kind: 'offer' | 'answer') {
    try {
      await pc.setLocalDescription();
    } catch {
      const d = kind === 'offer' ? await pc.createOffer() : await pc.createAnswer();
      await pc.setLocalDescription(d);
    }
  }

  private hasTurn() {
    return this.ice.some((sv) => ([] as string[]).concat(sv.urls as string | string[]).some((u) => String(u).startsWith('turn:') || String(u).startsWith('turns:')));
  }

  private slotOf(pc: any, ev: any) {
    const tx: any[] = pc.getTransceivers?.() ?? [];
    let idx = tx.indexOf(ev.transceiver);
    if (idx === -1 && ev.transceiver?.mid != null) idx = tx.findIndex((t) => t.mid === ev.transceiver.mid);
    if (idx === -1 && ev.track) idx = tx.findIndex((t) => t.receiver?.track?.id === ev.track.id);
    if (idx === -1) idx = ev.track?.kind === 'audio' ? 0 : 1;
    return idx;
  }

  /** One connection. `caller` creates the three slots — only one side may (dash.html:7458). */
  private makePc(peer: PeerView, caller: boolean): PcState {
    const existing = this.pcs.get(peer.id);
    if (existing) return existing;
    const pc = new this.rtc.RTCPeerConnection({ iceServers: this.ice, bundlePolicy: 'max-bundle' });
    const st: PcState = { pc, peer, polite: !caller, makingOffer: false, ignoreOffer: false, pending: [], relayTried: false };
    this.pcs.set(peer.id, st);

    if (caller) {
      // Order IS the meaning: 0 microphone, 1 camera, 2 screen.
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
      this.bindLocal(st);
    }

    pc.addEventListener('negotiationneeded', async () => {
      try {
        st.makingOffer = true;
        await this.setLocal(pc, 'offer');
        this.signal(peer.id, 'offer', LiveEngine.descJson(pc.localDescription));
      } catch {
        // the next negotiationneeded or heartbeat tries again
      } finally {
        st.makingOffer = false;
      }
    });
    pc.addEventListener('icecandidate', (ev: any) => {
      const c = ev?.candidate;
      if (!c) return;
      const json = typeof c.toJSON === 'function' ? c.toJSON() : { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex };
      this.signal(peer.id, 'ice', json);
    });
    pc.addEventListener('connectionstatechange', () => {
      const s = String(pc.connectionState ?? '');
      this.patchPeer(peer.id, () => ({ conn: s }));
      if (s === 'failed') {
        if (!st.relayTried && this.hasTurn()) {
          st.relayTried = true;
          try {
            pc.setConfiguration?.({ iceServers: this.ice, iceTransportPolicy: 'relay', bundlePolicy: 'max-bundle' });
            if (!st.polite) pc.restartIce?.();
          } catch {
            // falls through to the red bar on the next failure
          }
          return;
        }
        if (!this.state.dead.includes(peer.id)) this.set({ dead: [...this.state.dead, peer.id] });
        if (!st.polite) {
          try {
            pc.restartIce?.();
          } catch {
            // nothing more to try
          }
        }
      }
      if (s === 'connected' && this.state.dead.includes(peer.id)) this.set({ dead: this.state.dead.filter((x) => x !== peer.id) });
    });
    pc.addEventListener('track', (ev: any) => {
      const idx = this.slotOf(pc, ev);
      const track = ev.track;
      if (!track) return;
      // Three separate streams, one per slot: hearing someone must never depend on seeing them.
      const key = idx === 0 ? 'audioStream' : idx === 2 ? 'screenStream' : 'camStream';
      const liveKey = idx === 0 ? null : idx === 2 ? 'screenLive' : 'camLive';
      const isLive = () => track.readyState === 'live' && !track.muted;
      const mark = () => {
        if (liveKey) this.patchPeer(peer.id, () => ({ [liveKey]: isLive() }) as Partial<PeerView>);
      };
      try {
        track.addEventListener?.('unmute', mark);
        track.addEventListener?.('mute', mark);
        track.addEventListener?.('ended', () => {
          if (liveKey) this.patchPeer(peer.id, () => ({ [liveKey]: false }) as Partial<PeerView>);
        });
      } catch {
        // not every build fires mute events; the `state` signal is the fallback for showing video
      }
      let stream: unknown = null;
      try {
        stream = this.rtc.MediaStream ? new this.rtc.MediaStream([track]) : ev.streams?.[0] ?? null;
      } catch {
        stream = ev.streams?.[0] ?? null;
      }
      this.patchPeer(peer.id, () => ({ [key]: stream, ...(liveKey ? { [liveKey]: isLive() } : {}) }) as Partial<PeerView>);
    });
    return st;
  }

  /** Places the call if we are the one who should. Safe to repeat: it is also how a missed join heals. */
  private maybeCall(peer: PeerCard) {
    const self = this.state.self;
    if (!self || this.pcs.has(peer.id)) return;
    const view = this.meta.get(peer.id);
    if (view && callsFirst({ id: self.id, joinedAt: self.joinedAt }, { id: peer.id, joinedAt: peer.joinedAt })) this.makePc(view, true);
  }

  private async onSignal(from: string, kind: string, payload: any) {
    if (kind === 'bye') {
      this.dropPeer(from);
      return;
    }
    if (kind === 'state') {
      const s = payload && typeof payload === 'object' ? payload : {};
      this.patchPeer(from, () => ({ state: { mic: s.mic !== false, cam: !!s.cam, screen: !!s.screen } }));
      return;
    }
    let st = this.pcs.get(from);
    if (!st) {
      const peer = this.meta.get(from);
      if (!peer) return; // we need their name before we can show a tile
      st = this.makePc(peer, false);
    }
    const pc = st.pc;
    try {
      if (kind === 'ice') {
        if (!pc.remoteDescription) {
          st.pending.push(payload);
          return;
        }
        try {
          await pc.addIceCandidate(this.cand(payload));
        } catch {
          // a candidate for an ignored offer
        }
        return;
      }
      const d = payload;
      if (!d || !d.type) return;
      const collision = d.type === 'offer' && (st.makingOffer || pc.signalingState !== 'stable');
      st.ignoreOffer = !st.polite && collision;
      if (st.ignoreOffer) return;
      await pc.setRemoteDescription(this.desc(d));
      for (const c of st.pending.splice(0)) {
        try {
          await pc.addIceCandidate(this.cand(c));
        } catch {
          // stale candidate
        }
      }
      if (d.type === 'offer') {
        this.bindLocal(st); // the slots exist now; put our tracks in them
        await this.setLocal(pc, 'answer');
        this.signal(from, 'answer', LiveEngine.descJson(pc.localDescription));
        this.announce();
      }
    } catch {
      // one bad description does not end the call; the heartbeat reconciles
    }
  }

  private onBus = ({ name, data }: { name: string; data: any }) => {
    if (!data || data.meetingId !== this.meetingId || !this.alive) return;
    switch (name) {
      case 'meet-signal':
        void this.onSignal(String(data.from), String(data.kind), data.payload);
        return;
      case 'meet-peer-join':
        if (data.peer?.id) {
          this.remember(data.peer);
          this.maybeCall(data.peer);
        }
        return;
      case 'meet-peer-leave':
        if (data.userId) this.dropPeer(String(data.userId));
        return;
      case 'meet-config':
        this.set({ screenShareAllowed: data.screenShareAllowed !== false });
        return;
      case 'meet-invited':
        if (data.peer?.id) this.set({ expected: [...this.state.expected.filter((x) => x.id !== data.peer.id), data.peer] });
        return;
      case 'meet-declined':
        this.set({ notice: `${data.by?.name || 'They'} declined the call.`, expected: this.state.expected.filter((x) => x.id !== data.by?.id) });
        return;
      case 'meet-removed':
        this.end('error', 'The host removed you from this call.');
        return;
      case 'meeting-ended':
        this.end('ended', 'The host ended this call.');
        return;
      default:
    }
  };

  start() {
    this.offBus = chatBus.on(this.onBus as never);
    void this.join();
  }

  private async join() {
    try {
      let mic: any = null;
      try {
        const s = await this.rtc.mediaDevices.getUserMedia({ audio: true, video: false });
        mic = s?.getAudioTracks?.()[0] ?? null;
      } catch {
        throw new Error('DASH needs the microphone to join a call. Allow it in your phone’s settings and try again.');
      }
      if (!this.alive) {
        mic?.stop?.();
        return;
      }
      this.local.mic = mic;
      const j = await callsApi.join(this.meetingId);
      if (isApiError(j)) throw new Error(j.error || 'You can’t join this call.');
      if (!this.alive) {
        // Left while /join was in flight: stop()'s /leave may have reached the server first, so say it
        // again now that the join is recorded, or the others would try to call us for 45 s.
        void callsApi.leave(this.meetingId);
        return;
      }
      this.ice = Array.isArray(j.iceServers) ? j.iceServers : [];
      this.set({
        phase: 'live',
        self: j.self,
        isHost: !!j.isHost,
        screenShareAllowed: j.screenShareAllowed !== false,
        maxParticipants: Number(j.maxParticipants) || 8,
        expected: Array.isArray(j.expected) ? j.expected : [],
        liveAt: Date.now(),
      });
      for (const p of j.peers ?? []) {
        this.remember(p);
        this.maybeCall(p);
      }
      this.announce({ mic: true, cam: false, screen: false });
      void this.loadTitle();
      const every = Math.max(5, Number(j.heartbeatSeconds) || 15) * 1000;
      this.beat = setInterval(() => void this.heartbeat(), every);
      this.stats = setInterval(() => void this.pollStats(), 3000);
    } catch (e) {
      if (this.alive) this.end('error', errText(e, 'Couldn’t join the call.'));
    }
  }

  private async loadTitle() {
    const m = await callsApi.meeting(this.meetingId);
    if (isApiError(m) || !this.alive) return;
    this.set({ title: m.meeting?.title ?? null, conversationId: m.meeting?.conversationId ?? null });
  }

  /** Presence, and the repair: a missed join shows up here and is called one heartbeat late. */
  private async heartbeat() {
    if (!this.alive) return;
    const h = await callsApi.heartbeat(this.meetingId);
    if (isApiError(h) || !this.alive) return;
    this.set({
      screenShareAllowed: h.screenShareAllowed !== false,
      expected: Array.isArray(h.expected) ? h.expected.filter((x) => !this.meta.has(x.id)) : this.state.expected,
      maxParticipants: Number(h.maxParticipants) || this.state.maxParticipants,
    });
    const live = new Set((h.peers ?? []).map((p) => p.id));
    for (const p of h.peers ?? []) {
      this.remember(p);
      this.maybeCall(p);
    }
    for (const id of [...this.meta.keys()]) if (!live.has(id)) this.dropPeer(id);
  }

  /** Which route actually carried the call (dash.html:7376), read from the connection's own statistics. */
  private async pollStats() {
    for (const [id, st] of this.pcs) {
      try {
        const report = await st.pc.getStats();
        let pair: any = null;
        let local: any = null;
        report.forEach((r: any) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) pair = r;
        });
        if (!pair)
          report.forEach((r: any) => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded') pair = r;
          });
        if (!pair) continue;
        report.forEach((r: any) => {
          if (r.type === 'local-candidate' && r.id === pair.localCandidateId) local = r;
        });
        const t = local?.candidateType;
        const kind = t === 'host' ? 'same network' : t === 'srflx' ? 'via STUN' : t === 'prflx' ? 'direct' : t === 'relay' ? 'via relay' : t ?? '';
        const rtt = pair.currentRoundTripTime != null ? `${Math.round(pair.currentRoundTripTime * 1000)}ms` : '';
        const route = [kind, rtt].filter(Boolean).join(' · ');
        if (this.meta.get(id)?.route !== route) this.patchPeer(id, () => ({ route }));
      } catch {
        // stats are a courtesy
      }
    }
  }

  stop() {
    if (this.left) return;
    this.left = true;
    this.alive = false;
    if (this.beat) clearInterval(this.beat);
    if (this.stats) clearInterval(this.stats);
    this.offBus?.();
    for (const id of [...this.pcs.keys()]) {
      this.signal(id, 'bye', null);
      this.closePc(id);
    }
    this.meta.clear();
    for (const t of [this.local.mic, this.local.cam]) {
      try {
        t?.stop?.();
      } catch {
        // already stopped
      }
    }
    this.local = { mic: null, cam: null };
    void callsApi.leave(this.meetingId);
  }

  toggleMic() {
    const t = this.local.mic;
    if (!t) {
      this.set({ notice: 'No microphone is connected to this call. Leave, allow the microphone and join again.' });
      return;
    }
    t.enabled = !t.enabled;
    this.set({ mic: !!t.enabled });
    this.announce({ mic: !!t.enabled });
  }

  async toggleCam() {
    if (this.state.cam) {
      try {
        this.local.cam?.stop?.();
      } catch {
        // already stopped
      }
      this.local.cam = null;
      this.putInSlot(1, null);
      this.set({ cam: false, selfStream: null });
      this.announce({ cam: false });
      return;
    }
    try {
      const s = await this.rtc.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: this.state.front ? 'user' : 'environment', width: CAMERA_CONSTRAINTS.width, height: CAMERA_CONSTRAINTS.height, frameRate: CAMERA_CONSTRAINTS.frameRate },
      });
      const t = s?.getVideoTracks?.()[0];
      if (!t) throw new Error('no camera');
      this.local.cam = t;
      this.putInSlot(1, t); // replaceTrack, not addTrack: instant, no renegotiation
      this.set({ cam: true, selfStream: s });
      this.announce({ cam: true });
    } catch {
      this.set({ notice: 'The camera could not be turned on. Allow the camera in your phone’s settings.' });
    }
  }

  flipCam() {
    const t = this.local.cam;
    if (!t) return;
    const front = !this.state.front;
    try {
      if (typeof t._switchCamera === 'function') t._switchCamera();
      else void t.applyConstraints?.({ facingMode: front ? 'user' : 'environment' });
      this.set({ front });
    } catch {
      this.set({ notice: 'This phone could not switch cameras.' });
    }
  }
}

// ── The demo call (no media) ─────────────────────────────────────────────────
const DEMO_ROUTES = ['same network · 18ms', 'via STUN · 42ms', 'via STUN · 61ms'];

export class DemoEngine extends BaseEngine {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private left = false;

  constructor(meetingId: string) {
    super(meetingId, true);
  }

  private after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.alive) fn();
    }, ms);
    this.timers.add(t);
  }

  /** A colleague "picks up": connecting, then live a moment later. */
  private arrive(p: CallPerson, ms: number) {
    this.after(ms, () => {
      if (!this.state.expected.some((x) => x.id === p.id)) return; // removed or declined meanwhile
      this.remember({ ...p, joinedAt: new Date().toISOString() });
      this.patchPeer(p.id, () => ({ conn: 'connecting' }));
      this.after(1200, () => this.patchPeer(p.id, (v) => ({ conn: 'connected', route: DEMO_ROUTES[this.meta.size % DEMO_ROUTES.length] ?? '', state: { ...v.state, mic: true } })));
    });
  }

  /** Nobody answered within the ring time (the website's ring gives up after 45 s). */
  private giveUp(p: CallPerson) {
    this.after(RING_SECONDS * 1000, () => {
      if (!this.state.expected.some((x) => x.id === p.id)) return;
      this.set({ expected: this.state.expected.filter((x) => x.id !== p.id), notice: `${p.name || 'They'} didn’t answer.` });
    });
  }

  start() {
    void this.join();
  }

  private async join() {
    const j = await callsApi.join(this.meetingId);
    if (!this.alive) return;
    if (isApiError(j)) {
      this.end('error', j.error || 'You can’t join this call.');
      return;
    }
    this.set({
      phase: 'live',
      self: j.self,
      isHost: !!j.isHost,
      screenShareAllowed: j.screenShareAllowed !== false,
      maxParticipants: Number(j.maxParticipants) || 8,
      expected: [],
      liveAt: Date.now(),
    });
    for (const p of j.peers ?? []) {
      this.remember(p);
      this.patchPeer(p.id, () => ({ conn: 'connecting' }));
      this.after(900, () => this.patchPeer(p.id, () => ({ conn: 'connected', route: DEMO_ROUTES[0] ?? '' })));
    }
    const m = await callsApi.meeting(this.meetingId);
    if (isApiError(m) || !this.alive) return;
    const convId = m.meeting?.conversationId ?? null;
    this.set({ title: m.meeting?.title ?? null, conversationId: convId });
    if (!j.isHost || !convId) return;
    // I started it: everyone else in the chat is ringing. Up to two "answer"; the rest don't.
    const conv = await apiFetch<ConversationResponse>(`/meets/conversations/${encodeURIComponent(convId)}`);
    if (isApiError(conv) || !this.alive) return;
    const meId = j.self?.id;
    const ringing: CallPerson[] = (conv.members ?? [])
      .filter((x) => x.id !== meId && !x.leftAt)
      .map((x) => ({ id: x.id, name: x.name, dept: x.dept, email: x.email, jobTitle: x.jobTitle }));
    this.set({ expected: ringing });
    ringing.forEach((p, i) => {
      if (i < 2) this.arrive(p, 3200 + i * 3000);
      else this.giveUp(p);
    });
  }

  protected override afterInvite(p: CallPerson) {
    this.arrive(p, 4000);
  }

  stop() {
    if (this.left) return;
    this.left = true;
    this.alive = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.meta.clear();
    void callsApi.leave(this.meetingId);
  }

  toggleMic() {
    this.set({ mic: !this.state.mic });
  }

  async toggleCam() {
    this.set({ cam: !this.state.cam });
  }

  flipCam() {
    if (this.state.cam) this.set({ front: !this.state.front });
  }
}
