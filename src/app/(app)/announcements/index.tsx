// News (what the More tile and Home's section call announcements) — the web's feed for viewers
// (AnnouncementsPage, dash.html ~L19390): published, not expired, for my branch, newest first;
// pop-ups excluded; birthday / work-anniversary cards only while HR has them switched on. Creating and
// managing announcements happens in the News studio (src/app/(app)/admin/news, newsroom domain).
//
// Payno layout (docs/REFERENCE-COMPONENTS.md §3): NavHeader "News"; "Celebrations" — the birthday and
// work-anniversary posts as one AvatarTiles row (features/more/news-row CelebrationTiles); "Latest" —
// the newest other post as one big frosted card (its picture, type and day, title, three lines,
// attachment; NewsHero); "Earlier" — the rest as ActivityRows in one frosted card (picture or type
// icon, title, two muted lines, when it was posted). Each group keeps the feed's newest-first order. A
// virtualised list, so only the rows on screen fetch their pictures.
//
// People who can post news (features/newsroom/access canUseNewsStudio, the web's Create Mode) get a
// round "News studio" button in the header, the way into posting, editing and deleting posts.

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Megaphone, PenLine } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Announcement, isCelebration, useVisibleAnnouncements } from '@/api/announcements';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { useNow } from '@/features/attendance/use-now';
import { canSeeAnnouncements } from '@/features/more/menu';
import { canUseNewsStudio } from '@/features/newsroom/access';
import { CelebrationTiles, NewsHero, NewsHeroSkeleton, NewsRow } from '@/features/more/news-row';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { EmptyState, ErrorState, GroupedRow, NavHeader, Screen, SectionHeader, SkeletonList, useLayout } from '@/ui';

type Item =
  | { kind: 'label'; key: string; title: string; first: boolean }
  | { kind: 'celebrations'; key: string; posts: Announcement[] }
  | { kind: 'hero'; key: string; ann: Announcement }
  | { kind: 'row'; key: string; ann: Announcement; first: boolean; last: boolean };

function SkeletonFeed() {
  const { gap } = useLayout();
  return (
    <View style={{ gap }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <NewsHeroSkeleton />
      <SkeletonList rows={3} avatar tone="surface" />
    </View>
  );
}

const kindOf = (a: Announcement) => (a.type === 'image' ? 'image' : 'text');

// Celebrations first as one row of tiles; then the newest other post as the hero and the rest under
// "Earlier".
function itemsOf(feed: Announcement[]): Item[] {
  if (!feed.length) return [];
  const celebrations = feed.filter((a) => isCelebration(a));
  const posts = feed.filter((a) => !isCelebration(a));
  const out: Item[] = [];
  if (celebrations.length) {
    out.push({ kind: 'label', key: 'label-celebrations', title: 'Celebrations', first: true });
    out.push({ kind: 'celebrations', key: 'celebrations', posts: celebrations });
  }
  if (posts.length) {
    const [latest, ...rest] = posts;
    out.push({ kind: 'label', key: 'label-latest', title: 'Latest', first: !out.length });
    out.push({ kind: 'hero', key: `hero-${String(latest!.id)}`, ann: latest! });
    if (rest.length) {
      out.push({ kind: 'label', key: 'label-earlier', title: 'Earlier', first: false });
      rest.forEach((a, i) => out.push({ kind: 'row', key: String(a.id), ann: a, first: i === 0, last: i === rest.length - 1 }));
    }
  }
  return out;
}

export default function AnnouncementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const user = useSession((s) => s.user);
  const role = user?.role;
  const tenant = useMyTenant();
  const ann = useVisibleAnnouncements();
  const allowed = canSeeAnnouncements(role, tenant.data);
  const studio = canUseNewsStudio(user, tenant.data);
  const feed = Array.isArray(ann.feed) ? ann.feed.filter((a) => a && a.id != null) : [];
  const items = itemsOf(feed);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await ann.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openPost = (a: Announcement) => router.push(`/announcements/${encodeURIComponent(String(a.id))}`);

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'label') return <SectionHeader title={item.title} style={item.first ? styles.labelFirst : styles.label} />;
    if (item.kind === 'celebrations') return <CelebrationTiles posts={item.posts} now={now} onOpen={openPost} />;
    if (item.kind === 'hero') return <NewsHero ann={item.ann} now={now} onPress={() => openPost(item.ann)} />;
    return (
      <GroupedRow tone="surface" hairline first={item.first} last={item.last}>
        <NewsRow ann={item.ann} now={now} onPress={() => openPost(item.ann)} />
      </GroupedRow>
    );
  };

  return (
    <Screen
      scroll={false}
      header={
        <NavHeader
          title="Announcements"
          actions={studio ? [{ key: 'studio', icon: PenLine, label: 'News studio', onPress: () => router.push('/admin/news') }] : []}
        />
      }>
      {!allowed ? (
        <EmptyState
          icon={<Megaphone color={palette.textMuted} strokeWidth={1.8} />}
          title="Announcements aren’t on for you"
          message="Your company admin can turn them on."
        />
      ) : ann.isPending ? (
        // isPending also covers restoring the saved cache on a cold start (no "No announcements right now" flash).
        <SkeletonFeed />
      ) : ann.isError && !ann.data ? (
        <ErrorState message={ann.error?.message ?? 'Announcements could not be loaded.'} onRetry={() => void ann.refetch()} />
      ) : (
        <View style={styles.fill}>
          <FlashList
            data={items}
            keyExtractor={(it) => it.key}
            getItemType={(it) => (it.kind === 'hero' ? `hero-${kindOf(it.ann)}` : it.kind)}
            extraData={now}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: space.xxs, paddingBottom: space.xl + insets.bottom }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={palette.primaryText}
                colors={[palette.primaryText]}
                progressBackgroundColor={palette.surface}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon={<Megaphone color={palette.textMuted} strokeWidth={1.8} />}
                title="No announcements right now"
                message="New ones will show up here."
              />
            }
            renderItem={renderItem}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  fill: { flex: 1 },
  labelFirst: { marginBottom: space.xxs },
  label: { marginTop: space.lg, marginBottom: space.xxs },
}));
