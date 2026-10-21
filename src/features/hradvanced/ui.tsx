// Pieces the hradvanced screens share: the gate wrapper (a skeleton while /hr/me and the company load,
// then home for anyone without the gate — PLAN §2.1.6), the "type this to confirm" field that keeps a
// swipe locked, and small field helpers.

import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PillField, Screen, SkeletonList, Text } from '@/ui';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';

export const errorText = (e: unknown, fallback = 'Something went wrong. Try again.') => (e instanceof Error && e.message ? e.message : fallback);

export function GateFallback({ pending, header }: { pending: boolean; header: ReactNode }) {
  if (!pending) return <Redirect href="/" />;
  return (
    <Screen header={header}>
      <SkeletonList rows={5} avatar tone="surface" />
    </Screen>
  );
}

/** True when what was typed matches the phrase (spaces at the ends and letter case ignored). */
export const typedMatches = (typed: string, phrase: string) => typed.trim().toUpperCase() === phrase.trim().toUpperCase() && phrase.trim() !== '';

/** "Type CHANGE TAX to confirm": the swipe below it stays locked until it matches. */
export function TypeToConfirm({ phrase, value, onChange, what }: { phrase: string; value: string; onChange: (v: string) => void; what?: string }) {
  const ok = typedMatches(value, phrase);
  return (
    <View style={styles.typed}>
      <Text variant="label" muted>
        {what ?? 'To unlock the swipe, type'}{' '}
        <Text variant="labelStrong" color={palette.ink}>
          {phrase}
        </Text>
      </Text>
      <PillField
        value={value}
        onChangeText={onChange}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        placeholder={phrase}
        accessibilityLabel={`Type ${phrase} to confirm`}
        hint={ok ? 'Matches. Swipe to confirm.' : null}
      />
    </View>
  );
}

/** A labelled group inside a card or sheet. */
export function FieldGroup({ title, children, hint }: { title: string; children: ReactNode; hint?: string | null }) {
  return (
    <View style={styles.group}>
      <Text variant="labelStrong" muted style={styles.fieldLabel}>
        {title}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  fieldLabel: { paddingHorizontal: space.xxs },
  typed: { gap: space.xs },
  group: { gap: space.sm },
}));
