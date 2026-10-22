// Vendor portal: the tab bar ((tabs): Home · Bills · Agreements · Profile) plus the screens pushed
// over it — /portal/register, /portal/bills/[id], /portal/agreements/[id]. Same shape as the staff
// app's (app)/_layout + (app)/(tabs)/_layout.
import { Stack } from 'expo-router';
import { Keyboard } from 'react-native';

import { palette } from '@/theme/tokens';

export const unstable_settings = { anchor: '(tabs)' };

// Blur a focused field before a screen leaves the stack (Android can close the app otherwise; see (app)/_layout.tsx).
const LEAVE_LISTENERS = { beforeRemove: () => Keyboard.dismiss() };

export default function VendorPortalLayout() {
  return (
    <Stack screenListeners={LEAVE_LISTENERS} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
