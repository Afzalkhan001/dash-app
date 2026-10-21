// PillField (docs/REFERENCE-COMPONENTS.md #24, Payno sign-in): a fully rounded frosted input, ~54 dp
// high, with a thin leading icon, a muted placeholder and a trailing slot. Password fields
// (`secureTextEntry`) get a built-in eye toggle. An error turns the rim red and shows the message
// under the pill; `hint` is a muted helper line. Forwards every TextInput prop and the ref.
// Inside a Sheet the pill uses the solid surfaceMuted fill (frost would vanish on the sheet).

import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { type ComponentRef, forwardRef, type ReactNode, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, type StyleProp, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

import { currentColorScheme, font, palette, radius, shadow, space } from '@/theme/tokens';
import { FieldMessage } from '@/ui/controls';
import { useSurface } from '@/ui/surface';
import { Text } from '@/ui/text';

import { themedStyles } from '@/theme/themed';
type TextInputRef = ComponentRef<typeof TextInput>;

const IOS = Platform.OS === 'ios';
/** The frosted rim: a bright edge on iOS, a hairline on Android (read in the themedStyles factory). */
const rim = () => (IOS ? palette.glassEdge : palette.glassLine);
const HEIGHT = 54;
const ICON = 20;

export type PillFieldProps = TextInputProps & {
  /** Leading thin line icon (lucide component), drawn at 20 dp, stroke 1.6. */
  icon?: LucideIcon;
  /** Optional label above the pill (also the screen-reader name). Payno forms usually go without. */
  label?: string;
  /** Error message under the pill; also turns the rim red. */
  error?: string | null;
  /** Muted helper line under the pill (hidden while an error shows). */
  hint?: string | null;
  /** Trailing slot (a unit, a small PillButton, a spinner). Sits before the eye toggle. */
  trailing?: ReactNode;
  /** With `secureTextEntry`: show the eye toggle (default true). */
  revealable?: boolean;
  /** Style for the outer column (label + pill + message). `style` goes to the TextInput. */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 *   <PillField icon={Phone} placeholder="Mobile number" keyboardType="phone-pad" value={v} onChangeText={setV} />
 *   <PillField icon={Lock} placeholder="Password" secureTextEntry value={p} onChangeText={setP} error={err} />
 * Tapping anywhere on the pill focuses the input. Grows with large text instead of clipping.
 */
export const PillField = forwardRef<TextInputRef, PillFieldProps>(function PillField(
  { icon: Icon, label, error, hint, trailing, revealable = true, containerStyle, secureTextEntry, editable, style, onFocus, onBlur, ...rest },
  ref,
) {
  const inner = useRef<TextInputRef>(null);
  useImperativeHandle(ref, () => inner.current as TextInputRef, []);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const surface = useSurface();
  const disabled = editable === false;
  const secure = !!secureTextEntry;
  const iconColor = error ? palette.dangerInk : focused ? palette.primaryText : palette.ink;

  return (
    <View style={[styles.column, containerStyle]}>
      {label ? (
        <Text variant="labelStrong" muted numberOfLines={2} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={() => inner.current?.focus()}
        disabled={disabled}
        accessible={false}
        style={[
          styles.pill,
          surface === 'sheet' ? styles.pillSheet : styles.pillFrost,
          focused && styles.pillFocused,
          !!error && styles.pillError,
          disabled && styles.pillDisabled,
        ]}>
        {Icon ? <Icon size={ICON} color={iconColor} strokeWidth={1.6} style={styles.icon} /> : null}
        <TextInput
          ref={inner}
          placeholderTextColor={palette.textMuted}
          selectionColor={palette.primaryText}
          cursorColor={palette.primaryText}
          keyboardAppearance={currentColorScheme() === 'dark' ? 'dark' : 'light'}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          {...rest}
          editable={editable}
          secureTextEntry={secure && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, !Icon && styles.inputNoIcon, style]}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        {secure && revealable ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            disabled={disabled}
            style={styles.eye}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ checked: revealed, disabled }}>
            {revealed ? <EyeOff size={ICON} color={palette.ink} strokeWidth={1.6} /> : <Eye size={ICON} color={palette.ink} strokeWidth={1.6} />}
          </Pressable>
        ) : null}
      </Pressable>
      {error || hint ? (
        <View style={styles.message}>
          <FieldMessage error={error} hint={hint} />
        </View>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  column: { gap: 6 },
  label: { paddingHorizontal: space.xxs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingLeft: space.lg,
    paddingRight: space.xxs,
  },
  pillFrost: { backgroundColor: palette.frostStrong, borderColor: rim(), ...(IOS ? shadow.soft : null) },
  pillSheet: { backgroundColor: palette.surfaceMuted, borderColor: palette.glassLine },
  pillFocused: { backgroundColor: palette.surface, borderColor: palette.primaryText, borderWidth: 1.5 },
  pillError: { borderColor: palette.dangerInk, borderWidth: 1.5 },
  pillDisabled: { opacity: 0.5 },
  icon: { marginRight: space.sm, flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    fontFamily: font.regular,
    fontSize: 16,
    color: palette.text,
    paddingVertical: IOS ? 16 : 13,
    paddingRight: space.sm,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    // Web: the pill draws its own focus ring, so drop the browser's rectangle inside it.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputNoIcon: { paddingLeft: space.xxs },
  trailing: { flexShrink: 0, marginRight: space.xs, alignItems: 'center', justifyContent: 'center' },
  eye: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  message: { paddingHorizontal: space.md },
}));
