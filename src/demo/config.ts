// Demo account — sign in with 8328617610 and code 123456 (or afzal.demo@tamadamedia.com, password
// Demo@123, then 123456), pick a role in "Explore DASH as…", and explore the app on sample data.
//
// It lives entirely on the phone: requests made with a demo token are answered by src/demo/server.ts
// and never reach DASH, so it needs no server or database change and can never touch real records.
// The "Afzal …" people (src/demo/personas.ts) exist only here — there is no such user, number or
// email in the DASH database, and nothing on the server knows about them.
// It exists in dev builds (Expo Go / dev client) and in internal preview builds for testers — never in
// store builds, so the app people install from the Play Store / App Store has no fixed code, password
// or token that opens anything.
//
// A preview build turns it on only when BOTH hold (docs/EXPO-ENV.md):
//   - EXPO_PUBLIC_DEMO is '1' — set on expo.dev in the "preview" environment only;
//   - EXPO_PUBLIC_BUILD_PROFILE is 'preview' — committed per profile in eas.json (production says
//     'production', so a store build stays demo-free even if EXPO_PUBLIC_DEMO=1 is added there by mistake).
// Both are read with dot notation on purpose: that is the only form Expo writes into the app at build time.

import type { StaffUser } from '@/auth/session';

export const DEMO_ENABLED =
  __DEV__ || (process.env.EXPO_PUBLIC_DEMO === '1' && process.env.EXPO_PUBLIC_BUILD_PROFILE === 'preview');
export const DEMO_PHONE = '8328617610';
export const DEMO_OTP = '123456';
export const DEMO_EMAIL = 'afzal.demo@tamadamedia.com';
export const DEMO_PASSWORD = 'Demo@123';

// Every demo token starts with 'demo-' (a real DASH token is 64 hex characters, so they can never
// clash). Staff: 'demo-session-token' is Afzal Employee (the token the demo always had, so an old
// demo sign-in keeps working) and 'demo-session-token:<persona>' every other role. Vendor demo
// sessions use VENDOR_DEMO_TOKEN_PREFIX + '<persona>' (src/demo/vendor/personas.ts).
export const DEMO_TOKEN = 'demo-session-token';
export const DEMO_TOKEN_PREFIX = 'demo-';
export const VENDOR_DEMO_TOKEN_PREFIX = 'demo-vendor-token:';

/** True for any demo session token — only where DEMO_ENABLED (dev and preview builds), never in a store build. */
export const isDemoToken = (token: unknown): token is string =>
  DEMO_ENABLED && typeof token === 'string' && token.startsWith(DEMO_TOKEN_PREFIX);

export const isDemoPhone = (phone: string) => DEMO_ENABLED && phone.replace(/\D/g, '').slice(-10) === DEMO_PHONE;
export const isDemoEmail = (email: string) => DEMO_ENABLED && email.trim().toLowerCase() === DEMO_EMAIL;

export const DEMO_TENANT_ID = 't-demo';

// The demo person as the fixtures store them: one id and one name for every role, so the sample
// records ("my leave", "my claims", the tasks I created…) belong to whoever is exploring. The server
// (demo/server.ts) shows this id and name as the chosen persona's ("demo-hr", "Afzal HR") and reads
// them back on the way in. Role, department, title and employee number come from the persona
// (personas.ts → fixtures/org.ts `profile`); the values below are only the starting point the
// fixtures are built from (the Creative department's manager, who owns two Keka Codes).
export const DEMO_USER: StaffUser = {
  id: 'demo-user',
  name: 'Afzal Employee',
  email: DEMO_EMAIL,
  role: 'employee',
  tenantId: DEMO_TENANT_ID,
  dept: 'Creative',
  departmentId: 'dept-creative',
  kekaCode: 'TM-1042',
  employeeNumber: 'TM-1042',
  mobile: '+918328617610',
  phone: '+918328617610',
  jobTitle: 'Video Editor',
  reportingTo: 'u-priya',
  reportingManager: 'Priya Sharma',
  dateJoined: '2022-06-13',
  location: 'Hyderabad',
  bloodGroup: 'B+',
  points: 1240,
  timesheetCadence: 'daily',
};
