// One Inbox / Past decisions row in the Payno "recent transactions" look (docs/REFERENCE-COMPONENTS.md
// item 8): the kind's round badge (or the person's initials), who in a calm medium weight over a muted
// line saying what it is, and on the right the figure (medium, tabular) over a small muted time (or a
// StatusPill). Rows sit inside the kit's ActivityList (one frosted card, 68 dp inset hairlines), so
// paddings, weights, press tint and height match the kit's ActivityRow.
//
// What the kit row can't do, and the reason this one exists: the last line — the employee's reason,
// who decided it, a visitor's purpose — runs the FULL width under the right column and wraps to two
// lines. In ActivityRow that line shares the narrow text column (≈150 dp at 360, ≈110 at 320) and is
// cut to one line, so "Doctor's appointment — will be in by 2 pm" became "Doctor's appointme…".
//
//   [ badge 40 ] 12 [ title (1 line)         ] 12 [  value ]
//                   [ subtitle (1–2 lines)   ]    [   time ]
//                   [ note, full width, up to 2 lines      ]
//
// Fit (docs/DESIGN.md §9): above 130 % text (115 % below 360 dp) the right column moves under the
// subtitle as one wrapping line, so the title keeps its width; below 360 dp a row with both a figure
// and a status puts the pill under the subtitle (T5). Rows never hold buttons — tapping opens the
// detail screen.

import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { font, type ModuleKey, palette, radius, space, type StatusTone } from '@/theme/tokens';
import { Avatar, ModuleBadge, shouldStack, StatusPill, Text, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';
export function InboxRequestRow({
  left,
  module,
  icon,
  person,
  title,
  subtitle,
  subtitleLines = 2,
  detail,
  detailLines = 2,
  value,
  valueMeta,
  status,
  right,
  onPress,
  accessibilityLabel,
}: {
  /** Leading slot. Or pass `module` + `icon` (ModuleBadge 40) or `person` (initials / photo, 40). */
  left?: ReactNode;
  module?: ModuleKey;
  icon?: LucideIcon;
  person?: { name?: string | null; uri?: string | null } | null;
  title: string;
  subtitle?: string | null;
  /** How many lines the subtitle may wrap to before it is cut (default 2, so dates are never cut). */
  subtitleLines?: number;
  /** The full-width line under the row (reason, decision, purpose). */
  detail?: string | null;
  detailLines?: number;
  /** Right-aligned figure (bodyStrong, tabular, 1 line). */
  value?: string | null;
  /** Small muted caption under `value` (the time it came in, or how long ago). */
  valueMeta?: string | null;
  /** One StatusPill in the right column (under the figure). */
  status?: { label: string; tone: StatusTone } | null;
  /** Anything else for the right column (one element at most). */
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const l = useLayout();
  // The kit ActivityRow's rule: the right column moves under the text above 130 % text, or already
  // above 115 % on a narrow phone (< 360 dp).
  const stack = shouldStack(l, { below: 'narrow', belowText: 'large', text: 'huge' });
  // Below 360 dp a row with both a figure and a status shows the pill under the text.
  const pillLeft = !!status && !stack && !!value && shouldStack(l, { below: 'narrow', text: false });
  const lead =
    left ??
    (module && icon ? (
      <ModuleBadge module={module} icon={icon} />
    ) : person ? (
      <Avatar name={person.name ?? undefined} uri={person.uri} size={40} ring={false} />
    ) : null);
  // The pill keeps its own width when the right column is right-aligned.
  const pill = status ? (
    <View>
      <StatusPill label={status.label} tone={status.tone} />
    </View>
  ) : null;
  const hasRight = !!value || !!valueMeta || (!!pill && !pillLeft) || right != null;
  const rightCol = hasRight ? (
    <View style={stack ? styles.rightStacked : styles.right}>
      {value ? (
        <Text variant="bodyStrong" tabular numberOfLines={1} style={[stack ? styles.shrink : styles.rightText, styles.medium]}>
          {value}
        </Text>
      ) : null}
      {valueMeta ? (
        <Text variant="caption" muted numberOfLines={1} style={stack ? styles.shrink : styles.rightText}>
          {valueMeta}
        </Text>
      ) : null}
      {pillLeft ? null : pill}
      {right}
    </View>
  ) : null;

  const body = (
    <View style={styles.row}>
      {lead ? <View style={styles.left}>{lead}</View> : null}
      <View style={styles.main}>
        <View style={styles.top}>
          <View style={styles.text}>
            <Text variant="bodyStrong" numberOfLines={1} style={[styles.shrink, styles.medium]}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="label" muted numberOfLines={subtitleLines} style={styles.shrink}>
                {subtitle}
              </Text>
            ) : null}
            {pillLeft ? <View style={styles.below}>{pill}</View> : null}
            {stack ? rightCol : null}
          </View>
          {stack ? null : rightCol}
        </View>
        {detail ? (
          <Text variant="caption" muted numberOfLines={detailLines} style={styles.shrink}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value, valueMeta, status?.label, detail].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.pressable, pressed && { backgroundColor: palette.pressedTint }]}>
      {body}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  // Same box as the kit ActivityRow (ListRow size="lg"): 16 sides, 12 top/bottom, 72 tall at least,
  // so the ActivityList's 68 dp separator inset lines up with the text.
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 72 },
  left: { flexShrink: 0 },
  main: { flex: 1, minWidth: 0, gap: space.xxs },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  text: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1 },
  // Payno: the name and the amount in a calm medium weight (the kit ActivityRow's titleWeight / valueWeight).
  medium: { fontFamily: font.medium },
  right: { flexShrink: 0, maxWidth: '45%', alignItems: 'flex-end', gap: 2 },
  rightStacked: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xxs, marginTop: 2 },
  rightText: { textAlign: 'right' },
  below: { flexDirection: 'row', marginTop: space.xxs },
  pressable: { borderRadius: radius.md },
}));
