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
import { type ErrorBoundaryProps, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryProvider } from '@/api/query';
import { AppLockGate } from '@/auth/app-lock';
import { useSession } from '@/auth/session';
import { describeError, installCrashReporter, takeLastCrash } from '@/lib/crash';
import { ThemeProvider, useThemePreference } from '@/theme/theme-provider';
import { palette } from '@/theme/tokens';
import { ToastHost } from '@/ui/toast';
import { TourProvider } from '@/ui/tour';

SplashScreen.preventAutoHideAsync();
installCrashReporter();

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
  // The app closed on an error last time: show the saved report once, so it can be sent to support.
  useEffect(() => {
    if (!booted) return;
    const report = takeLastCrash();
    if (!report) return;
    Alert.alert('DASH closed unexpectedly last time', 'Share this report with support so it can be fixed.', [
      { text: 'Dismiss', style: 'cancel' },
      { text: 'Share report', onPress: () => void Share.share({ message: report }).catch(() => {}) },
    ]);
  }, [booted]);

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

/**
 * A screen threw while rendering: show what happened instead of a blank screen, with Try again and
 * Share report (plain React Native views, so it works even if the kit itself is what failed).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const report = describeError(error, 'screen');
  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas, paddingTop: 72, paddingHorizontal: 20, gap: 12 }}>
      <Text style={{ color: palette.ink, fontSize: 22 }}>Something went wrong</Text>
      <Text style={{ color: palette.textMuted, fontSize: 15 }}>This screen hit an error. Try again, or share the report with support.</Text>
      <ScrollView style={{ maxHeight: 260, borderRadius: 12, backgroundColor: palette.surfaceMuted, padding: 12 }}>
        <Text selectable style={{ color: palette.text, fontSize: 12 }}>
          {report}
        </Text>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => void retry()} style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: palette.onPrimary, fontSize: 15 }}>Try again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: report }).catch(() => {})} style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: palette.ink, fontSize: 15 }}>Share report</Text>
        </Pressable>
      </View>
    </View>
  );
}
