import { Stack } from 'expo-router';

import { palette } from '@/theme/tokens';

export const unstable_settings = { anchor: 'login' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="email" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="vendor" />
      <Stack.Screen name="vendor-otp" />
      <Stack.Screen name="vendor-password" />
    </Stack>
  );
}
