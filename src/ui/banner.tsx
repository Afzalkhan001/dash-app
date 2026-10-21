// Inline notice (docs/DESIGN.md §7.16): soft tinted panel with an icon, an optional title, a message,
// extra content and at most one small action. Never the only feedback for a failed submit.

import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert } from 'lucide-react-native';
import { isValidElement, type ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Button } from '@/ui/primitives';
import { isDarkScheme } from '@/ui/surface';
import { Text } from '@/ui/text';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

/** A tone's colours, read from the live theme at render time. */
function bannerTone(tone: BannerTone): { bg: string; icon: LucideIcon; iconColor: string; title: string } {
  switch (tone) {
    case 'success':
      return { bg: palette.successSoft, icon: CircleCheck, iconColor: palette.success, title: palette.text };
    case 'warning':
      return { bg: palette.warningSoft, icon: TriangleAlert, iconColor: palette.warning, title: palette.text };
    case 'danger':
      // In dark mode the fill red is too deep on the dark red tint, so the icon uses the text red.
      return { bg: palette.dangerSoft, icon: CircleAlert, iconColor: isDarkScheme() ? palette.dangerInk : palette.danger, title: palette.dangerInk };
    default:
      return { bg: palette.infoSoft, icon: Info, iconColor: palette.info, title: palette.text };
  }
}

export type BannerAction = { label: string; onPress: () => void; loading?: boolean };

/**
 *   <Banner tone="warning" title="Waiting on your confirmation" message="…" action={{ label: 'Confirm', onPress }} />
 * `action` is either { label, onPress } (rendered as a small ghost / danger Button) or your own node.
 * `icon` overrides the tone's icon.
 */
export function Banner({
  tone = 'info',
  title,
  message,
  action,
  icon,
  children,
  style,
}: {
  tone?: BannerTone;
  title?: string | null;
  message?: string | null;
  action?: ReactNode | BannerAction;
  icon?: LucideIcon;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = bannerTone(tone);
  const Icon = icon ?? t.icon;
  const actionEl =
    action && typeof action === 'object' && !isValidElement(action) && 'label' in action ? (
      <Button
        title={action.label}
        onPress={action.onPress}
        loading={action.loading}
        size="sm"
        variant={tone === 'danger' ? 'danger' : 'ghost'}
        style={{ alignSelf: 'flex-start' }}
      />
    ) : (
      (action as ReactNode)
    );
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }, style]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={18} color={t.iconColor} strokeWidth={2.2} style={{ marginTop: 1, flexShrink: 0 }} />
      <View style={styles.text}>
        {title ? (
          <Text variant="labelStrong" color={t.title}>
            {title}
          </Text>
        ) : null}
        {message ? <Text variant="label">{message}</Text> : null}
        {children}
        {actionEl ? <View style={styles.action}>{actionEl}</View> : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.sm, borderRadius: radius.sm },
  text: { flex: 1, minWidth: 0, gap: space.xxs },
  action: { marginTop: space.xxs, alignItems: 'flex-start' },
}));
