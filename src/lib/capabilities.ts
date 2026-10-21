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

// Voice and video calls. react-native-webrtc is NOT installed yet: no release is documented as
// supporting Expo SDK 57 / React Native 0.86 (its config plugin's table stops at SDK 56). When it
// is installed in a development build, the native module below appears and this turns true.
export function hasWebRTC(): boolean {
  if (isWeb() || isExpoGo()) return false;
  return NativeModules.WebRTCModule != null;
}

// Lazily loads react-native-webrtc. Returns null until the package is installed (see hasWebRTC).
// Keep the require out of module scope so Metro never resolves it in Expo Go or on web.
export function loadWebRTC(): unknown | null {
  if (!hasWebRTC()) return null;
  // When react-native-webrtc is added: return require('react-native-webrtc');
  return null;
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
