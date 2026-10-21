// TanStack Query setup. The cache is saved to disk so a cold start paints the last-known data
// instantly and refreshes in the background — the main reason the app feels faster than the web,
// which re-downloads everything on load. Cleared on sign-out so nothing leaks between accounts.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { type ReactNode, useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { onSignOut, useSession } from '@/auth/session';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: (count, err) => {
        // Never retry auth/permission/validation errors; retry network blips twice.
        if (err instanceof ApiRequestError && err.status && err.status < 500) return false;
        return count < 2;
      },
    },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'dash.queryCache', throttleTime: 2000 });

// React Native has no window focus: treat "app came to foreground" as focus, so screens refetch on
// resume exactly like the website refetches when its tab becomes visible.
function useAppStateFocus() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (Platform.OS !== 'web') focusManager.setFocused(s === 'active');
    });
    return () => sub.remove();
  }, []);
}

onlineManager.setOnline(true);

onSignOut(() => {
  queryClient.clear();
  void persister.removeClient();
});

export function QueryProvider({ children }: { children: ReactNode }) {
  useAppStateFocus();
  // The persisted cache belongs to one account; it is only restored while the same session exists.
  const buster = useSession((s) => (s.kind === 'staff' ? s.user?.id : s.kind) ?? 'anon');
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster,
        maxAge: 1000 * 60 * 60 * 24 * 3,
        // Sensitive queries (salary, payslips…) opt out with meta: { persist: false } — kept in memory only.
        dehydrateOptions: { shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && q.meta?.persist !== false },
      }}>
      {children}
    </PersistQueryClientProvider>
  );
}
