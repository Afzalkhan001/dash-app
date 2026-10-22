import { Stack } from 'expo-router';
import { Keyboard } from 'react-native';

import { palette } from '@/theme/tokens';

export const unstable_settings = { anchor: 'login' };

// Blur a focused field before a screen leaves the stack (Android can close the app otherwise; see (app)/_layout.tsx).
const LEAVE_LISTENERS = { beforeRemove: () => Keyboard.dismiss() };

export default function AuthLayout() {
  return (
    <Stack screenListeners={LEAVE_LISTENERS} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="email" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="forgot" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="vendor" />
      <Stack.Screen name="vendor-otp" />
      <Stack.Screen name="vendor-password" />
      <Stack.Screen name="oauthredirect" options={{ animation: 'none' }} />
    </Stack>
  );
}
