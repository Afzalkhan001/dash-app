// One announcement in full: its image, title and message, the call-to-action link, and the file
// for spreadsheet / presentation announcements (saved to the phone and opened from the share sheet).
// A video plays right in the post (features/announcements/video, loaded on tap) and can still be saved. Auto-posted birthdays and work anniversaries get
// their celebration card and a way to the colleague's profile.
//
// Payno detail (docs/REFERENCE-COMPONENTS.md): NavHeader with the share action for pictures; the
// picture, then the words (date, title, message) in one frosted card, then what is attached as an
// AccountRow (the file's icon, name and what it is for). The link and the file sit in the sticky bar
// at the bottom — the link is the one primary, the file its frosted secondary — and saving an image is
// the round share button in the header. A celebration keeps its own coloured hero (the people
// gradient, the same in both themes) and a way to the colleague's profile.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Download, ExternalLink, FileSpreadsheet, Megaphone, Presentation, Share2, UserRound, Video } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { type Announcement, isCelebration, useAnnouncementMedia, useVisibleAnnouncements } from '@/api/announcements';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import {
  AnnouncementImage,
  CelebrationHero,
  ctaButtonLabel,
  ctaFullText,
  linkHost,
  openAnnouncementLink,
  postedLabel,
  shareAnnouncementFile,
} from '@/features/announcements/parts';
import { AnnouncementVideo } from '@/features/announcements/video';
import { useNow } from '@/features/attendance/use-now';
import { canSeeAnnouncements } from '@/features/more/menu';
import { usePeople } from '@/features/people/directory';
import { firstName } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  ActionRow,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  NavHeader,
  Screen,
  Skeleton,
  Text,
  useLayout,
} from '@/ui';
function useFileAction(a: Announcement | undefined) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!a || busy) return;
    setBusy(true);
    try {
      await shareAnnouncementFile(a);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function Celebration({ a, now }: { a: Announcement; now: number }) {
  const router = useRouter();
  const me = useSession((s) => s.user?.id);
  const { gap } = useLayout();
  const { roster } = usePeople();
  const people = Array.isArray(roster) ? roster : [];
  const tid = String(a.targetEmployeeId || '');
  const person = tid ? people.find((p) => !!p && (p.id === tid || p.id === `wl:${tid}`)) : undefined;
  const first = firstName(a.targetName);
  const posted = postedLabel(a.createdAt, now);
  const isMe = !!person && person.id === me;
  // A single button keeps to 22 characters (docs/DESIGN.md A16): longer first names move to the
  // accessibility label.
  const label = isMe ? 'Open my profile' : first && first.length <= 7 ? `View ${first}’s profile` : 'View profile';
  return (
    <View style={{ gap }}>
      <Card tone="ink" gradient={moduleTone.people.gradient}>
        <CelebrationHero ann={a} />
      </Card>
      {posted ? (
        <Text variant="caption" muted align="center">
          {posted}
        </Text>
      ) : null}
      {person ? (
        <Button
          title={label}
          accessibilityLabel={isMe ? 'Open my profile' : a.targetName ? `View ${a.targetName}’s profile` : 'View their profile'}
          variant="accent"
          icon={<UserRound />}
          onPress={() => (isMe ? router.push('/profile') : router.push(`/people/${encodeURIComponent(person.id)}`))}
        />
      ) : null}
    </View>
  );
}

function ArticleSkeleton() {
  return (
    <Card tone="frostStrong" style={{ gap: space.sm }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Skeleton height={12} width={72} radius={6} />
      <Skeleton height={26} width="85%" radius={8} />
      <Skeleton height={26} width="55%" radius={8} />
      <Skeleton height={14} radius={6} style={{ marginTop: space.xxs }} />
      <Skeleton height={14} radius={6} />
      <Skeleton height={14} width="70%" radius={6} />
    </Card>
  );
}

// Same rule as News itself (the More tile, Home's strip, /announcements): roles without News get the
// same notice instead of the post.
export default function AnnouncementScreen() {
  const role = useSession((s) => s.user?.role);
  const tenant = useMyTenant().data;
  if (!canSeeAnnouncements(role, tenant)) {
    return (
      <Screen header={<NavHeader title="Announcement" />}>
        <EmptyState icon={<Megaphone color={palette.textMuted} strokeWidth={1.8} />} title="News isn’t on for you" message="Your company admin can turn it on." />
      </Screen>
    );
  }
  return <AnnouncementBody />;
}

function AnnouncementBody() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(Array.isArray(params.id) ? params.id[0] : params.id || '');
  const router = useRouter();
  const { compact } = useLayout();
  const now = useNow();
  const ann = useVisibleAnnouncements();
  const feed = Array.isArray(ann.feed) ? ann.feed : [];
  const a = id ? feed.find((x) => !!x && String(x.id) === id) : undefined;
  const file = useFileAction(a);
  // An image announcement whose file turns out to be empty ('') gets no media slot at all, so no empty
  // animated child (and its stack gap) sits above the article.
  const media = useAnnouncementMedia(a && a.type === 'image' ? a : null);

  const celebration = !!a && isCelebration(a);
  const isFile = !!a && !celebration && (a.type === 'excel' || a.type === 'ppt') && !!a.hasMedia;
  const isVideo = !!a && !celebration && a.type === 'video' && !!a.hasMedia;
  const isImage = !!a && !celebration && a.type === 'image' && !!a.hasMedia;
  const hasLink = !!a && !celebration && !!a.linkUrl;
  const host = a && hasLink ? linkHost(a) : '';
  // A call-to-action too long for the button: the button says "Open link" and the card shows it in full.
  const ctaFull = a && hasLink ? ctaFullText(a) : '';
  const posted = a ? postedLabel(a.createdAt, now) : '';

  const linkButton =
    a && hasLink ? <Button variant="primary" title={ctaButtonLabel(a)} icon={<ExternalLink />} onPress={() => void openAnnouncementLink(a)} /> : null;
  const fileButton =
    isFile || isVideo ? (
      <Button variant={linkButton ? 'accent' : 'primary'} title={isVideo ? 'Save video' : 'Download'} icon={<Download />} loading={file.busy} onPress={file.run} />
    ) : null;
  const footer =
    linkButton || fileButton ? (
      <ActionBar note={linkButton && host ? `${fileButton ? 'Link opens' : 'Opens'} ${host}` : null}>
        {linkButton && fileButton ? (
          <ActionRow context="bar">
            {fileButton}
            {linkButton}
          </ActionRow>
        ) : (
          (linkButton ?? fileButton)
        )}
      </ActionBar>
    ) : undefined;

  const header = (
    <NavHeader
      title={celebration ? 'Celebration' : 'Announcement'}
      right={
        isImage ? (
          <IconButton size={compact ? 40 : 44} accessibilityLabel="Save or share the image" onPress={() => void file.run()} disabled={file.busy}>
            {file.busy ? <ActivityIndicator size="small" color={palette.primaryText} /> : <Share2 size={20} strokeWidth={1.8} color={palette.text} />}
          </IconButton>
        ) : undefined
      }
    />
  );

  return (
    <Screen header={header} footer={footer} onRefresh={ann.refetch}>
      {a && celebration ? <Celebration key="article" a={a} now={now} /> : null}

      {a && isImage && media.value !== '' ? <AnnouncementImage key="media" ann={a} /> : null}
      {a && isVideo ? <AnnouncementVideo key="video" ann={a} /> : null}
      {a && !celebration ? (
        <Card key="article" tone="frostStrong" style={styles.article}>
          {posted ? (
            <Text variant="caption" muted numberOfLines={1}>
              {posted}
            </Text>
          ) : null}
          {a.title ? (
            <Text variant="title" selectable accessibilityRole="header">
              {a.title}
            </Text>
          ) : null}
          {a.body ? (
            <Text variant="body" selectable style={styles.body}>
              {a.body}
            </Text>
          ) : null}
          {ctaFull ? (
            <View style={styles.cta}>
              <ExternalLink size={16} strokeWidth={2} color={palette.textMuted} style={styles.ctaIcon} />
              <Text variant="labelStrong" selectable style={styles.ctaText}>
                {ctaFull}
              </Text>
            </View>
          ) : null}
          {/* The full address of a link announcement, so it can be read or copied (long-press). */}
          {hasLink && a.type === 'link' && a.linkUrl ? (
            <Text variant="label" muted selectable numberOfLines={1} ellipsizeMode="middle">
              {a.linkUrl}
            </Text>
          ) : null}
        </Card>
      ) : null}
      {a && (isFile || isVideo) ? (
        <AccountRow
          key="file"
          icon={isVideo ? Video : a.type === 'excel' ? FileSpreadsheet : Presentation}
          module="news"
          title={isVideo ? 'Video' : a.fileName || (a.type === 'excel' ? 'Spreadsheet' : 'Presentation')}
          sub={isVideo ? 'Plays above. Save it to keep it on your phone.' : 'Save it, or open it in another app.'}
        />
      ) : null}

      {/* isPending also covers restoring the saved cache on a cold start (no "No longer available" flash). */}
      {!a && ann.isPending ? <ArticleSkeleton key="article" /> : null}
      {!a && !ann.isPending && ann.isError && !ann.data ? (
        <ErrorState key="article" message={ann.error?.message ?? 'This announcement could not be loaded.'} onRetry={() => void ann.refetch()} />
      ) : null}
      {!a && !ann.isPending && !(ann.isError && !ann.data) ? (
        <EmptyState
          key="article"
          icon={<Megaphone color={palette.textMuted} strokeWidth={1.8} />}
          title="No longer available"
          message="It may have expired."
          action={<Button title="All news" variant="accent" size="md" onPress={() => router.replace('/announcements')} />}
        />
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  article: { gap: space.sm },
  // A little more air between lines than a list row, so a long message reads easily.
  body: { lineHeight: 24 },
  cta: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  ctaIcon: { flexShrink: 0, marginTop: 2 },
  ctaText: { flex: 1, minWidth: 0 },
}));
