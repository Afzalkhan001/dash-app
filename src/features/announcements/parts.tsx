// Pieces of an announcement: its image (fetched on view), the celebration card for auto-posted
// birthdays / work anniversaries, the feed card, and the link / file actions. Mirrors what the web
// draws for each type (dash.html AnnouncementCard ~L18822, AnnouncementHeroSlide ~L18681).
//
// A feed card is kept to what you need to decide whether to open it: when it was posted, the title,
// two lines of the message and, if there is one, what is attached (a link's site, a file's name).
//
// The feed never shows more than one dark card per screen: celebrations are light glass cards in the
// feed (a tinted ring and icon carry the kind) and only the celebration's own screen gets the dark
// hero (CelebrationHero).

import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import {
  Award,
  Cake,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Image as ImageIcon,
  Link,
  Megaphone,
  Presentation,
  RotateCw,
  Video,
} from 'lucide-react-native';
import { type ComponentProps, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  ANN_TYPE_LABEL,
  type Announcement,
  annMediaCache,
  ANNIVERSARY_WISH,
  BIRTHDAY_WISH,
  isCelebration,
  safeLink,
  useAnnouncementMedia,
  useCelebrationPhoto,
} from '@/api/announcements';
import { dateLabel, dayLabel, istParts } from '@/lib/dates';
import { FileError, saveDataUrl, shareFile } from '@/lib/files';
import { themedStyles } from '@/theme/themed';
import { lightPalette, moduleTone, palette, radius, space } from '@/theme/tokens';
import { Avatar, Card, haptic, PressableScale, Skeleton, Text, useLayout } from '@/ui';

// Celebration tints: the ring and the icon carry the kind, the words say it. The bright tints are for
// the avatar ring, icons of 18 px or more and anything on the dark hero; small icons on light surfaces
// use the darker inks (docs/DESIGN.md §5). Shared with features/more/news-row.tsx. Tokens only: rose
// (coral) for birthdays, as on Home's celebrations. Functions, so they follow the light / dark switch
// (never read a token into a module-level constant).
export const birthdayTint = () => palette.coral;
export const birthdayInk = () => palette.coralInk; // 6.1:1 on white, 6.9:1 on the dark card
const anniversaryTint = () => palette.accent;
const tintOf = (a: Announcement) => (a.type === 'birthday' ? birthdayTint() : anniversaryTint());
const inkOf = (a: Announcement) => (a.type === 'birthday' ? birthdayInk() : palette.successInk);

// The icon for an announcement's type (a fixed component per type, so nothing is created in render).
export function TypeIcon({ type, size = 16, color = moduleTone.news.fg }: { type?: string; size?: number; color?: string }) {
  switch (type) {
    case 'link':
      return <Link size={size} color={color} />;
    case 'image':
      return <ImageIcon size={size} color={color} />;
    case 'video':
      return <Video size={size} color={color} />;
    case 'excel':
      return <FileSpreadsheet size={size} color={color} />;
    case 'ppt':
      return <Presentation size={size} color={color} />;
    case 'birthday':
      return <Cake size={size} color={color} />;
    case 'anniversary':
      return <Award size={size} color={color} />;
    default:
      return <Megaphone size={size} color={color} />;
  }
}

export const typeLabel = (a: Announcement) => ANN_TYPE_LABEL[String(a?.type || 'text')] ?? 'Update';

// `now` (ms) lets a screen pass the ticking value from useNow() so render stays pure; without it the
// clock is read here (fine in effects and event handlers).
const clock = (now?: number) => (typeof now === 'number' && Number.isFinite(now) ? now : Date.now());

// Published within the last `days` days (by createdAt).
export function postedWithin(a: Announcement, days: number, now?: number) {
  const t = Date.parse(a?.createdAt || '');
  return Number.isFinite(t) && t >= clock(now) - days * 86400000;
}

// "Today", "Yesterday", "Monday", then the app's date: "Mon, 12 Oct" ("Mon, 12 Oct 2025" outside
// this year) — India calendar days, written by lib/dates.
export function postedLabel(iso?: string, now?: number) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = istParts(new Date(clock(now))).date;
  const day = istParts(d).date;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return dayLabel(day, { weekday: 'long' });
  return dateLabel(day, today);
}

// ── Pressable card ───────────────────────────────────────────────────────────

/**
 * A tappable Card that screen readers announce by name. The kit Card's own `onPress` wraps it in an
 * unlabelled pressable, so a feed card would read as an empty "button"; this wraps it the same way
 * (same 0.985 press scale) with a label and a hint.
 */
export function PressableCard({
  onPress,
  accessibilityLabel,
  accessibilityHint,
  ...card
}: Omit<ComponentProps<typeof Card>, 'onPress' | 'accessibilityLabel' | 'accessibilityHint'> & {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>
      <Card {...card} />
    </PressableScale>
  );
}

// A screen-reader snippet of the text: whitespace collapsed, cut at a word near 120 characters.
function spoken(text?: string, max = 120) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 60 ? cut.slice(0, sp) : cut).trim()}…`;
}

/** What a screen reader says for an announcement card: kind, title (or the start of the text), when. */
export function announcementA11yLabel(a: Announcement, posted: string) {
  const lead = isCelebration(a)
    ? `${a.type === 'birthday' ? 'Birthday' : 'Work anniversary'}: ${a.targetName || 'A colleague'}`
    : `${typeLabel(a)}: ${spoken(a.title) || spoken(a.body) || 'Announcement'}`;
  return [lead, posted ? `posted ${posted}` : ''].filter(Boolean).join(', ');
}

// ── Link / files ─────────────────────────────────────────────────────────────

// Longest admin-written call-to-action that still fits a full-width button at 360 dp and 1.3× text
// (docs/DESIGN.md A16: 22 or fewer for a single button, minus room for the icon).
const CTA_MAX = 20;
const ctaTextOf = (a: Announcement) => (a.type === 'link' ? '' : String(a?.ctaText || '').trim());

/**
 * A button label for the link: a link announcement's raw URL would never fit on a button, and a long
 * call-to-action becomes "Open link" (the screen shows the full text with ctaFullText).
 */
export const ctaButtonLabel = (a: Announcement) => {
  if (a.type === 'link') return 'Open link';
  const t = ctaTextOf(a);
  if (!t) return 'Explore now';
  return t.length <= CTA_MAX ? t : 'Open link';
};

/** The admin's call-to-action text when it was too long for the button, so it can be shown in full; '' otherwise. */
export const ctaFullText = (a: Announcement) => {
  const t = ctaTextOf(a);
  return t.length > CTA_MAX ? t : '';
};

/** "forms.google.com" for the link, or '' when it can't be opened. */
export function linkHost(a: Announcement) {
  const href = safeLink(a?.linkUrl);
  const m = href ? /^https?:\/\/([^/?#:]+)/i.exec(href) : null;
  return m ? m[1]!.replace(/^www\./i, '') : '';
}

export async function openAnnouncementLink(a: Announcement) {
  const href = safeLink(a.linkUrl);
  if (!href) {
    Alert.alert('Link unavailable', 'This link cannot be opened in the app.');
    return;
  }
  haptic.select();
  try {
    await WebBrowser.openBrowserAsync(href);
  } catch {
    Alert.alert('Couldn’t open the link', href);
  }
}

const MIME: Record<string, string> = {
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function fileNameFor(a: Announcement, dataUrl: string) {
  if (a.fileName) return a.fileName;
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? '';
  const ext = a.type === 'excel' ? 'xlsx' : a.type === 'ppt' ? 'pptx' : mime.split('/')[1] || 'bin';
  return `announcement.${ext}`;
}

// The file behind an excel / ppt / video / image announcement → the share sheet (save, open with…).
export async function shareAnnouncementFile(a: Announcement) {
  try {
    const dataUrl = await annMediaCache.load(a.id);
    if (!dataUrl) throw new FileError('This announcement has no file attached.');
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || MIME[a.type || ''] || undefined;
    const uri = await saveDataUrl(dataUrl, fileNameFor(a, dataUrl));
    await shareFile(uri, mime, a.title || 'Announcement');
  } catch (e) {
    Alert.alert('Couldn’t open the file', e instanceof FileError ? e.message : 'The file could not be downloaded. Try again.');
  }
}

// ── Image ────────────────────────────────────────────────────────────────────

export function AnnouncementImage({ ann, rounded = true }: { ann: Announcement; rounded?: boolean }) {
  const { value, status, retry } = useAnnouncementMedia(ann);
  const [ratio, setRatio] = useState(16 / 9);
  if (!ann.hasMedia || value === '') return null;
  const r = rounded ? { borderRadius: radius.xl } : null;
  if (!value) {
    return (
      <View style={[styles.mediaBox, r, { aspectRatio: 16 / 9 }]}>
        {status === 'error' ? (
          <Pressable
            onPress={retry}
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Couldn’t load the image. Try again">
            <RotateCw size={18} color={palette.textMuted} />
            <Text variant="label" muted align="center">
              Couldn’t load the image. Tap to try again.
            </Text>
          </Pressable>
        ) : (
          <Skeleton height={0} radius={0} style={styles.mediaSkeleton} />
        )}
      </View>
    );
  }
  return (
    <Image
      source={{ uri: value }}
      style={[styles.media, r, { aspectRatio: ratio }]}
      contentFit="cover"
      transition={200}
      accessibilityLabel={ann.title || 'Announcement image'}
      onLoad={(e) => {
        const { width, height } = e.source;
        if (width && height) setRatio(Math.min(2.2, Math.max(0.65, width / height)));
      }}
    />
  );
}

// ── Celebration (auto-posted birthday / work anniversary) ───────────────────

function celebrationSub(ann: Announcement) {
  if (ann.type === 'birthday') return '';
  const years = Number.isFinite(ann.years) ? Number(ann.years) : null;
  return [years ? `${years} ${years === 1 ? 'year' : 'years'} of service` : null, ann.jobTitle, ann.department].filter(Boolean).join(' · ');
}

/** The dark celebration hero (the celebration's own screen). `compact` lays it out as a row. */
export function CelebrationHero({ ann, compact }: { ann: Announcement; compact?: boolean }) {
  const { value } = useCelebrationPhoto(ann);
  const bday = ann.type === 'birthday';
  const name = ann.targetName || 'A colleague';
  const sub = celebrationSub(ann);
  const size = compact ? 56 : 112;
  // On the dark vermilion hero the rose tint would nearly vanish, so a birthday's ring and icon use
  // the light rose wash there. The hero gradient is the same in both themes, so it is the LIGHT
  // palette's wash in dark mode too (dark coralSoft is a deep wine that would vanish on it).
  const tint = bday ? lightPalette.coralSoft : tintOf(ann);
  const align = compact ? 'left' : 'center';
  return (
    <View style={[styles.celeb, compact ? styles.celebCompact : styles.celebFull]}>
      <View style={[styles.ring, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2, borderColor: tint }]}>
        <Avatar name={name} uri={value || null} size={size} />
      </View>
      <View style={compact ? styles.celebText : styles.celebTextFull}>
        {/* The colour sits in the icon; the words stay white (no small coloured text on dark). */}
        <View style={[styles.eyebrow, !compact && { justifyContent: 'center' }]}>
          {bday ? <Cake size={16} color={tint} /> : <Award size={16} color={tint} />}
          <Text variant="labelStrong" color={palette.onPrimaryMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {bday ? 'Happy Birthday' : 'Happy Work Anniversary'}
          </Text>
        </View>
        <Text variant={compact ? 'heading' : 'title'} color={palette.onPrimary} align={align} numberOfLines={2} accessibilityRole="header">
          {name}
        </Text>
        {sub ? (
          <Text variant="label" color={palette.onPrimaryMuted} align={align} numberOfLines={compact ? 1 : 2}>
            {sub}
          </Text>
        ) : null}
        {!compact ? (
          <Text variant="body" color={palette.onPrimary} align="center" style={{ marginTop: space.sm }}>
            {ann.body || (bday ? BIRTHDAY_WISH : ANNIVERSARY_WISH)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// Celebration in the feed: a light card (the feed may hold several).
function CelebrationFeedCard({ ann, onPress, now }: { ann: Announcement; onPress: () => void; now?: number }) {
  const { value } = useCelebrationPhoto(ann);
  const bday = ann.type === 'birthday';
  const name = ann.targetName || 'A colleague';
  const sub = celebrationSub(ann);
  const tint = tintOf(ann);
  const ink = inkOf(ann);
  const posted = postedLabel(ann.createdAt, now);
  const label = [announcementA11yLabel(ann, posted), sub].filter(Boolean).join('. ');
  return (
    <PressableCard onPress={onPress} accessibilityLabel={label} accessibilityHint="Opens the celebration" style={styles.celebCard}>
      <View style={[styles.ring, styles.ringSmall, { borderColor: tint }]}>
        <Avatar name={name} uri={value || null} size={52} />
      </View>
      <View style={styles.celebText}>
        <View style={styles.eyebrow}>
          {bday ? <Cake size={14} color={ink} /> : <Award size={14} color={ink} />}
          <Text variant="label" muted numberOfLines={1} style={{ flexShrink: 1 }}>
            {bday ? 'Birthday' : 'Work anniversary'}
          </Text>
        </View>
        <Text variant="heading" numberOfLines={2}>
          {name}
        </Text>
        {sub ? (
          <Text variant="label" muted numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        {posted ? (
          <Text variant="caption" muted numberOfLines={1}>
            {posted}
          </Text>
        ) : null}
      </View>
    </PressableCard>
  );
}

// ── Feed card ────────────────────────────────────────────────────────────────

// What is attached, in a few words: the link's site, the file's name, or "Video".
function attachmentOf(ann: Announcement) {
  const hasFile = (ann.type === 'excel' || ann.type === 'ppt' || ann.type === 'video') && !!ann.hasMedia;
  if (ann.linkUrl) return { kind: 'link' as const, text: linkHost(ann) || 'Link' };
  if (hasFile && ann.type === 'video') return { kind: 'video' as const, text: 'Video' };
  if (hasFile) return { kind: 'file' as const, text: ann.fileName || 'Attachment' };
  return null;
}

export function AnnouncementCard({ ann, onPress, now }: { ann: Announcement; onPress: () => void; now?: number }) {
  const { cardPad } = useLayout();
  if (isCelebration(ann)) return <CelebrationFeedCard ann={ann} onPress={onPress} now={now} />;
  const posted = postedLabel(ann.createdAt, now);
  const extra = attachmentOf(ann);
  const extraSpoken = extra ? (extra.kind === 'link' ? 'Has a link' : extra.kind === 'video' ? 'Has a video' : 'Has an attachment') : '';
  const label = [announcementA11yLabel(ann, posted), extraSpoken].filter(Boolean).join('. ');
  return (
    <PressableCard onPress={onPress} accessibilityLabel={label} accessibilityHint="Opens the announcement" padded={false} style={styles.clip}>
      {ann.type === 'image' ? <AnnouncementImage key={ann.id} ann={ann} rounded={false} /> : null}
      <View style={{ padding: cardPad, gap: space.xs }}>
        {posted ? (
          <Text variant="caption" muted numberOfLines={1}>
            {posted}
          </Text>
        ) : null}
        {ann.title ? (
          <Text variant="heading" numberOfLines={2}>
            {ann.title}
          </Text>
        ) : null}
        {ann.body ? (
          <Text variant="body" muted numberOfLines={2}>
            {ann.body}
          </Text>
        ) : null}
        {extra ? (
          <View style={styles.inlineAction}>
            {extra.kind === 'link' ? (
              <ExternalLink size={14} color={palette.textMuted} style={{ flexShrink: 0 }} />
            ) : extra.kind === 'video' ? (
              <Video size={14} color={palette.textMuted} style={{ flexShrink: 0 }} />
            ) : (
              <Download size={14} color={palette.textMuted} style={{ flexShrink: 0 }} />
            )}
            <Text variant="label" muted numberOfLines={1} style={{ flexShrink: 1 }}>
              {extra.text}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableCard>
  );
}

/** Loading placeholder shaped like a feed card. */
export function AnnouncementCardSkeleton({ image }: { image?: boolean }) {
  const { cardPad } = useLayout();
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {image ? (
        <View style={{ aspectRatio: 16 / 9 }}>
          <Skeleton height={0} radius={0} style={styles.mediaSkeleton} />
        </View>
      ) : null}
      <View style={{ padding: cardPad, gap: space.sm }}>
        <Skeleton height={12} width={56} radius={6} />
        <Skeleton height={18} width="80%" radius={6} />
        <Skeleton height={12} radius={6} />
        <Skeleton height={12} width="60%" radius={6} />
      </View>
    </Card>
  );
}

const styles = themedStyles(() => ({
  clip: { overflow: 'hidden' },
  mediaBox: { width: '100%', backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mediaSkeleton: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100%' },
  media: { width: '100%', backgroundColor: palette.surfaceMuted },
  retry: { alignItems: 'center', gap: space.xs, padding: space.lg, minHeight: 48, justifyContent: 'center' },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  celeb: { gap: space.md },
  celebCompact: { flexDirection: 'row', alignItems: 'center' },
  celebFull: { alignItems: 'center', paddingVertical: space.sm },
  celebText: { flex: 1, minWidth: 0, gap: 2 },
  celebTextFull: { alignSelf: 'stretch', alignItems: 'center', gap: space.xxs },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, flexShrink: 0 },
  ringSmall: { width: 64, height: 64, borderRadius: 32 },
  celebCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
}));
