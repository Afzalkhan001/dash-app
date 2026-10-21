// Calls domain gates, ported from dash.html. Pure functions only (spec docs/port/meets.md §1.4–1.5, §2.2).
// The server never checks a role for calls: canJoinMeeting (meets.js:1849) decides by host, invite and
// conversation membership, and the host-only routes check host_id. So the gates below are the
// website's own and nothing stricter.

import type { Tenant } from '@/api/me';
import { canSeeMeets } from '@/features/chat/access';
import { hasWebRTC, isExpoGo, isWeb } from '@/lib/capabilities';

type CallUser = { id?: string | null; role?: string | null } | null | undefined;

/**
 * Calls live inside Meets: everyone signed in (dash.html:7000 `canSeeMeetsNav(user){return !!user;}`;
 * MeetsCallWatcher is mounted for every signed-in user, :30523). Same company-switch rule as chat
 * (features/chat/access.ts canSeeMeets, decision D6).
 */
export function canSeeCalls(user: CallUser, tenant: Tenant | null | undefined) {
  return canSeeMeets(user, tenant);
}

/**
 * Start a call from a conversation: dash.html:10245 `{canPost&&<button … onClick={startCall}>Start call</button>}`,
 * and meets.js:2041 refuses a former member (`membership.left_at`).
 */
export function canStartCall(c: { canPost?: boolean; leftAt?: string | null } | null | undefined) {
  return !!c && c.canPost !== false && !c.leftAt;
}

/** Host controls (Add person, screen-share switch, Remove, End for everyone): dash.html:7790 `isHost=!!(info&&info.isHost)`. */
export function isCallHost(info: { isHost?: boolean } | null | undefined) {
  return !!info?.isHost;
}

/** Remove someone: host only and never the host themselves (meets.js:2397). */
export function canRemoveFromCall(info: { isHost?: boolean } | null | undefined, peerId: string, meId: string | null | undefined) {
  return isCallHost(info) && !!peerId && peerId !== meId;
}

/**
 * Who places the call between two people (dash.html:7344 callsFirst): the earlier `joinedAt`, a tie
 * broken on the lower user id. Compared as strings, exactly like the website, so phone ↔ browser
 * agree on who offers.
 */
export function callsFirst(me: { id: string; joinedAt?: string | null }, them: { id: string; joinedAt?: string | null }) {
  const a = String(me.joinedAt || '');
  const b = String(them.joinedAt || '');
  if (a !== b) return a < b;
  return String(me.id) < String(them.id);
}

/**
 * What this copy of the app can do with a call.
 *   demo        the demo account: a simulated call (no sound or video leaves the phone)
 *   live        real WebRTC: an installed app with react-native-webrtc, or a browser (the web build)
 *   unavailable Expo Go, or an installed build without the WebRTC module — "Available in the installed app"
 */
export type CallSupport = 'demo' | 'live' | 'unavailable';

export function callSupport(demo: boolean): CallSupport {
  if (demo) return 'demo';
  if (isWeb()) return webHasWebRTC() ? 'live' : 'unavailable';
  if (isExpoGo()) return 'unavailable';
  return hasWebRTC() ? 'live' : 'unavailable';
}

function webHasWebRTC() {
  const g = globalThis as { RTCPeerConnection?: unknown; navigator?: { mediaDevices?: { getUserMedia?: unknown } } };
  return typeof g.RTCPeerConnection === 'function' && typeof g.navigator?.mediaDevices?.getUserMedia === 'function';
}
