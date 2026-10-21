// Starts the push bridge (lib/push.ts startPushBridge): the foreground handler, taps → screens (cold
// start included), re-registering on foreground and after sign-in. Idempotent, so it is safe to
// mount from more than one place; it lives for the life of the app once started.
//
// Integrator: mount <PushBridge/> once in src/app/(app)/_layout.tsx next to <MeetsWatcher/> (HANDOFF.md).
// Until then the Home card (features/push/home-card.tsx) and the Notifications screen start it.

import { useEffect } from 'react';

import { startPushBridge } from '@/lib/push';

export function usePushBridge() {
  useEffect(() => {
    startPushBridge();
  }, []);
}

/** Renders nothing. */
export function PushBridge() {
  usePushBridge();
  return null;
}
