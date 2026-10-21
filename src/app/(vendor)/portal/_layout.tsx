// Vendor portal: the tab bar ((tabs): Home · Bills · Agreements · Profile) plus the screens pushed
// over it — /portal/register, /portal/bills/[id], /portal/agreements/[id]. Same shape as the staff
// app's (app)/_layout + (app)/(tabs)/_layout.
import { Stack } from 'expo-router';

import { palette } from '@/theme/tokens';

export const unstable_settings = { anchor: '(tabs)' };

export default function VendorPortalLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
