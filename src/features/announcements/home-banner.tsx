// Company announcements on Home: an "Announcements" section (kit SectionHeader, "See all" → the full
// list) over a swipeable carousel — the app's take on the website's announcement slideshow
// (dash.html AnnouncementsInlineSlideshow ~L19214 on the Announcements page, and the Home banner strip
// HomeAnnouncementBanner ~L19322).
//
// Which announcements: exactly the website's set — GET /announcements, then announcementVisible()
// (published: not scheduled for later, not past its expiry day; my branch or "all"; the auto-posted
// birthday / anniversary cards only while HR has them switched on), pop-ups left out, newest first
// (api/announcements useVisibleAnnouncements, the same feed the "See all" list shows). Before this,
// Home only showed the few posts that carried a Home Banner Image, or else the single newest post
// from the last two weeks — that is why the app showed fewer than the website.
// Home leaves out the birthday / work-anniversary cards here because its Celebrations section (at the
// top of Home) already shows them; they are still in "See all". At most MAX_SLIDES slides.
//
// Each slide is a full-width card that opens the announcement when tapped:
//   - Home Banner Image  → the artwork alone, edge to edge (the website draws nothing over it);
//   - image post         → its picture, with the title on a dark scrim at the bottom (a "full bleed"
//                          poster is shown whole, on its colour, with nothing over it);
//   - anything else      → a styled text card on a module gradient: type chip, when it was posted,
//                          the title and two lines of the text, and what is attached (a link's site,
//                          a video, a file).
// While a picture loads (or if it fails) the text card shows instead, so a slide is never blank.
// The carousel moves on by itself every 7 s (the website's pace) and pauses while it is touched or
// dragged; it never moves on its own with Reduce Motion or a screen reader on. Page dots sit under it.
//
// Light / dark: the slides are coloured cards with white text in both schemes (module gradients from
// theme/tokens, read at render time); the page dots and the section use the live palette.

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Download, ExternalLink, Video } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { type Announcement, isCelebration, useAnnouncementBanner, useAnnouncementMedia, useVisibleAnnouncements } from '@/api/announcements';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { announcementA11yLabel, linkHost, postedLabel, TypeIcon, typeLabel } from '@/features/announcements/parts';
import { useNow } from '@/features/attendance/use-now';
import { canSeeAnnouncements } from '@/features/more/menu';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { SectionHeader, Text, useLayout } from '@/ui';

const MAX_SLIDES = 10;
const ROTATE_MS = 7000; // same pace as the website's slideshow

// The text cards take turns over a few calm module gradients, so neighbouring slides differ. Read at
// render time (never a module-level token read).
const TEXT_TONES = ['news', 'visitors', 'leave', 'policies'] as const;
const slideGradient = (i: number) => moduleTone[TEXT_TONES[i % TEXT_TONES.length]!].gradient;

// What is attached, in a few words (for the text card's last line).
function attachment(a: Announcement) {
  if (a.linkUrl) return { kind: 'link' as const, text: linkHost(a) || 'Link' };
  if (a.type === 'video' && a.hasMedia) return { kind: 'video' as const, text: 'Video' };
  if ((a.type === 'excel' || a.type === 'ppt') && a.hasMedia) return { kind: 'file' as const, text: a.fileName || 'Attachment' };
  return null;
}

// The styled text card (also what shows under a picture while it loads).
function TextSlide({ ann, index, now, roomy }: { ann: Announcement; index: number; now: number; roomy: boolean }) {
  const white = palette.onPrimary;
  const muted = palette.onPrimaryMuted;
  const posted = postedLabel(ann.createdAt, now);
  const extra = attachment(ann);
  const ExtraIcon = extra?.kind === 'link' ? ExternalLink : extra?.kind === 'video' ? Video : Download;
  return (
    <View style={styles.fill}>
      <LinearGradient colors={slideGradient(index)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.textSlide}>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <TypeIcon type={ann.type} size={14} color={white} />
            <Text variant="labelStrong" color={white} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {typeLabel(ann)}
            </Text>
          </View>
          {posted ? (
            <Text variant="caption" color={muted} numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shrink}>
              {posted}
            </Text>
          ) : null}
        </View>
        <View style={styles.textBody}>
          <Text variant="heading" color={white} numberOfLines={2} maxFontSizeMultiplier={1.4}>
            {ann.title || 'Announcement'}
          </Text>
          {ann.body ? (
            <Text variant="label" color={muted} numberOfLines={roomy ? 2 : 1} maxFontSizeMultiplier={1.4}>
              {ann.body}
            </Text>
          ) : null}
        </View>
        {extra ? (
          <View style={styles.extra}>
            <ExtraIcon size={14} color={muted} />
            <Text variant="caption" color={muted} numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shrink}>
              {extra.text}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// A picture slide: the Home Banner Image (artwork alone) or an image post's own picture.
function PictureLayer({ ann, banner, index }: { ann: Announcement; banner: boolean; index: number }) {
  const bannerArt = useAnnouncementBanner(ann, banner);
  const media = useAnnouncementMedia(ann, !banner);
  const uri = banner ? bannerArt.value : media.value;
  if (!uri) return null;
  const poster = !banner && !!ann.fullBleed;
  return (
    <View style={StyleSheet.absoluteFill}>
      {poster ? <LinearGradient colors={slideGradient(index)} style={StyleSheet.absoluteFill} /> : null}
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={poster ? 'contain' : 'cover'} transition={200} />
      {banner || poster ? null : (
        <>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.68)']} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.caption}>
            <Text variant="heading" color={palette.onPrimary} numberOfLines={2} maxFontSizeMultiplier={1.4}>
              {ann.title || 'Announcement'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function Slide({
  ann,
  index,
  total,
  width,
  height,
  now,
  roomy,
  onPress,
}: {
  ann: Announcement;
  index: number;
  total: number;
  width: number;
  height: number;
  now: number;
  roomy: boolean;
  onPress: () => void;
}) {
  const banner = !!ann.hasHomeBanner;
  const picture = banner || (ann.type === 'image' && !!ann.hasMedia);
  const posted = postedLabel(ann.createdAt, now);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${announcementA11yLabel(ann, posted)}${total > 1 ? `. ${index + 1} of ${total}` : ''}`}
      accessibilityHint="Opens the announcement"
      style={({ pressed }) => [{ width, height }, styles.slideOuter, pressed && styles.pressed]}>
      <View style={styles.slide}>
        <TextSlide ann={ann} index={index} now={now} roomy={roomy} />
        {picture ? <PictureLayer ann={ann} banner={banner} index={index} /> : null}
      </View>
    </Pressable>
  );
}

function Carousel({ items, now }: { items: Announcement[]; now: number }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { fontScale } = useLayout();
  const scroller = useRef<ScrollView>(null);
  const current = useRef(0);
  const [width, setWidth] = useState(0);
  const [idx, setIdx] = useState(0);
  const [held, setHeld] = useState(false);
  const [reader, setReader] = useState(false);
  const n = items.length;
  const shown = Math.min(idx, Math.max(0, n - 1));

  // No moving on its own while a screen reader is on (it would pull the focus away). On the web
  // react-native-web always answers "on" (it cannot tell), so the web preview skips the check.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => live && setReader(!!on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => setReader(!!on));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);

  // Moves on every 7 s, paused while touched; the timer starts over after each touch.
  useEffect(() => {
    if (n < 2 || !width || held || reduced || reader) return;
    const t = setInterval(() => {
      const next = (current.current + 1) % n;
      current.current = next;
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setIdx(next);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [n, width, held, reduced, reader]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.max(0, Math.min(n - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (i !== current.current) {
      current.current = i;
      setIdx(i);
    }
  };
  const open = (a: Announcement) => router.push(`/announcements/${encodeURIComponent(String(a.id))}`);

  // A wide card (about 16:9), taller with large text so the title and a line of text still fit.
  const roomy = fontScale <= 1.15;
  const base = Math.round(width * 0.56);
  const height = Math.max(roomy ? 176 : 216, Math.min(240, base));

  return (
    <View style={styles.carousel}>
      <View onLayout={onLayout} style={[styles.track, { minHeight: height }]}>
        {width > 0 ? (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={onScroll}
            onTouchStart={() => setHeld(true)}
            onTouchEnd={() => setHeld(false)}
            onTouchCancel={() => setHeld(false)}
            onScrollBeginDrag={() => setHeld(true)}
            onMomentumScrollEnd={() => setHeld(false)}>
            {items.map((a, i) => (
              <Slide key={a.id} ann={a} index={i} total={n} width={width} height={height} now={now} roomy={roomy} onPress={() => open(a)} />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {n > 1 ? (
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {items.map((a, i) => (
            <View key={a.id} style={[styles.dot, i === shown && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export type HomeAnnouncements = { items: Announcement[]; now: number };

/**
 * What Home's Announcements section shows: the website's visible feed (newest first, no pop-ups),
 * without the celebration cards, at most MAX_SLIDES. null when there is nothing (not allowed, still
 * loading, or no posts) — then Home renders nothing.
 */
export function useHomeAnnouncements(): HomeAnnouncements | null {
  const role = useSession((s) => s.user?.role);
  const tenant = useMyTenant().data;
  const now = useNow();
  const allowed = canSeeAnnouncements(role, tenant);
  const { feed, isLoading } = useVisibleAnnouncements();
  if (!allowed || isLoading) return null;
  const items = (Array.isArray(feed) ? feed : []).filter((a) => a && a.id != null && !isCelebration(a)).slice(0, MAX_SLIDES);
  if (!items.length) return null;
  return { items, now };
}

/** Home's Announcements section. Pass useHomeAnnouncements()'s result; render it only when not null. */
export function AnnouncementBanner({ data }: { data: HomeAnnouncements }) {
  const router = useRouter();
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Announcements" onAction={() => router.push('/announcements')} actionAccessibilityLabel="See all announcements" />
      <Carousel items={items} now={data.now} />
    </View>
  );
}

const styles = themedStyles(() => ({
  // The same gap as the kit ActivityList: the SectionHeader, then 4 above the content.
  section: { gap: space.xxs },
  carousel: { gap: space.xs },
  track: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  slideOuter: { overflow: 'hidden' },
  slide: { flex: 1, borderRadius: radius.xl, overflow: 'hidden' },
  pressed: { opacity: 0.92 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  textSlide: { flex: 1, padding: space.md, gap: space.xs, justifyContent: 'space-between' },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.frostOnDark,
    borderWidth: 1,
    borderColor: palette.frostEdgeOnDark,
    flexShrink: 1,
  },
  textBody: { gap: 2 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  caption: { position: 'absolute', left: space.md, right: space.md, bottom: space.md },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.track },
  dotOn: { width: 18, backgroundColor: palette.primary },
}));
