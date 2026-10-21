// Signed-in staff area: the tab bar plus every pushed screen (details, forms). Routes under
// src/app/(app)/<feature>/ are registered automatically by this Stack.
import { Stack } from 'expo-router';

import { palette } from '@/theme/tokens';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
