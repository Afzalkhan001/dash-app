// What this copy of the app can do on this device.
//
// DASH must keep running in Expo Go. Features that need native code Expo Go does not ship
// (calls over WebRTC, remote push, native Google sign-in) check here first and, when the answer
// is no, show UNAVAILABLE_IN_EXPO_GO instead of crashing.
//
// All functions are cheap and pure (no hooks), so they are safe to call during render.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { isRunningInExpoGo } from 'expo';
import { NativeModules, Platform } from 'react-native';

import { requireWebRTC } from '@/lib/webrtc-module';

export const UNAVAILABLE_IN_EXPO_GO = 'Available in the installed app';

export function isWeb(): boolean {
  return Platform.OS === 'web';
}

// True only inside the Expo Go app (not in a development build, not on web).
export function isExpoGo(): boolean {
  return isRunningInExpoGo();
}

// A development or store build: our own native code is present.
export function isInstalledApp(): boolean {
  if (isWeb() || isExpoGo()) return false;
  return (
    Constants.executionEnvironment === ExecutionEnvironment.Standalone ||
    Constants.executionEnvironment === ExecutionEnvironment.Bare ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient // dev client
  );
}

// Voice and video calls. react-native-webrtc 124.0.8 (+ @config-plugins/react-native-webrtc 15.0.2)
// is linked into installed builds (preview, store, development), so its native module is there and
// this is true. Expo Go and the web build answer false: Expo Go shows "Available in the installed
// app", and the web build uses the browser's own WebRTC instead (features/calls/access.ts).
export function hasWebRTC(): boolean {
  if (isWeb() || isExpoGo()) return false;
  return NativeModules.WebRTCModule != null;
}

// Lazily loads react-native-webrtc (null in Expo Go and on web, see hasWebRTC). The require itself
// lives in lib/webrtc-module.ts and only runs here, never at module scope; the web build gets
// webrtc-module.web.ts, so Metro never resolves the package for the browser.
export function loadWebRTC(): unknown | null {
  if (!hasWebRTC()) return null;
  try {
    return requireWebRTC();
  } catch {
    return null;
  }
}

// Call audio routing (react-native-incall-manager: speaker / earpiece / headset / Bluetooth,
// proximity screen-off). Linked into the same installed builds as WebRTC; called directly through
// its native module, so no JS from the package is bundled.
export function hasCallAudio(): boolean {
  if (isWeb() || isExpoGo()) return false;
  return NativeModules.InCallManager != null;
}

// Remote push needs a real phone and an installed app (Expo Go dropped remote push on Android in
// SDK 53). Local notifications still work in Expo Go for the demo.
export function hasRemotePush(): boolean {
  if (isWeb() || isExpoGo()) return false;
  return Device.isDevice;
}

export function hasLocalNotifications(): boolean {
  return !isWeb();
}

// QR / barcode scanning with expo-camera (bundled in Expo Go; web works over HTTPS or localhost).
export function hasCameraScanner(): boolean {
  return true;
}

// No native Google sign-in module is used: installed builds run Google through expo-auth-session
// (features/googlesignin/google-button.tsx, return link com.tamadamedia.dashmobile:/oauthredirect), and
// Expo Go and dev previews show the demo account picker. Kept false; nothing reads it today.
export function hasNativeGoogleSignIn(): boolean {
  return false;
}
