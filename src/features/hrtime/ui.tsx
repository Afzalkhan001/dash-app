// Small pieces every HR setup screen shares: the gate wrapper (skeleton while /hr/me loads, then home
// for anyone without the gate — PLAN §2.1.6), a switch row, the weekly-off chips, a ± stepper for
// half-day steps, a whole-number field, and plain-words helpers.

import { Redirect } from 'expo-router';
import { Check, Minus, Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useHrMe } from '@/api/me';
import { hrTimeGates, type HrTimeGates } from '@/features/hrtime/access';
import { WEEKDAYS } from '@/features/attendance/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Chip, ChipRow, FieldMessage, IconButton, PillField, Screen, SkeletonList, SwitchRow, Text } from '@/ui';

// ── Gate ─────────────────────────────────────────────────────────────────────
/**
 * Every hrtime screen re-checks its own gate (PLAN §2.1.6): a skeleton while /hr/me is still on its
 * way (a cold start must not bounce an HR admin home), then home for anyone without it.
 */
export function useHrTimeGate(which: keyof HrTimeGates) {
  const access = useAccess();
  const hrQ = useHrMe();
  const gates = hrTimeGates(access.hr, access.user);
  return { access, gates, pending: hrQ.isPending, allowed: gates[which] };
}

export function GateFallback({ pending, header }: { pending: boolean; header: ReactNode }) {
  if (!pending) return <Redirect href="/" />;
  return (
    <Screen header={header}>
      <SkeletonList rows={5} avatar tone="surface" />
    </Screen>
  );
}

// ── Words ────────────────────────────────────────────────────────────────────
/** The server's message, or a plain fallback. */
export const errorText = (e: unknown, fallback = 'Something went wrong. Try again.') =>
  e instanceof Error && e.message ? e.message : fallback;

/** Day numbers are 0 = Sunday … 6 = Saturday (the server's); the app reads weeks Monday first. */
const mondayFirst = (i: number) => (i + 6) % 7;
export const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
export function cleanDays(v: unknown): number[] {
  return Array.isArray(v)
    ? [...new Set(v.filter((i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i <= 6))].sort(
        (a, b) => mondayFirst(a) - mondayFirst(b),
      )
    : [];
}
export const daysLabel = (v: unknown) => cleanDays(v).map((i) => WEEKDAYS[i]).join(', ') || 'None';

/** Whole number from a field, or null. */
export const intOf = (s: string) => (/^\s*-?\d+\s*$/.test(s) ? Number(s.trim()) : null);
/** Number in steps of 0.5 from a field, or null. */
export const halfOf = (s: string) => {
  const n = Number(String(s).trim());
  return String(s).trim() !== '' && Number.isFinite(n) && Math.round(n * 2) === n * 2 ? n : null;
};
export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// ── Switch row ───────────────────────────────────────────────────────────────
// The whole row is the button (one 'switch' stop for screen readers); the Switch only shows the state,
// as features/more/security-card does. `flush` is for a row placed straight inside a padded card
// among fields: it pulls the row out by the ListRow's own padding (less the 4 dp field-label inset),
// so its label lines up with the field labels above and below it.
export function ToggleRow({
  label,
  sub,
  value,
  onChange,
  disabled,
  flush,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  flush?: boolean;
}) {
  return <SwitchRow title={label} subtitle={sub} value={value} onChange={onChange} disabled={disabled} flush={flush} />;
}

// ── Weekly off ───────────────────────────────────────────────────────────────
export function WeekdayChips({ label = 'Weekly off', value, onChange, error }: { label?: string; value: number[]; onChange: (v: number[]) => void; error?: string | null }) {
  const set = cleanDays(value);
  return (
    <View style={styles.group}>
      <Text variant="labelStrong" muted style={styles.label}>
        {label}
      </Text>
      <ChipRow wrap bleed="none">
        {MONDAY_FIRST.map((d) => {
          const on = set.includes(d);
          return (
            <Chip
              key={d}
              label={WEEKDAYS[d] ?? ''}
              selected={on}
              icon={on ? <Check /> : undefined}
              onPress={() => onChange(on ? set.filter((x) => x !== d) : cleanDays([...set, d]))}
            />
          );
        })}
      </ChipRow>
      <FieldMessage error={error} hint={set.length >= 7 ? null : set.length ? `${set.length} ${set.length === 1 ? 'day' : 'days'} off a week` : 'Nobody has a weekly day off'} />
    </View>
  );
}

// ── ± stepper (steps of 0.5 by default) ──────────────────────────────────────
export function Stepper({
  label,
  value,
  onChange,
  step = 0.5,
  min = 0,
  max = 365,
  unit,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  hint?: string | null;
  disabled?: boolean;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  const shown = `${value > 0 && min < 0 ? '+' : ''}${fmtDays(value)}${unit ? ` ${unit}` : ''}`;
  return (
    <View style={styles.group}>
      <Text variant="labelStrong" muted style={styles.label}>
        {label}
      </Text>
      <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: shown }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? step : -step)))}>
        <IconButton accessibilityLabel={`Less ${label.toLowerCase()}`} tone="surface" size={44} disabled={disabled || value <= min} onPress={() => onChange(clamp(value - step))}>
          <Minus size={20} color={palette.text} />
        </IconButton>
        <Text variant="title" color={palette.ink} tabular align="center" numberOfLines={1} style={styles.stepValue}>
          {shown}
        </Text>
        <IconButton accessibilityLabel={`More ${label.toLowerCase()}`} tone="surface" size={44} disabled={disabled || value >= max} onPress={() => onChange(clamp(value + step))}>
          <Plus size={20} color={palette.text} />
        </IconButton>
      </View>
      <FieldMessage hint={hint} />
    </View>
  );
}

// ── Whole-number field ───────────────────────────────────────────────────────
export function NumberField({
  label,
  value,
  onChange,
  unit,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  hint?: string | null;
  error?: string | null;
}) {
  return (
    <PillField
      label={label}
      value={value}
      onChangeText={(v) => onChange(v.replace(/[^\d]/g, '').slice(0, 5))}
      keyboardType="number-pad"
      inputMode="numeric"
      trailing={unit ? <Text variant="label" muted>{unit}</Text> : undefined}
      hint={hint}
      error={error}
    />
  );
}

/** A tick in a circle for multi-select rows. */
export function Tick({ on }: { on: boolean }) {
  return (
    <View style={[styles.tick, on && styles.tickOn]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {on ? <Check size={16} color={palette.onPrimary} strokeWidth={2.4} /> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  toggle: { borderRadius: radius.md },
  flush: { marginHorizontal: -(space.md - space.xxs) },
  pressed: { backgroundColor: palette.pressedTint },
  disabled: { opacity: 0.5 },
  group: { gap: space.xs },
  // The PillField label inset, so these labels line up with the fields around them.
  label: { paddingHorizontal: space.xxs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepValue: { flex: 1 },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: palette.primary, borderColor: palette.primary },
}));

/** The word only, for "2 offices" built as `${n} ${noun(n, 'office')}` (lib/format plural() adds the number). */
export const noun = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
