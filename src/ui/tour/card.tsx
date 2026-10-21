// The tour's cards (docs/TOUR.md §3.1–3.2, §4):
//   TourCoachCard  "2 of 7" · title · one or two sentences · step dots · Back / Next (Done) · Skip
//   TourIntroCard  "Welcome, Afzal" · the role line · Show me around / Skip (first sign-in only)
// Kit Text and Button only, so Plus Jakarta Sans everywhere; every colour is read at render time or in
// themedStyles (the tokens are live). The card never has a fixed height: it grows with large text up to
// the room it is given (`maxHeight`), and then its text scrolls inside. Compact (under 360 dp or text
// over 115 %): the dots get their own line over Back and a wide Next; with text at 130 % and up, Next
// goes full width with Back under it.
// Screen readers: the card is the modal; focus order is title → body → Back → Next → Skip (Skip is drawn
// in the top corner but comes last in the tree), and the escape gesture means Skip.

import { Compass } from 'lucide-react-native';
import { type ComponentRef, type Ref } from 'react';
import { ScrollView, View } from 'react-native';

import { themedStyles } from '@/theme/themed';
import { layout, palette, radius, shadow, space } from '@/theme/tokens';
import { shouldStack, useLayout } from '@/ui/layout';
import { IconBadge } from '@/ui/list';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/text';

type ViewRef = ComponentRef<typeof View>;

const DECOR = { pointerEvents: 'none', accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

/** The step dots: the current one a 16 × 6 brand pill, the rest 6 × 6 faint dots. Decorative. */
function Dots({ position, total }: { position: number; total: number }) {
  const n = Math.max(0, Math.min(total, 12));
  return (
    <View {...DECOR} style={styles.dots}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[styles.dot, i + 1 === position ? styles.dotOn : null]} />
      ))}
    </View>
  );
}

export type TourCoachCardProps = {
  title: string;
  body: string;
  position: number;
  total: number;
  canBack: boolean;
  isLast: boolean;
  labels: { next: string; back: string; done: string; skip: string };
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** The room the card may use; its text scrolls past this. */
  maxHeight?: number;
  /** The title's wrapper, so the overlay can move screen-reader focus to it. */
  titleRef?: Ref<ViewRef>;
};

export function TourCoachCard({ title, body, position, total, canBack, isLast, labels, onNext, onBack, onSkip, maxHeight, titleRef }: TourCoachCardProps) {
  const l = useLayout();
  const compact = shouldStack(l, { below: 'narrow' });
  // Narrow phone: Back and Next still share a row (a taller card would get squeezed beside a tall target
  // on a 320 × 700 screen). Text at 130 % and up: they stack.
  const stacked = compact && l.fontScale >= layout.textScale.huge;
  const nextLabel = isLast ? labels.done : labels.next;
  return (
    <View style={[styles.card, { padding: l.cardPad }, maxHeight != null ? { maxHeight } : null]}>
      <View style={styles.head}>
        <Text variant="caption" muted numberOfLines={1} accessibilityLabel={`Step ${position} of ${total}`}>
          {`${position} of ${total}`}
        </Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.copy} bounces={false}>
        <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={title}>
          <Text variant="heading" color={palette.ink}>
            {title}
          </Text>
        </View>
        <Text variant="body" muted>
          {body}
        </Text>
      </ScrollView>
      {stacked ? (
        <View style={styles.footCompact}>
          {total > 1 ? <Dots position={position} total={total} /> : null}
          <Button title={nextLabel} size="md" onPress={onNext} />
          {canBack ? <Button title={labels.back} variant="text" size="md" onPress={onBack} style={styles.backCompact} /> : null}
        </View>
      ) : compact ? (
        <View style={styles.footCompact}>
          {total > 1 ? <Dots position={position} total={total} /> : null}
          <View style={styles.footRow}>
            {canBack ? <Button title={labels.back} variant="text" size="md" onPress={onBack} /> : null}
            <Button title={nextLabel} size="md" onPress={onNext} style={styles.nextFill} />
          </View>
        </View>
      ) : (
        <View style={styles.foot}>
          <View style={styles.dotsSlot}>{total > 1 ? <Dots position={position} total={total} /> : null}</View>
          {canBack ? <Button title={labels.back} variant="ghost" size="md" onPress={onBack} /> : null}
          <Button title={nextLabel} size="md" onPress={onNext} />
        </View>
      )}
      {/* Last in the tree (read last), drawn in the top corner. */}
      <Button
        title={labels.skip}
        variant="text"
        size="sm"
        onPress={onSkip}
        hitSlop={8}
        accessibilityHint="Ends the tour"
        style={[styles.skip, { top: l.cardPad - 9, right: l.cardPad - 10 }]}
      />
    </View>
  );
}

export type TourIntroCardProps = {
  title: string;
  body: string;
  startLabel: string;
  skipLabel: string;
  onStart: () => void;
  onSkip: () => void;
  maxHeight?: number;
  titleRef?: Ref<ViewRef>;
};

export function TourIntroCard({ title, body, startLabel, skipLabel, onStart, onSkip, maxHeight, titleRef }: TourIntroCardProps) {
  const l = useLayout();
  return (
    <View style={[styles.card, styles.intro, { padding: l.cardPad + 4 }, maxHeight != null ? { maxHeight } : null]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.introCopy} bounces={false} showsVerticalScrollIndicator={false}>
        <IconBadge size={52} bg={palette.primarySoft} style={styles.badge}>
          <Compass size={24} color={palette.primaryText} strokeWidth={1.7} />
        </IconBadge>
        <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={title}>
          <Text variant="title" color={palette.ink}>
            {title}
          </Text>
        </View>
        <Text variant="body" muted>
          {body}
        </Text>
      </ScrollView>
      <View style={styles.introFoot}>
        <Button title={startLabel} onPress={onStart} />
        <Button title={skipLabel} variant="text" size="md" onPress={onSkip} accessibilityHint="Ends the tour" style={styles.introSkip} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.glassLine,
    gap: space.xs,
    ...shadow.float,
  },
  intro: { borderRadius: radius.xxl, gap: space.lg },
  // Leaves room on the right for Skip (drawn absolutely, read last).
  head: { minHeight: 24, justifyContent: 'center', paddingRight: 64 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  copy: { gap: space.xxs, paddingBottom: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm },
  dotsSlot: { flex: 1, minWidth: 0 },
  footCompact: { gap: space.sm, marginTop: space.sm },
  backCompact: { alignSelf: 'flex-start', marginTop: -space.xxs },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  nextFill: { flex: 1, minWidth: 0 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.textFaint, opacity: 0.55 },
  dotOn: { width: 16, backgroundColor: palette.primaryText, opacity: 1 },
  skip: { position: 'absolute', minHeight: 36, paddingHorizontal: 10 },
  introCopy: { gap: space.xs },
  badge: { marginBottom: space.xs },
  introFoot: { gap: space.xxs },
  introSkip: { alignSelf: 'center' },
}));
