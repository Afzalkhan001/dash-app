// Signed-in staff area: the tab bar plus every pushed screen (details, forms). Routes under
// src/app/(app)/<feature>/ are registered automatically by this Stack.
//
// Wave 0 (docs/port/PLAN.md §2.2.8, docs/port/EXTENSION-POINTS.md §8), integrator-owned:
//   - Stack options by route name (no <Stack.Screen> entries, so a route that does not exist yet adds
//     no warning): the visitor kiosk `admin/desk/kiosk` opens full screen with a fade and cannot be
//     swiped away; a call `call/[meetingId]` opens full screen from the bottom and cannot be swiped away.
//   - <MeetsWatcher/> (features/chat/meets-watcher), mounted once for the whole signed-in area; it
//     renders nothing until the chat domain fills it.
//   Pass 3: <IncomingCallWatcher/> (features/calls: the ring sheet for incoming calls, everywhere in the app)
//   and <PushBridge/> (features/push: routes a notification tap, even one that cold-starts the app).
//   <LiveCallBar/> (features/calls/call-bar): "Call in progress · Join" for a call whose ring was closed.
import { Stack } from 'expo-router';
import { Keyboard } from 'react-native';

import { LiveCallBar } from '@/features/calls/call-bar';
import { IncomingCallWatcher } from '@/features/calls/incoming-call';
import { MeetsWatcher } from '@/features/chat/meets-watcher';
import { PushBridge } from '@/features/push/bridge';
import { palette } from '@/theme/tokens';

export const unstable_settings = { anchor: '(tabs)' };

// Full-screen routes owned by the desk (kiosk) and calls domains.
const KIOSK = 'admin/desk/kiosk';
const CALL = 'call/[meetingId]';

// Android: a screen removed (back, replace, dismiss) while one of its text fields still has focus can
// close the app ("parameter must be a descendant of this view" when the keyboard hides mid-transition).
// Blur the field and start closing the keyboard before any screen leaves this stack (lib/keyboard.ts).
const LEAVE_LISTENERS = { beforeRemove: () => Keyboard.dismiss() };

export default function AppLayout() {
  const base = { headerShown: false, contentStyle: { backgroundColor: palette.canvas }, animation: 'slide_from_right' as const };
  return (
    <>
      <Stack
        screenListeners={LEAVE_LISTENERS}
        screenOptions={({ route }) =>
          route.name === KIOSK
            ? { ...base, presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }
            : route.name === CALL
              ? { ...base, presentation: 'fullScreenModal', gestureEnabled: false, animation: 'slide_from_bottom' }
              : base
        }>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <MeetsWatcher />
      <LiveCallBar />
      <IncomingCallWatcher />
      <PushBridge />
    </>
  );
}
