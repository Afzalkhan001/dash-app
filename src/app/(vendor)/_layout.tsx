// Signed-in vendor area. Every vendor route lives under src/app/(vendor)/portal/ so its URLs
// ("/portal/...") never collide with the staff app's routes.
// In the demo account (development builds only) each vendor persona has its own token, and switching
// persona from Profile keeps the session signed in as a vendor: the stack is keyed by that token so the
// whole portal mounts afresh for the new persona (the vendor queries share one key, ['vendor', …], so
// screens kept from the previous persona would otherwise go on showing its data).
import { Stack } from 'expo-router';

import { useSession } from '@/auth/session';
import { isDemoToken } from '@/demo/config';
import { palette } from '@/theme/tokens';

export const unstable_settings = { anchor: 'portal' };

export default function VendorLayout() {
  // Constant for a real vendor session; the persona's token in the demo.
  const key = useSession((s) => (isDemoToken(s.token) ? s.token : 'vendor'));
  return (
    <Stack key={key} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas }, animation: 'slide_from_right' }}>
      <Stack.Screen name="portal" />
    </Stack>
  );
}
