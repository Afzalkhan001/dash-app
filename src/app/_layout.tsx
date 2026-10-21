import {
  PlusJakartaSans_200ExtraLight,
  PlusJakartaSans_300Light,
  PlusJakartaSans_300Light_Italic,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryProvider } from '@/api/query';
import { AppLockGate } from '@/auth/app-lock';
import { useSession } from '@/auth/session';
import { ThemeProvider, useThemePreference } from '@/theme/theme-provider';
import { palette } from '@/theme/tokens';
import { ToastHost } from '@/ui/toast';
import { TourProvider } from '@/ui/tour';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_200ExtraLight,
    PlusJakartaSans_300Light,
    PlusJakartaSans_300Light_Italic,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const ready = useSession((s) => s.ready);
  const kind = useSession((s) => s.kind);
  const hydrate = useSession((s) => s.hydrate);
  const themeLoaded = useThemePreference((s) => s.loaded);
  const loadTheme = useThemePreference((s) => s.load);

  useEffect(() => {
    void hydrate();
    void loadTheme();
  }, [hydrate, loadTheme]);

  const booted = (fontsLoaded || !!fontError) && ready && themeLoaded;
  useEffect(() => {
    if (booted) void SplashScreen.hideAsync();
  }, [booted]);

  if (!booted) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <ThemeProvider>
            {/* The tour overlay renders above the app (tab bar included); the toast and app lock stay on top of it. */}
            <TourProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: palette.canvas },
                }}>
                <Stack.Protected guard={!kind}>
                  <Stack.Screen name="(auth)" />
                </Stack.Protected>
                <Stack.Protected guard={kind === 'staff'}>
                  <Stack.Screen name="(app)" />
                </Stack.Protected>
                <Stack.Protected guard={kind === 'vendor'}>
                  <Stack.Screen name="(vendor)" />
                </Stack.Protected>
              </Stack>
            </TourProvider>
            <ToastHost />
          </ThemeProvider>
          <AppLockGate />
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
