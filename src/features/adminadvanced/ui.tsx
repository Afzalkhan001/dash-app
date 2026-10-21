// Small shared pieces of the admin advanced screens.

import { Redirect } from 'expo-router';
import { Keyboard } from 'lucide-react-native';
import type { ReactNode } from 'react';

import { useHrMe, useMyTenant } from '@/api/me';
import { useAccess } from '@/lib/use-access';

import { PillField, Screen, SkeletonList } from '@/ui';

/** Typed names are compared without case and with runs of spaces folded, so "tamada  media" matches. */
const fold = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const typedMatches = (typed: string, word: string) => !!word && fold(typed) === fold(word);

/**
 * The extra step before a destructive admin action: type the item's name. The swipe stays disabled
 * until it matches (the caller passes `disabled={!typedMatches(...)}` to ConfirmSheet).
 */
export function TypeToConfirm({ word, value, onChangeText, what = 'name' }: { word: string; value: string; onChangeText: (v: string) => void; what?: string }) {
  const wrong = !!value.trim() && fold(value).length >= fold(word).length && !typedMatches(value, word);
  return (
    <PillField
      icon={Keyboard}
      label={`Type the ${what} to confirm`}
      value={value}
      onChangeText={onChangeText}
      placeholder={word}
      autoCapitalize="none"
      autoCorrect={false}
      accessibilityLabel={`Type ${word} to confirm`}
      hint={`Type ${word}`}
      error={wrong ? `That doesn’t match. Type ${word}` : null}
    />
  );
}

/** A gated screen while the person (or their company) is still loading; home when they lack the gate. */
export function GateFallback({ pending, header }: { pending: boolean; header: ReactNode }) {
  if (!pending) return <Redirect href="/" />;
  return (
    <Screen header={header}>
      <SkeletonList rows={5} avatar />
    </Screen>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** Everything a gate reads, and whether it is still arriving (the person, /hr/me, the company record). */
export function useGate() {
  const access = useAccess();
  const hrQ = useHrMe();
  const tenantQ = useMyTenant();
  // isPending, not isLoading: a query paused (offline, or not started yet on a cold deep link) is
  // pending but not loading, and the gate would read the empty /hr/me and send the person home.
  return { access, pending: !access.user || hrQ.isPending || (tenantQ.isPending && tenantQ.fetchStatus !== 'idle') };
}
