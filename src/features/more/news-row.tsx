// The News list's pieces (docs/REFERENCE-COMPONENTS.md, Payno: one hero, then a "recent activity" list):
//   CelebrationTiles  today's birthdays and work anniversaries as the kit AvatarTiles row (photo or
//             initials, the colleague's name, "Birthday" / "4 years"); a tile opens the celebration.
//   NewsHero  the newest post as the screen's one big frosted card (the stronger frost):
//             the picture (picture posts) edge to edge on top, then a small muted line with the post's
//             type icon and when it was posted, the title, three lines of the message and what is
//             attached. A birthday / work anniversary shows the colleague's photo in its tinted ring,
//             the kind, their name and their role instead.
//   NewsRow   one earlier post as a list row: a 40 dp leading picture (the image itself for picture
//             posts, the colleague's photo / initials for a birthday or work anniversary, else the post
//             type's icon on the News tint), the title (2 lines) over two muted lines of the message
//             (for a celebration: the kind, years of service, job title and team), then one small line:
//             when it was posted ("Today", "Yesterday", "Monday", "Mon, 12 Oct") and what is attached
//             (a link's site, a file's name, "Video"). The day sits under the text, not in a right
//             column, so a long title keeps the full row width on a 320 dp phone.
// Pictures are fetched only for picture posts and only while the card / row is on screen (the same
// lazy media cache the feed card used). Colours only from tokens (the celebration tints are the
// shared constants from features/announcements/parts).

import { Image } from 'expo-image';
import { Award, Cake, Download, ExternalLink, Video } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { type Announcement, isCelebration, useAnnouncementMedia, useCelebrationPhoto } from '@/api/announcements';
import {
  AnnouncementImage,
  announcementA11yLabel,
  birthdayInk,
  birthdayTint,
  linkHost,
  postedLabel,
  PressableCard,
  TypeIcon,
  typeLabel,
} from '@/features/announcements/parts';
import { useCelebrationPhotos } from '@/features/people/photos';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import { ActivityRow, Avatar, AvatarTiles, Card, Skeleton, Text, useLayout } from '@/ui';
const LEAD = 40;
const HERO_PHOTO = 56;
const HERO_RING = 2;
const HERO_GAP = 4;

type Extra = { kind: 'link' | 'video' | 'file'; spoken: string; text: string };

function attachmentOf(ann: Announcement): Extra | null {
  const hasFile = (ann.type === 'excel' || ann.type === 'ppt' || ann.type === 'video') && !!ann.hasMedia;
  if (ann.linkUrl) return { kind: 'link', spoken: 'Has a link', text: linkHost(ann) || 'Link' };
  if (hasFile && ann.type === 'video') return { kind: 'video', spoken: 'Has a video', text: 'Video' };
  if (hasFile) return { kind: 'file', spoken: 'Has an attachment', text: ann.fileName || 'Attachment' };
  return null;
}

// The first line of the message, for a post with no title.
const firstLine = (text?: string) => String(text || '').trim().split(/\n+/)[0]?.trim() || '';

const yearsOf = (ann: Announcement) => (Number.isFinite(ann.years) && Number(ann.years) > 0 ? Number(ann.years) : null);

// "4 years of service · Sound engineer · Audio" (anniversary) or "Sound engineer · Audio" (birthday).
function celebrationDetail(ann: Announcement) {
  const years = ann.type === 'birthday' ? null : yearsOf(ann);
  return [years ? `${years} ${years === 1 ? 'year' : 'years'} of service` : null, ann.jobTitle, ann.department]
    .map((s) => (typeof s === 'string' ? s.trim() : s))
    .filter(Boolean)
    .join(' · ');
}

const kindWord = (ann: Announcement) => (ann.type === 'birthday' ? 'Birthday' : 'Work anniversary');

// ── Row ──────────────────────────────────────────────────────────────────────

function Lead({ ann }: { ann: Announcement }) {
  const celebration = isCelebration(ann);
  const picture = ann.type === 'image' && !!ann.hasMedia;
  const media = useAnnouncementMedia(picture ? ann : null);
  const photo = useCelebrationPhoto(celebration ? ann : null);
  if (celebration) return <Avatar name={ann.targetName || 'A colleague'} uri={photo.value || null} size={LEAD} ring={false} />;
  if (picture && media.value) {
    return <Image source={{ uri: media.value }} style={styles.thumb} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={styles.badge}>
      <TypeIcon type={ann.type} size={20} color={moduleTone.news.fg} />
    </View>
  );
}

export function NewsRow({ ann, now, onPress }: { ann: Announcement; now: number; onPress: () => void }) {
  const celebration = isCelebration(ann);
  const posted = postedLabel(ann.createdAt, now);
  const extra = attachmentOf(ann);
  const detail = celebration ? celebrationDetail(ann) : '';
  const title = celebration ? ann.targetName || 'A colleague' : ann.title?.trim() || firstLine(ann.body) || typeLabel(ann);
  const subtitle = celebration
    ? [kindWord(ann), detail].filter(Boolean).join(' · ')
    : ann.title?.trim()
      ? String(ann.body || '').trim() || null
      : null;
  return (
    <ActivityRow
      left={<Lead ann={ann} />}
      title={title}
      subtitle={subtitle}
      note={[posted, extra?.text].filter(Boolean).join(' · ') || null}
      onPress={onPress}
      accessibilityLabel={[announcementA11yLabel(ann, posted), detail, extra?.spoken].filter(Boolean).join('. ')}
      accessibilityHint={celebration ? 'Opens the celebration' : 'Opens the announcement'}
    />
  );
}

// ── Celebrations row ─────────────────────────────────────────────────────────

/** "Birthday", or "4 years" / "Work anniversary" for an anniversary. */
function tileSub(ann: Announcement) {
  if (ann.type === 'birthday') return 'Birthday';
  const years = yearsOf(ann);
  return years ? `${years} ${years === 1 ? 'year' : 'years'}` : 'Work anniversary';
}

/**
 * Today's birthdays and work anniversaries as one horizontal row of frosted tiles (Payno "Recent
 * Recipients"): the colleague's photo or initials, their name and "Birthday" / "4 years". A tile
 * opens the celebration. Nothing when there are none.
 */
export function CelebrationTiles({ posts, now, onOpen }: { posts: Announcement[]; now: number; onOpen: (a: Announcement) => void }) {
  const list = (Array.isArray(posts) ? posts : []).filter((a) => !!a && isCelebration(a));
  const photoOf = useCelebrationPhotos(list);
  if (!list.length) return null;
  return (
    <AvatarTiles
      accessibilityLabel="Celebrations"
      items={list.map((a) => {
        const name = a.targetName || 'A colleague';
        const posted = postedLabel(a.createdAt, now);
        return {
          key: String(a.id),
          name,
          uri: photoOf(a),
          sub: tileSub(a),
          onPress: () => onOpen(a),
          hint: 'Opens the celebration',
          accessibilityLabel: [announcementA11yLabel(a, posted), celebrationDetail(a)].filter(Boolean).join('. '),
        };
      })}
    />
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

/** Small muted line over the hero's title: an icon and "Update · Today". */
function Overline({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={styles.overline}>
      <View style={styles.fixed}>{icon}</View>
      <Text variant="caption" muted numberOfLines={1} style={styles.shrink}>
        {text}
      </Text>
    </View>
  );
}

function CelebrationHeroCard({ ann, now, onPress }: { ann: Announcement; now: number; onPress: () => void }) {
  const { value } = useCelebrationPhoto(ann);
  const bday = ann.type === 'birthday';
  const name = ann.targetName || 'A colleague';
  const detail = celebrationDetail(ann);
  const posted = postedLabel(ann.createdAt, now);
  // The bright tint rings the photo; the small icon on white uses the darker ink (docs/DESIGN.md §5).
  const tint = bday ? birthdayTint() : palette.accent;
  const ink = bday ? birthdayInk() : palette.successInk;
  const label = [announcementA11yLabel(ann, posted), detail].filter(Boolean).join('. ');
  return (
    <PressableCard onPress={onPress} accessibilityLabel={label} accessibilityHint="Opens the celebration" tone="frostStrong" style={styles.celeb}>
      <View style={[styles.ring, { borderColor: tint }]}>
        <Avatar name={name} uri={value || null} size={HERO_PHOTO} ring={false} />
      </View>
      <View style={styles.text}>
        <Overline
          icon={bday ? <Cake size={14} color={ink} /> : <Award size={14} color={ink} />}
          text={[kindWord(ann), posted].filter(Boolean).join(' · ')}
        />
        <Text variant="heading" numberOfLines={2} style={styles.shrink}>
          {name}
        </Text>
        {detail ? (
          <Text variant="label" muted numberOfLines={2} style={styles.shrink}>
            {detail}
          </Text>
        ) : null}
      </View>
    </PressableCard>
  );
}

/** The newest post, as the News screen's one big card (solid white; see the file header). */
export function NewsHero({ ann, now, onPress }: { ann: Announcement; now: number; onPress: () => void }) {
  const { cardPad } = useLayout();
  if (isCelebration(ann)) return <CelebrationHeroCard ann={ann} now={now} onPress={onPress} />;
  const posted = postedLabel(ann.createdAt, now);
  const extra = attachmentOf(ann);
  const title = ann.title?.trim() || '';
  const body = String(ann.body || '').trim();
  const label = [announcementA11yLabel(ann, posted), extra?.spoken].filter(Boolean).join('. ');
  const ExtraIcon = extra?.kind === 'link' ? ExternalLink : extra?.kind === 'video' ? Video : Download;
  return (
    <PressableCard
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint="Opens the announcement"
      tone="frostStrong"
      padded={false}
      style={styles.clip}>
      {ann.type === 'image' ? <AnnouncementImage key={ann.id} ann={ann} rounded={false} /> : null}
      <View style={[styles.heroBody, { padding: cardPad }]}>
        <Overline icon={<TypeIcon type={ann.type} size={14} color={moduleTone.news.fg} />} text={[typeLabel(ann), posted].filter(Boolean).join(' · ')} />
        {title ? (
          <Text variant="heading" numberOfLines={3}>
            {title}
          </Text>
        ) : null}
        {body ? (
          <Text variant="body" muted numberOfLines={title ? 3 : 4}>
            {body}
          </Text>
        ) : null}
        {extra ? (
          <View style={styles.extra}>
            <ExtraIcon size={14} color={palette.textMuted} style={styles.fixed} />
            <Text variant="label" muted numberOfLines={1} style={styles.shrink}>
              {extra.text}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableCard>
  );
}

/** Loading placeholder shaped like the hero (picture, overline, title, two lines), in the same white card. */
export function NewsHeroSkeleton() {
  const { cardPad } = useLayout();
  return (
    <Card tone="frostStrong" padded={false} style={styles.clip}>
      <View style={styles.mediaSkeleton}>
        <Skeleton height={0} radius={0} style={styles.mediaFill} />
      </View>
      <View style={[styles.heroBody, { padding: cardPad }]}>
        <Skeleton height={12} width={96} radius={6} />
        <Skeleton height={18} width="80%" radius={6} />
        <Skeleton height={12} radius={6} />
        <Skeleton height={12} width="60%" radius={6} />
      </View>
    </Card>
  );
}

const styles = themedStyles(() => ({
  thumb: { width: LEAD, height: LEAD, borderRadius: radius.sm, backgroundColor: palette.surfaceMuted },
  badge: {
    width: LEAD,
    height: LEAD,
    borderRadius: LEAD / 2,
    backgroundColor: moduleTone.news.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: { overflow: 'hidden' },
  heroBody: { gap: space.xs },
  mediaSkeleton: { aspectRatio: 16 / 9 },
  mediaFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100%' },
  overline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  fixed: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  celeb: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ring: {
    width: HERO_PHOTO + 2 * (HERO_RING + HERO_GAP),
    height: HERO_PHOTO + 2 * (HERO_RING + HERO_GAP),
    borderRadius: (HERO_PHOTO + 2 * (HERO_RING + HERO_GAP)) / 2,
    borderWidth: HERO_RING,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
}));
