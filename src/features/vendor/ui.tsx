// Building blocks shared by the vendor portal screens. Most are thin wrappers over the kit so the
// vendor screens look exactly like the rest of the app (inline notices are the kit Banner itself):
//   InfoRows      → kit KeyValueList (label/value rows that stack when the value is long)
//   SectionCard   → kit Card + CardHeader
// plus the wizard's own controls: two-option choice tiles (side by side only when both labels fit,
// otherwise stacked), a text field with a required marker, a consent checkbox and the step progress
// bar (wizard + Home).

import { Check } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, type TextInputProps, View } from 'react-native';

import { lightPalette, palette, radius, space } from '@/theme/tokens';
import { FIELD_LABEL_INSET, Card, CardHeader, FieldMessage, haptic, isDarkScheme, KeyValueList, Text, TextField, useLayout, useSurface } from '@/ui';

import { themedStyles } from '@/theme/themed';
// ── Sheet sessions ─────────────────────────────────────────────────────────────
// A sheet's body should start fresh every time it opens, but stay on screen while the sheet fades
// out (unmounting it on close makes the content vanish mid-animation). Key the body with this count.
export function useOpenCount(visible: boolean) {
  const [count, setCount] = useState(visible ? 1 : 0);
  const [was, setWas] = useState(visible);
  if (visible !== was) {
    setWas(visible);
    if (visible) setCount((c) => c + 1);
  }
  return count;
}

// The latest non-null value, so a sheet driven by "what is open" (null = closed) keeps showing it
// while it closes.
export function useLastValue<T>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}

// ── Signature paper ────────────────────────────────────────────────────────────
// The signature boxes (pad, preview, recorded signature) are paper in both themes: the ink is the
// website's #0f172a and uploads are photos of paper, so dark mode shows a warm off-white sheet (from
// the light tokens) instead of the dark card. Read at render time / inside a themedStyles factory.
/** The paper the signature sits on: white in light mode, a warm off-white in dark mode. */
export const paperColor = () => (isDarkScheme() ? lightPalette.surfaceMuted : palette.surface);
/** Muted text and icons drawn ON the paper. */
export const paperInk = () => (isDarkScheme() ? lightPalette.textMuted : palette.textMuted);

// ── Label / value rows (kit KeyValueList) ────────────────────────────────────────
export type InfoRow = { label: string; value?: string | null; action?: ReactNode; mono?: boolean };

export function InfoRows({ rows, hideEmpty }: { rows: InfoRow[]; hideEmpty?: boolean }) {
  const list = (Array.isArray(rows) ? rows : []).filter((r): r is InfoRow => !!r && typeof r.label === 'string');
  return (
    <KeyValueList
      hideEmpty={hideEmpty}
      rows={list.map((r, i) => ({
        key: `${r.label}-${i}`,
        label: r.label,
        value: r.value == null ? r.value : String(r.value),
        action: r.action,
        tabular: r.mono,
      }))}
    />
  );
}

// Card with a heading row (one-line title, optional overline, at most one control on the right).
export function SectionCard({
  title,
  overline,
  right,
  children,
  tone = 'surface',
}: {
  title: string;
  overline?: string;
  right?: ReactNode;
  children: ReactNode;
  tone?: 'surface' | 'muted';
}) {
  return (
    <Card tone={tone} style={{ gap: space.sm }}>
      <CardHeader title={title} overline={overline} right={right} />
      {children}
    </Card>
  );
}

// ── Two (or more) option tiles ─────────────────────────────────────────────────
// Equal-width tiles side by side when every label fits on one line (same 8.3 dp/character maths as the
// kit's ActionRow), otherwise one full-width tile per row — so "Not GST Registered" or "Use GST
// Certificate Address" never squeezes or wraps inside a half-width tile at 360 dp or with large text.
const CHAR_DP = 8.3;
const CHOICE_PAD = 14;
const RADIO_ROOM = 20 + 10; // radio disc + gap

export function ChoiceButtons({
  label,
  required,
  options,
  value,
  onChange,
  error,
}: {
  label?: string;
  required?: boolean;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const { width, fontScale, gutter, cardPad } = useLayout();
  const surface = useSurface();
  const [measured, setMeasured] = useState(0);
  const list = (Array.isArray(options) ? options : []).filter((o) => Array.isArray(o) && typeof o[0] === 'string');
  const avail = measured || width - 2 * gutter - 2 * cardPad;
  const n = Math.max(list.length, 1);
  const each = (avail - space.xs * (n - 1)) / n;
  const scale = Math.min(fontScale, 1.3);
  const side = list.length > 1 && list.length <= 3 && list.every(([, l]) => String(l).length * CHAR_DP * scale <= each - 2 * CHOICE_PAD - RADIO_ROOM);

  return (
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? (
        <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
          {label}
          {required ? (
            <Text variant="labelStrong" color={palette.dangerInk}>
              {' *'}
            </Text>
          ) : null}
        </Text>
      ) : null}
      <View style={side ? styles.choicesRow : styles.choicesCol} onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.width))}>
        {list.map(([v, l]) => {
          const on = value === v;
          return (
            <Pressable
              key={v}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={l}
              onPress={() => {
                if (!on) haptic.select();
                onChange(v);
              }}
              style={({ pressed }) => [
                styles.choice,
                side && { flex: 1, minWidth: 0 },
                { backgroundColor: surface === 'sheet' ? palette.surfaceMuted : palette.glass },
                on && styles.choiceOn,
                !!error && !on && { borderColor: palette.dangerInk },
                pressed && !on && { backgroundColor: palette.pressedTint },
              ]}>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <Check size={12} color={palette.onPrimary} strokeWidth={3} /> : null}</View>
              <Text
                variant={on ? 'bodyStrong' : 'body'}
                color={on ? palette.ink : palette.text}
                numberOfLines={side ? 1 : 3}
                maxFontSizeMultiplier={1.3}
                style={{ flexShrink: 1 }}>
                {l}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FieldMessage error={error} />
    </View>
  );
}

// ── Text field with required marker + hint ─────────────────────────────────────────
export function Field({ label, required, hint, error, ...rest }: TextInputProps & { label: string; required?: boolean; hint?: string; error?: string | null }) {
  return <TextField label={label ? (required ? `${label} *` : label) : undefined} error={error || null} hint={hint} {...rest} />;
}

// ── Consent checkbox ───────────────────────────────────────────────────────────
export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        haptic.select();
        onChange(!checked);
      }}
      hitSlop={4}
      style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.8 }]}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={14} color={palette.onPrimary} strokeWidth={3} /> : null}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{typeof children === 'string' ? <Text variant="label">{children}</Text> : children}</View>
    </Pressable>
  );
}

// ── Step progress ──────────────────────────────────────────────────────────────
// One segment per step (done and current filled, the current one lighter) over "Step 3 of 7". In the
// wizard (`onGoTo`) a finished step's segment is a 48 dp tall button that goes back to it; on Home it is
// only a picture of how far along the vendor is (`onDark` for the dark hero, `name` adds the step).
export type ProgressStep = { n: number; label: string };

export function StepProgress({
  steps,
  current,
  onGoTo,
  disabled,
  onDark,
  name,
}: {
  steps: ProgressStep[];
  current: number;
  onGoTo?: (n: number) => void;
  disabled?: boolean;
  onDark?: boolean;
  name?: boolean;
}) {
  const list = (Array.isArray(steps) ? steps : []).filter(Boolean);
  const position = Math.max(1, list.findIndex((s) => s.n === current) + 1);
  const label = list[position - 1]?.label;
  // Brand segments: primaryText (the vermilion in light, lifted in dark so it reads on the dark card).
  const on = onDark ? palette.onPrimary : palette.primaryText;
  const track = onDark ? 'rgba(255,255,255,0.18)' : palette.track;
  return (
    <View style={{ gap: onGoTo ? 0 : space.xs }}>
      <View style={styles.progress}>
        {list.map((s) => {
          const done = s.n < current;
          const cur = s.n === current;
          const seg = <View style={[styles.seg, { backgroundColor: done || cur ? on : track }, cur && styles.segCurrent]} />;
          if (!onGoTo) {
            return (
              <View key={s.n} style={{ flex: 1 }}>
                {seg}
              </View>
            );
          }
          return (
            <Pressable
              key={s.n}
              disabled={!done || disabled}
              onPress={() => onGoTo(s.n)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !done, selected: cur }}
              accessibilityLabel={done ? `Go back to ${s.label}` : `${s.label}${cur ? ', current step' : ''}`}
              style={styles.segHit}>
              {seg}
            </Pressable>
          );
        })}
      </View>
      <Text variant="label" color={onDark ? palette.onPrimaryMuted : palette.textMuted} numberOfLines={name ? 2 : 1}>
        Step {position} of {list.length}
        {name && label ? (
          <Text variant="labelStrong" color={onDark ? palette.onPrimary : palette.text}>
            {` · ${label}`}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  choicesRow: { flexDirection: 'row', gap: space.xs },
  choicesCol: { flexDirection: 'column', gap: space.xs },
  choice: {
    minHeight: 52,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: CHOICE_PAD,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
  choiceOn: { backgroundColor: palette.surface, borderColor: palette.primaryText, borderWidth: 1.5 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: palette.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOn: { backgroundColor: palette.charcoal, borderColor: palette.charcoal },
  checkRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingVertical: space.xs, minHeight: 44 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: palette.surface,
    flexShrink: 0,
  },
  boxOn: { backgroundColor: palette.charcoal, borderColor: palette.charcoal },
  progress: { flexDirection: 'row', gap: 6 },
  segHit: { flex: 1, minHeight: 48, justifyContent: 'center' },
  seg: { height: 6, borderRadius: 3 },
  segCurrent: { opacity: 0.55 },
}));
