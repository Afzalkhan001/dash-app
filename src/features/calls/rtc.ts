// The WebRTC implementation for this copy of the app, loaded lazily so Expo Go never resolves a
// native module it does not have (lib/capabilities.ts).
//   - Installed app: react-native-webrtc through loadWebRTC() — null until the integrator installs a
//     release documented for SDK 57 (see HANDOFF.md). Its RTCView draws video.
//   - Web build: the browser's own RTCPeerConnection / getUserMedia (video drawn with a <video> tag).
//   - Expo Go: null → the call screen says "Available in the installed app".
// The objects are typed loosely on purpose: browsers and react-native-webrtc differ in small ways,
// and the engine guards every call that might not exist on one of them.

import type { ComponentType } from 'react';

import { isExpoGo, isWeb, loadWebRTC } from '@/lib/capabilities';

export type Rtc = {
  RTCPeerConnection: new (config: any) => any;
  RTCSessionDescription?: new (init: any) => any;
  RTCIceCandidate?: new (init: any) => any;
  MediaStream?: new (tracks?: any[]) => any;
  mediaDevices: { getUserMedia: (c: any) => Promise<any> };
  /** react-native-webrtc's video view (native only). */
  RTCView?: ComponentType<any>;
  web: boolean;
};

let cached: Rtc | null | undefined;

export function loadRtc(): Rtc | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (isWeb()) {
    const g = globalThis as any;
    if (typeof g.RTCPeerConnection === 'function' && g.navigator?.mediaDevices?.getUserMedia) {
      cached = {
        RTCPeerConnection: g.RTCPeerConnection,
        RTCSessionDescription: g.RTCSessionDescription,
        RTCIceCandidate: g.RTCIceCandidate,
        MediaStream: g.MediaStream,
        mediaDevices: g.navigator.mediaDevices,
        web: true,
      };
    }
    return cached;
  }
  if (isExpoGo()) return cached;
  const m = loadWebRTC() as any;
  if (m && m.RTCPeerConnection && m.mediaDevices) {
    cached = {
      RTCPeerConnection: m.RTCPeerConnection,
      RTCSessionDescription: m.RTCSessionDescription,
      RTCIceCandidate: m.RTCIceCandidate,
      MediaStream: m.MediaStream,
      mediaDevices: m.mediaDevices,
      RTCView: m.RTCView,
      web: false,
    };
  }
  return cached;
}
