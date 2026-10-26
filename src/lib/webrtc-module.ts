// The native call libraries, required only when asked (lib/capabilities.ts loadWebRTC). Android and
// iOS bundles (Expo Go included) contain this file, but nothing here runs until hasWebRTC() is true,
// which it never is in Expo Go. The web build gets webrtc-module.web.ts instead, so Metro never
// resolves react-native-webrtc for the browser.

export function requireWebRTC(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-webrtc');
}
