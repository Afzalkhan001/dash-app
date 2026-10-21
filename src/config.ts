// Where the app talks to. Production DASH by default.
// - EAS builds: set EXPO_PUBLIC_DASH_URL on expo.dev → Environment variables (docs/EXPO-ENV.md).
// - Local dev: point the app at a local server with EXPO_PUBLIC_DASH_URL=http://192.168.x.x:3000 in
//   mobile/.env.local (never committed; see .env.example).
// Note: the server only skips the login OTP for true localhost requests, so a phone on the LAN
// still goes through WhatsApp/email OTP.
// Read with dot notation on purpose: that is the only form Expo writes into the app at build time.
export const DASH_URL = ((process.env.EXPO_PUBLIC_DASH_URL || '').trim() || 'https://dash.tamadamedia.in').replace(/\/+$/, '');
export const API_URL = `${DASH_URL}/api`;
