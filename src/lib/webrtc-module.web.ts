// Web build: calls use the browser's own WebRTC (features/calls/rtc.ts), never react-native-webrtc.

export function requireWebRTC(): unknown {
  return null;
}
