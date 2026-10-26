// More's navigation card (features/more/nav.ts builds it): the website's sidebar as one frosted list.
//   - A section with one page is a plain row that opens that page.
//   - A section with more pages is a folder: its badge, its name, the names of its pages in a muted
//     line, and a chevron that turns as it opens. Its pages slide in under it, indented, each with a
//     small badge in its module's colour. Tapping the header again closes it.
//   - Which folders are open is remembered on this phone (zustand persist, `dash.more.open`).
//   - While the first-sign-in tour points at a page inside a closed folder, that folder opens, so
//     every tour step still finds its control (docs/TOUR.md).
// Motion: the open / close follows DESIGN §13 (LinearTransition spring 247/30 for the rows below,
// a 160 ms fade for the pages, the chevron turns with the same spring).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Fragment, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MoreNavItem, MoreNavSection } from '@/features/more/nav';
import { themedStyles } from '@/theme/themed';
import { motion, palette, space } from '@/theme/tokens';
import { LIST_INSET, ListCard, ListRow, ModuleBadge, Skeleton, Text, TourTarget } from '@/ui';
import { useTourStore } from '@/ui/tour/store';

type OpenState = { open: string[]; toggle: (key: string) => void };

/** The folders left open, remembered on this phone. */
export const useMoreOpen = create<OpenState>()(
  persist(
    (set) => ({
      open: [],
      toggle: (key) =>
        set((s) => ({
          open: s.open.includes(key) ? s.open.filter((k) => k !== key) : [...s.open, key],
        })),
    }),
    {
      name: 'dash.more.open',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ open: s.open }),
    },
  ),
);

/** The spring every open / close uses (DESIGN §13). */
export const MORE_LAYOUT = LinearTransition.springify().stiffness(motion.layout.stiffness).damping(motion.layout.damping).mass(motion.layout.mass);
const SUB_BADGE = 32;

/** The control the tour is pointing at right now (null while no tour runs). */
function useTourFocus() {
  return useTourStore((s) => (s.run && (s.phase === 'seeking' || s.phase === 'showing') ? (s.run.steps[s.index]?.target ?? null) : null));
}

const countOf = (it: MoreNavItem) => (typeof it.count === 'number' && Number.isFinite(it.count) && it.count > 0 ? Math.round(it.count) : 0);

function Chevron({ open }: { open: boolean }) {
  const turn = useAnimatedStyle(() => ({
    transform: [{ rotate: withSpring(open ? '90deg' : '0deg', motion.layout) }],
  }));
  return (
    <Animated.View style={turn}>
      <ChevronRight size={18} color={palette.textMuted} />
    </Animated.View>
  );
}

function Wrap({ tourId, children }: { tourId?: string; children: ReactNode }) {
  return tourId ? <TourTarget id={tourId}>{children}</TourTarget> : <>{children}</>;
}

/** A single-page section: one row that opens the page. */
function PageRow({ item }: { item: MoreNavItem }) {
  const router = useRouter();
  const n = countOf(item);
  return (
    <Wrap tourId={item.tourId}>
      <ListRow
        left={<ModuleBadge module={item.module} icon={item.icon} />}
        title={item.label}
        subtitle={item.subtitle}
        subtitleLines={2}
        numberOfLines={2}
        right={n ? <CountPill n={n} /> : undefined}
        chevron
        onPress={() => router.push(item.href)}
      />
    </Wrap>
  );
}

function CountPill({ n }: { n: number }) {
  return (
    <View style={styles.count} accessibilityElementsHidden importantForAccessibility="no">
      <Text variant="caption" color={palette.onPrimary} style={styles.countText}>
        {n > 99 ? '99+' : n}
      </Text>
    </View>
  );
}

function Folder({ section, open, onToggle }: { section: MoreNavSection; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const names = section.items.map((i) => i.label).join(', ');
  const toRead = section.items.reduce((sum, i) => sum + countOf(i), 0);
  return (
    <Animated.View layout={MORE_LAYOUT}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${section.label}, ${section.items.length} pages: ${names}`}
        accessibilityHint={open ? 'Hides its pages' : 'Shows its pages'}
        style={({ pressed }) => [styles.press, pressed && { backgroundColor: palette.pressedTint }]}>
        <ListRow
          left={<ModuleBadge module={section.module} icon={section.icon} />}
          title={section.label}
          subtitle={names}
          subtitleLines={open ? 2 : 1}
          numberOfLines={2}
          right={
            <View style={styles.headRight}>
              {toRead ? <CountPill n={toRead} /> : null}
              <Chevron open={open} />
            </View>
          }
        />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(motion.fast)} exiting={FadeOut.duration(motion.instant)} style={styles.pages}>
          {section.items.map((item, i) => {
            const n = countOf(item);
            const heading = item.group && item.group !== section.items[i - 1]?.group ? item.group : null;
            return (
              <Fragment key={item.key}>
                {heading ? (
                  <Text variant="caption" muted accessibilityRole="header" style={styles.group}>
                    {heading}
                  </Text>
                ) : null}
                <Wrap tourId={item.tourId}>
                  <Pressable
                    onPress={() => router.push(item.href)}
                    accessibilityRole="button"
                    accessibilityLabel={[item.label, n ? `${n} to read` : null].filter(Boolean).join(', ')}
                    accessibilityHint={item.subtitle}
                    style={({ pressed }) => [styles.press, pressed && { backgroundColor: palette.pressedTint }]}>
                    <View style={styles.page}>
                      <ModuleBadge module={item.module} icon={item.icon} size={SUB_BADGE} />
                      <Text variant="body" numberOfLines={2} style={styles.pageText}>
                        {item.label}
                      </Text>
                      {n ? <CountPill n={n} /> : null}
                      <ChevronRight size={16} color={palette.textFaint} />
                    </View>
                  </Pressable>
                </Wrap>
              </Fragment>
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** The whole navigation card. */
export function MoreNavList({ sections }: { sections: MoreNavSection[] }) {
  const openKeys = useMoreOpen((s) => s.open);
  const toggle = useMoreOpen((s) => s.toggle);
  const focus = useTourFocus();
  if (!sections.length) return null;
  return (
    <Animated.View layout={MORE_LAYOUT}>
      <ListCard tone="surface">
        {sections.map((sec) =>
          sec.items.length === 1 ? (
            <Animated.View key={sec.key} layout={MORE_LAYOUT}>
              <PageRow item={sec.items[0]!} />
            </Animated.View>
          ) : (
            <Folder
              key={sec.key}
              section={sec}
              open={openKeys.includes(sec.key) || (!!focus && sec.items.some((i) => i.tourId === focus))}
              onToggle={() => toggle(sec.key)}
            />
          ),
        )}
      </ListCard>
    </Animated.View>
  );
}

/** Placeholder while access loads: the card's shape with six rows. */
export function MoreNavSkeleton() {
  return (
    <ListCard tone="surface">
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={styles.skeletonRow}
          accessibilityLabel={i === 0 ? 'Loading menu' : undefined}
          accessibilityRole={i === 0 ? 'progressbar' : undefined}>
          <Skeleton width={40} height={40} radius={20} />
          <View style={styles.skeletonText}>
            <Skeleton width="48%" height={12} radius={6} />
            <Skeleton width="72%" height={10} radius={5} />
          </View>
        </View>
      ))}
    </ListCard>
  );
}

const styles = themedStyles(() => ({
  press: { borderRadius: 16 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pages: { paddingLeft: LIST_INSET - space.xs, paddingBottom: space.xs },
  page: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingVertical: space.xs,
    paddingRight: space.md,
  },
  pageText: { flex: 1, minWidth: 0 },
  group: {
    paddingTop: space.xs,
    paddingBottom: 2,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 12, lineHeight: 16 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 64,
  },
  skeletonText: { flex: 1, gap: space.xs },
}));
