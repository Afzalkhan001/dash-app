// Text inputs (docs/DESIGN.md §7.14): 52 dp fields, radius 16, 16 px text (no iOS zoom), a charcoal
// focus ring, an error line with an icon, an optional helper `hint`, and a 112 dp multiline variant.
// Inside a Sheet the field uses the solid surfaceMuted fill.

import { type ComponentRef, forwardRef, type ReactNode, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, type TextInputProps, View } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { currentColorScheme, font, palette, radius, space } from '@/theme/tokens';
import { FieldMessage } from '@/ui/controls';
import { isDarkScheme, useSurface, withAlpha } from '@/ui/surface';
import { Text } from '@/ui/text';

type TextInputRef = ComponentRef<typeof TextInput>;

export type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
  /** Muted helper line under the field (hidden while an error shows). */
  hint?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  /** Multiline + maxLength: show a "12/500" counter under the field. */
  counter?: boolean;
};

export const TextField = forwardRef<TextInputRef, TextFieldProps>(function TextField(
  { label, error, hint, left, right, counter, style, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const surface = useSurface();
  const length = typeof rest.value === 'string' ? rest.value.length : 0;
  const showCounter = !!counter && !!rest.maxLength;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="labelStrong" muted numberOfLines={2}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          surface === 'sheet' && { backgroundColor: palette.surfaceMuted },
          multiline && styles.fieldMultiline,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}>
        {left}
        <TextInput
          ref={ref}
          placeholderTextColor={palette.textFaint}
          selectionColor={palette.primaryText}
          cursorColor={palette.primaryText}
          keyboardAppearance={currentColorScheme() === 'dark' ? 'dark' : 'light'}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          {...rest}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
        />
        {right}
      </View>
      {showCounter || error || hint ? (
        <View style={styles.below}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <FieldMessage error={error} hint={hint} />
          </View>
          {showCounter ? (
            <Text variant="caption" muted tabular style={{ flexShrink: 0 }}>
              {length}/{rest.maxLength}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

// Six boxes backed by one hidden input, so paste and the OS's SMS/OTP autofill both work.
export function OtpInput({ value, onChange, length = 6, autoFocus = true }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean }) {
  const ref = useRef<TextInputRef>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={styles.otpRow} accessibilityRole="none">
      {Array.from({ length }).map((_, i) => {
        const ch = value[i] ?? '';
        const active = focused && i === Math.min(value.length, length - 1);
        return (
          <View key={i} style={[styles.otpBox, active && styles.otpBoxActive, !!ch && styles.otpBoxFilled]}>
            <Text variant="title" tabular maxFontSizeMultiplier={1.1} style={{ fontSize: 26, lineHeight: 32 }}>
              {ch}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        keyboardAppearance={currentColorScheme() === 'dark' ? 'dark' : 'light'}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        accessibilityLabel="One-time code"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    // Light: translucent white. Dark: the stronger frost veil, so the field lifts off a card or the canvas.
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.7),
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
  },
  fieldMultiline: { minHeight: 112, alignItems: 'flex-start' },
  // The focus ring is a brand outline on a surface: primaryText (the same vermilion in light).
  fieldFocused: { borderWidth: 1.5, borderColor: palette.primaryText, backgroundColor: palette.surface },
  fieldError: { borderWidth: 1.5, borderColor: palette.dangerInk },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.regular,
    fontSize: 16,
    color: palette.text,
    paddingVertical: Platform.OS === 'ios' ? 15 : 12,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  inputMultiline: { minHeight: 110, paddingTop: 14, paddingBottom: 14, alignSelf: 'stretch' },
  below: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  otpRow: { flexDirection: 'row', gap: space.xs, justifyContent: 'center' },
  otpBox: {
    flex: 1,
    aspectRatio: 0.84,
    maxWidth: 52,
    borderRadius: radius.md,
    backgroundColor: isDarkScheme() ? palette.frostStrong : withAlpha(palette.surface, 0.6),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(palette.ink, 0.07),
  },
  otpBoxActive: { borderColor: palette.primaryText, backgroundColor: palette.surface, borderWidth: 1.5 },
  otpBoxFilled: { backgroundColor: palette.surface, borderColor: withAlpha(palette.ink, 0.12) },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
}));
