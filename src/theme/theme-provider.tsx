// Light / dark theme. The person picks System (follow the phone), Light or Dark in More → Appearance;
// the choice is kept in AsyncStorage. ThemeProvider swaps the live token values (applyColorScheme in
// src/theme/tokens.ts) and remounts everything under it, so every screen and every themedStyles sheet
// re-renders in the new scheme.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Fragment, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';

import { applyColorScheme, type ColorScheme } from '@/theme/tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'dash.themePreference';

type ThemeState = {
  preference: ThemePreference;
  loaded: boolean;
  setPreference: (next: ThemePreference) => void;
  load: () => Promise<void>;
};

export const useThemePreference = create<ThemeState>((set) => ({
  preference: 'system',
  loaded: false,
  setPreference: (preference) => {
    set({ preference });
    AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => {});
  },
  load: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved === 'system' || saved === 'light' || saved === 'dark') set({ preference: saved });
    } catch {
      // keep 'system'
    }
    set({ loaded: true });
  },
}));

/** The scheme the app should show now: the person's choice, or the phone's when they chose System. */
export function useResolvedScheme(): ColorScheme {
  const preference = useThemePreference((s) => s.preference);
  const system = useColorScheme();
  if (preference === 'system') return system === 'dark' ? 'dark' : 'light';
  return preference;
}

/**
 * Applies the resolved scheme to the live tokens and remounts its children when it changes.
 * applyColorScheme is idempotent (a no-op when the scheme is unchanged), and it runs before any child
 * renders, so children always read the current scheme's colours.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useResolvedScheme();
  applyColorScheme(scheme);
  return (
    <Fragment key={scheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </Fragment>
  );
}
