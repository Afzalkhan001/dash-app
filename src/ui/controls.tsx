// Small controls (docs/DESIGN.md §7.6–7.7, §7.14): segmented tabs inside a screen, filter chips and
// chip rows, a select field (opens a sheet of options), date/time fields backed by the platform
// picker, and FieldPair for two time fields side by side.

import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, Check, ChevronDown, CircleAlert, Clock } from 'lucide-react-native';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Platform, Pressable, ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { dateLabel, hmLabel, todayIst } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { font, motion, palette, radius, space } from '@/theme/tokens';
import { haptic } from '@/ui/haptics';
import { shouldStack, useLayout } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Button } from '@/ui/primitives';
import { Sheet } from '@/ui/sheet';
import { isDarkScheme, useSurface, withAlpha } from '@/ui/surface';
import { Text } from '@/ui/text';

const IOS = Platform.OS === 'ios';

// ── Segmented ────────────────────────────────────────────────────────────────
export type Segment<K extends string> = { key: K; label: string; badge?: number };

const SEGMENT_MAX = 4;
const SEGMENT_LABEL_MAX = 10;

/**
 * Equal-width segmented control with an animated white thumb (≤ 4 options, labels ≤ 10 characters).
 * With more options or a longer label it renders as a scrolling ChipRow of Chips instead (same API;
 * `badge` becomes the chip count), so it never cramps or truncates.
 */
export function Segmented<K extends string>({ options, value, onChange }: { options: Segment<K>[]; value: K; onChange: (k: K) => void }) {
  const list = Array.isArray(options) ? options : [];
  const chips = list.length > SEGMENT_MAX || list.some((o) => o.label.length > SEGMENT_LABEL_MAX);
  if (chips) {
    return (
      <ChipRow>
        {list.map((o) => (
          <Chip key={o.key} label={o.label} selected={o.key === value} count={o.badge ? o.badge : undefined} onPress={() => o.key !== value && onChange(o.key)} />
        ))}
      </ChipRow>
    );
  }
  return <SegmentTrack options={list} value={value} onChange={onChange} />;
}

function SegmentTrack<K extends string>({ options, value, onChange }: { options: Segment<K>[]; value: K; onChange: (k: K) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const n = Math.max(options.length, 1);
  const index = options.findIndex((o) => o.key === value);
  const segW = trackWidth > 0 ? (trackWidth - 8) / n : 0;
  const x = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (segW <= 0 || index < 0) return;
    const to = index * segW;
    if (!placed.current) {
      placed.current = true;
      x.set(to);
    } else {
      x.set(withSpring(to, motion.layout));
    }
  }, [index, segW, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={styles.track} accessibilityRole="tablist" onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}>
      {segW > 0 && index >= 0 ? <Animated.View pointerEvents="none" style={[styles.thumb, { width: segW }, thumbStyle]} /> : null}
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (on) return;
              haptic.select();
              onChange(o.key);
            }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.badge ? `${o.label}, ${o.badge}` : o.label}>
            <Text
              variant={on ? 'labelStrong' : 'label'}
              color={on ? palette.onPrimary : palette.textMuted}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              maxFontSizeMultiplier={1.2}
              style={[{ flexShrink: 1 }, !on && { fontFamily: font.medium }]}>
              {o.label}
            </Text>
            {o.badge ? (
              <View style={[styles.segBadge, on && styles.segBadgeOn]}>
                <Text variant="micro" color={palette.onPrimary} maxFontSizeMultiplier={1} tabular>
                  {o.badge > 99 ? '99+' : o.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────
/**
 * Filter chip (34 high, 48 dp touch target). Selected = charcoal with white text. `count` shows a
 * small badge (0 is shown as "0"; omit it to hide). Fires a selection haptic when it becomes selected.
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
}) {
  const fg = selected ? palette.onPrimary : palette.text;
  const tinted = isValidElement(icon) && typeof icon.type !== 'string' ? cloneElement(icon as ReactElement<{ color?: string; size?: number }>, { color: fg, size: 14 }) : icon;
  return (
    <PressableScale
      onPress={() => {
        if (!selected) haptic.select();
        onPress?.();
      }}
      disabled={disabled || !onPress}
      scaleTo={0.96}
      hitSlop={{ top: 7, bottom: 7 }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      style={[styles.chip, selected && styles.chipOn, disabled && { opacity: 0.4 }]}>
      {tinted}
      <Text
        variant={selected ? 'labelStrong' : 'label'}
        color={fg}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={[{ flexShrink: 1 }, !selected && { fontFamily: font.medium }]}>
        {label}
      </Text>
      {count != null ? (
        <View style={[styles.chipCount, selected && styles.chipCountOn]}>
          <Text variant="micro" color={selected ? palette.onPrimary : palette.ink} maxFontSizeMultiplier={1} tabular>
            {count > 999 ? '999+' : count}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/**
 * A row of chips. Scrolls horizontally edge to edge (bleeds into the screen gutter, or the card
 * padding with `bleed="card"`) so the last chip peeks; `wrap` wraps instead — use that only in forms
 * and filter sheets.
 */
export function ChipRow({
  children,
  bleed = 'screen',
  wrap,
  style,
}: {
  children: ReactNode;
  bleed?: 'screen' | 'card' | 'none';
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { gutter, cardPad } = useLayout();
  if (wrap) return <View style={[styles.chipWrap, style]}>{children}</View>;
  const pad = bleed === 'card' ? cardPad : bleed === 'none' ? 0 : gutter;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={[{ marginHorizontal: -pad, flexGrow: 0 }, style]}
      contentContainerStyle={{ gap: space.xs, paddingHorizontal: pad, alignItems: 'center' }}>
      {children}
    </ScrollView>
  );
}

// ── Field chrome shared by Select / Date / Time ─────────────────────────────
function FieldLabel({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <Text variant="labelStrong" muted numberOfLines={2}>
      {label}
    </Text>
  );
}

/** Error line (icon + red caption) or helper hint under a field. */
export function FieldMessage({ error, hint }: { error?: string | null; hint?: string | null }) {
  if (error) {
    return (
      <View style={styles.errorRow} accessibilityLiveRegion="polite">
        <CircleAlert size={14} color={palette.dangerInk} strokeWidth={2.2} style={{ marginTop: 1 }} />
        <Text variant="caption" color={palette.dangerInk} style={{ flex: 1, minWidth: 0 }}>
          {error}
        </Text>
      </View>
    );
  }
  if (hint) {
    return (
      <Text variant="caption" muted>
        {hint}
      </Text>
    );
  }
  return null;
}

function useFieldBox(error?: string | null): ViewStyle[] {
  const surface = useSurface();
  return [styles.field, surface === 'sheet' && { backgroundColor: palette.surfaceMuted }, !!error && styles.fieldError].filter(Boolean) as ViewStyle[];
}

// ── Select ───────────────────────────────────────────────────────────────────
export type Option<V extends string> = { value: V; label: string; hint?: string };

/** Tappable field that opens a sheet of options. `hint` is a muted helper line under the field. */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  error,
  hint,
  disabled,
}: {
  label?: string;
  value: V | null | undefined;
  options: Option<V>[];
  onChange: (v: V) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(options) ? options : [];
  const current = list.find((o) => o.value === value);
  const box = useFieldBox(error);
  return (
    <View style={styles.fieldWrap}>
      <FieldLabel label={label} />
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label ? `${label}: ` : ''}${current ? current.label : placeholder}`}
        style={({ pressed }) => [...box, pressed && styles.fieldPressed, disabled && { opacity: 0.4 }]}>
        <Text variant="body" color={current ? palette.text : palette.textFaint} numberOfLines={1} style={styles.fieldValue}>
          {current ? current.label : placeholder}
        </Text>
        <ChevronDown size={18} color={palette.textMuted} />
      </Pressable>
      <FieldMessage error={error} hint={hint} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || placeholder}>
        <View style={{ gap: 4 }}>
          {list.map((o) => {
            const on = o.value === value;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  if (!on) haptic.select();
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.option, (on || pressed) && { backgroundColor: palette.surfaceMuted }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {o.label}
                  </Text>
                  {o.hint ? (
                    <Text variant="label" muted numberOfLines={2}>
                      {o.hint}
                    </Text>
                  ) : null}
                </View>
                {on ? <Check size={18} color={palette.ink} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

// ── Date / time ──────────────────────────────────────────────────────────────
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hmOf = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// A column child: it never flexes on its own (FieldPair gives it flex: 1 when two sit side by side).
function PickerField({
  label,
  text,
  placeholder,
  icon,
  error,
  hint,
  onOpen,
}: {
  label?: string;
  text: string | null;
  placeholder: string;
  icon: ReactNode;
  error?: string | null;
  hint?: string | null;
  onOpen: () => void;
}) {
  const box = useFieldBox(error);
  return (
    <View style={styles.fieldWrap}>
      <FieldLabel label={label} />
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${label ? `${label}: ` : ''}${text ?? placeholder}`}
        style={({ pressed }) => [...box, pressed && styles.fieldPressed]}>
        {icon}
        <Text variant="body" color={text ? palette.text : palette.textFaint} numberOfLines={1} style={styles.fieldValue}>
          {text ?? placeholder}
        </Text>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

const toDay = (ymd?: string | null) => (ymd ? new Date(`${ymd}T12:00:00`) : undefined);

/** Date picker field. value/onChange use 'YYYY-MM-DD' (the format every DASH endpoint expects). Always stack date fields. */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = 'Pick a date',
  error,
  hint,
}: {
  label?: string;
  value: string | null;
  onChange: (ymd: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  placeholder?: string;
  error?: string | null;
  hint?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);
  // Read once, so render stays pure: it only decides whether the year is shown ('Mon, 6 Oct' this year,
  // 'Sun, 5 Oct 2025' otherwise — the app's one date format).
  const [today] = useState(todayIst);
  const show = () => {
    setDraft(toDay(value) ?? new Date());
    setOpen(true);
  };
  return (
    <>
      <PickerField
        label={label}
        text={value ? dateLabel(value, today) : null}
        placeholder={placeholder}
        icon={<Calendar size={18} color={palette.textMuted} />}
        error={error}
        hint={hint}
        onOpen={show}
      />
      {open && draft && Platform.OS === 'android' ? (
        <DateTimePicker
          value={draft}
          mode="date"
          minimumDate={toDay(minimumDate)}
          maximumDate={toDay(maximumDate)}
          onValueChange={(_, d) => {
            setOpen(false);
            haptic.select();
            onChange(ymdOf(d));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
      {Platform.OS !== 'android' ? (
        <Sheet
          visible={open}
          onClose={() => setOpen(false)}
          title={label || 'Pick a date'}
          footer={
            <Button
              title="Done"
              onPress={() => {
                if (draft) onChange(ymdOf(draft));
                setOpen(false);
              }}
            />
          }>
          {draft ? (
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              minimumDate={toDay(minimumDate)}
              maximumDate={toDay(maximumDate)}
              accentColor={palette.primaryText}
              themeVariant={isDarkScheme() ? 'dark' : 'light'}
              onValueChange={(_, d) => setDraft(d)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </>
  );
}

/** Time picker field. value/onChange use 'HH:MM' (24h). Two side by side: wrap them in <FieldPair>. */
export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'Pick a time',
  error,
  hint,
}: {
  label?: string;
  value: string | null;
  onChange: (hm: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);
  const toDate = (hm?: string | null) => {
    const d = new Date();
    if (hm) {
      const [h, m] = hm.split(':').map(Number);
      d.setHours(h || 0, m || 0, 0, 0);
    }
    return d;
  };
  return (
    <>
      <PickerField
        label={label}
        text={value ? hmLabel(value) : null}
        placeholder={placeholder}
        icon={<Clock size={18} color={palette.textMuted} />}
        error={error}
        hint={hint}
        onOpen={() => {
          setDraft(toDate(value));
          setOpen(true);
        }}
      />
      {open && draft && Platform.OS === 'android' ? (
        <DateTimePicker
          value={draft}
          mode="time"
          is24Hour={false}
          onValueChange={(_, d) => {
            setOpen(false);
            haptic.select();
            onChange(hmOf(d));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
      {Platform.OS !== 'android' ? (
        <Sheet
          visible={open}
          onClose={() => setOpen(false)}
          title={label || 'Pick a time'}
          footer={
            <Button
              title="Done"
              onPress={() => {
                if (draft) onChange(hmOf(draft));
                setOpen(false);
              }}
            />
          }>
          {draft ? (
            <View style={{ alignItems: 'center' }}>
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                themeVariant={isDarkScheme() ? 'dark' : 'light'}
                textColor={palette.text}
                onValueChange={(_, d) => setDraft(d)}
              />
            </View>
          ) : null}
        </Sheet>
      ) : null}
    </>
  );
}

/**
 * Two TimeFields side by side (gap 12, each flex 1); stacks below 340 dp. Date fields always stack —
 * a date label needs ~186 dp, which no phone has twice.
 */
export function FieldPair({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const stack = shouldStack(useLayout(), { below: 'tight', text: false });
  const items = Children.toArray(children);
  return (
    <View style={[stack ? styles.pairColumn : styles.pairRow, style]}>
      {items.map((child, i) => (
        <View key={isValidElement(child) && child.key != null ? child.key : i} style={stack ? null : styles.pairCell}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  track: {
    flexDirection: 'row',
    minHeight: 40,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.track,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
    // No Android elevation: it lifts the thumb above the (non-elevated) labels and hides them.
    ...(IOS ? { shadowColor: palette.primary, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } } : null),
  },
  segment: {
    zIndex: 1,
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 32,
    paddingHorizontal: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: palette.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 34,
    maxWidth: '100%',
    borderRadius: radius.pill,
    backgroundColor: IOS ? palette.glass : palette.glassAndroid,
    borderWidth: 1,
    borderColor: IOS ? palette.glassEdge : palette.glassLine,
  },
  segBadgeOn: { backgroundColor: 'rgba(255,255,255,0.28)' },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: withAlpha(palette.ink, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipCountOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  fieldWrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    // Same as TextField: translucent white in light, the stronger frost veil in dark.
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7),
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
  },
  fieldPressed: { backgroundColor: palette.surface },
  fieldError: { borderWidth: 1.5, borderColor: palette.dangerInk },
  fieldValue: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, minHeight: 52 },
  pairRow: { flexDirection: 'row', gap: space.sm },
  pairColumn: { flexDirection: 'column', gap: space.md },
  pairCell: { flex: 1, minWidth: 0 },
}));
