// Old routes (/attendance, /leave, /pay) open the matching Me segment. It goes back to the tabs that
// are already under this screen (router.dismissTo) instead of replacing this screen with a second
// copy of the tab bar, and this screen has no animation, so the hop is not seen. With nothing to go
// back to (a cold deep link), dismissTo replaces this screen, like <Redirect> would.

import { Stack, useFocusEffect, useRouter } from 'expo-router';

import { meHref, type MeTab } from '@/features/me/tabs';

export function MeRedirect({ tab }: { tab: MeTab }) {
  const router = useRouter();
  useFocusEffect(() => {
    router.dismissTo(meHref(tab));
  });
  return <Stack.Screen options={{ animation: 'none' }} />;
}
