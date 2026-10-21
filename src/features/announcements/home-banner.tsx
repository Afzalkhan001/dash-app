// Company news on Home: a "News" section (the More tile's name for announcements) with a "See all"
// link (→ the full list), under the same kit SectionHeader as Home's other sections (docs/REFERENCE-
// COMPONENTS.md item 6), over, in order of preference:
//   1. the Home-banner announcements (the ones HR published "with a Home Banner Image") as a
//      swipeable strip of their artwork — what the web's HomeAnnouncementBanner shows (dash.html
//      ~L19322); tapping always opens the announcement (its link is the button there);
//   2. otherwise one news card for the newest announcement from the last two weeks: a frosted card
//      (kit ActivityList / ActivityRow) with its type's icon in the News colour, the title (2 lines)
//      over "Latest · Today", and a chevron;
//   3. otherwise nothing — no placeholder, like the web.
// useHomeAnnouncements() decides which (null for "nothing"), so Home can leave the section out
// entirely instead of rendering an empty slot; <AnnouncementBanner data={…}/> draws it.
// Pop-ups (kind 'popup') are a website-only feature and are not shown in the app.
// The strip rotates on its own (every 7 s, like the web) until it is swiped — and never with the
// system's Reduce Motion setting on.
//
// Light / dark: the News tint is read at render time (theme/tokens moduleTone, a dark tint of the same
// blue in dark mode); the strip's page dots sit on the artwork itself, so they stay white.

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { type Announcement, isCelebration, useAnnouncementBanner, useVisibleAnnouncements } from '@/api/announcements';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { announcementA11yLabel, postedLabel, postedWithin, TypeIcon } from '@/features/announcements/parts';
import { useNow } from '@/features/attendance/use-now';
import { canSeeAnnouncements } from '@/features/more/menu';
import { gradient, moduleTone, palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActivityList, ActivityRow, SectionHeader } from '@/ui';

const RECENT_DAYS = 14;
const ROTATE_MS = 7000; // same pace as the web's banner

function BannerSlide({
  ann,
  width,
  ratio,
  index,
  total,
  onRatio,
  onPress,
}: {
  ann: Announcement;
  width: number;
  ratio: number;
  index: number;
  total: number;
  onRatio: (r: number) => void;
  onPress: () => void;
}) {
  const { value } = useAnnouncementBanner(ann);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ann.title || 'Announcement'}${total > 1 ? `, ${index + 1} of ${total}` : ''}`}
      accessibilityHint="Opens the announcement"
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.92 }]}>
      <View style={[styles.slide, { aspectRatio: ratio }]}>
        {value ? (
          <Image
            source={{ uri: value }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            onLoad={(e) => {
              const { width: w, height: h } = e.source;
              if (w && h) onRatio(Math.min(3.2, Math.max(1.2, w / h)));
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function BannerStrip({ items }: { items: Announcement[] }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [idx, setIdx] = useState(0);
  const [ratio, setRatio] = useState(16 / 7);
  const [touched, setTouched] = useState(false);
  const current = useRef(0);

  // Rotates every 7 s like the web, until the person swipes it themselves.
  useEffect(() => {
    if (items.length < 2 || !width || touched || reduced) return;
    const t = setInterval(() => {
      const next = (current.current + 1) % items.length;
      scroller.current?.scrollTo({ x: next * width, animated: true });
      current.current = next;
      setIdx(next);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [items.length, width, touched, reduced]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
    current.current = i;
    setIdx(i);
  };
  // Always the announcement itself, so its text can be read in the app; its link is the primary
  // button there.
  const open = (a: Announcement) => router.push(`/announcements/${encodeURIComponent(String(a.id))}`);

  return (
    <View onLayout={onLayout} style={styles.strip}>
      {/* The brand gradient shows while the artwork loads (and behind any transparent parts). */}
      <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => setTouched(true)}
          onMomentumScrollEnd={onEnd}>
          {items.map((a, i) => (
            <BannerSlide
              key={a.id}
              ann={a}
              width={width}
              ratio={ratio}
              index={i}
              total={items.length}
              onRatio={(r) => i === 0 && setRatio(r)}
              onPress={() => open(a)}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.slide, { aspectRatio: ratio }]} />
      )}
      {items.length > 1 ? (
        <View style={styles.dots} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {items.map((a, i) => (
            <View key={a.id} style={[styles.dot, i === idx && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// The newest recent announcement as one list row: its type's icon in the News colour, the title (2
// lines) over "Latest · Today", and a chevron (it opens the announcement).
function LatestRow({ ann, now }: { ann: Announcement; now: number }) {
  const router = useRouter();
  const posted = postedLabel(ann.createdAt, now);
  return (
    <ActivityRow
      left={
        // News wears the News module's colour (theme/tokens moduleTone), like its tile on More.
        <View style={styles.newsBadge}>
          <TypeIcon type={ann.type} size={20} color={moduleTone.news.fg} />
        </View>
      }
      title={ann.title || ann.body || 'New announcement'}
      subtitle={posted ? `Latest · ${posted}` : 'Latest'}
      chevron
      onPress={() => router.push(`/announcements/${encodeURIComponent(String(ann.id))}`)}
      accessibilityLabel={`Latest announcement. ${announcementA11yLabel(ann, posted)}`}
      accessibilityHint="Opens the announcement"
    />
  );
}

export type HomeAnnouncements = { strip: Announcement[]; latest?: Announcement; now: number };

/**
 * What Home's news section shows: the banner strip, or else the newest recent announcement. null
 * when there is nothing (not allowed, still loading, or nothing to show) — then render nothing.
 */
export function useHomeAnnouncements(): HomeAnnouncements | null {
  const role = useSession((s) => s.user?.role);
  const tenant = useMyTenant().data;
  const now = useNow();
  const allowed = canSeeAnnouncements(role, tenant);
  const { feed, banners, isLoading } = useVisibleAnnouncements();
  if (!allowed || isLoading) return null;
  const strip = (Array.isArray(banners) ? banners : []).filter((a) => a && a.id != null);
  const latest = strip.length
    ? undefined
    : (Array.isArray(feed) ? feed : []).find((a) => a && !isCelebration(a) && postedWithin(a, RECENT_DAYS, now));
  if (!strip.length && !latest) return null;
  return { strip, latest, now };
}

/** Home's news section. Pass useHomeAnnouncements()'s result; render it only when that is not null. */
export function AnnouncementBanner({ data }: { data: HomeAnnouncements }) {
  const router = useRouter();
  const strip = Array.isArray(data?.strip) ? data.strip : [];
  const latest = data?.latest;
  if (!strip.length && !latest) return null;
  const seeAll = () => router.push('/announcements');
  if (!strip.length && latest) {
    return (
      <ActivityList title="News" onSeeAll={seeAll} seeAllAccessibilityLabel="See all news">
        <LatestRow ann={latest} now={data.now} />
      </ActivityList>
    );
  }
  // The artwork strip sits under the same head as the lists (title left, "See all" right).
  return (
    <View style={styles.section}>
      <SectionHeader title="News" onAction={seeAll} actionAccessibilityLabel="See all news" />
      <BannerStrip items={strip} />
    </View>
  );
}

const styles = themedStyles(() => ({
  strip: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: palette.primary },
  slide: { width: '100%' },
  dots: { position: 'absolute', bottom: 10, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  // On the artwork (any scheme): translucent white, like a photo carousel's dots.
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { width: 16, backgroundColor: palette.onPrimary },
  newsBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: moduleTone.news.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // The same gap as the kit ActivityList: the SectionHeader, then 4 above the content.
  section: { gap: space.xxs },
}));
