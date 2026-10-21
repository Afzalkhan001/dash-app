// News studio — the website's Announcements page in Create Mode (dash.html AnnouncementsPage
// :19390-19526), for people who can post news (features/newsroom/access canUseNewsStudio).
//   My posts   the posts I made (createdBy is my name), like the web's "My feed";
//   All posts  every post in the company, like "Manage All" — pop-ups, scheduled and expired included.
// Each row opens the post (Edit / Delete there, only on my own posts unless I am Super Admin). "+" starts
// a new post; HR and Super Admin also get News settings (birthday / anniversary posts, HR WhatsApp).

import { Redirect, useRouter } from 'expo-router';
import { Megaphone, Plus, Settings2 } from 'lucide-react-native';
import { useState } from 'react';

import { type Announcement, useAnnouncements } from '@/api/announcements';
import { postedLabel } from '@/features/announcements/parts';
import { useNow } from '@/features/attendance/use-now';
import { branchesLabel, isPopup, popupFreqLabel, postStatus, postTypeLabel } from '@/features/newsroom/format';
import { useNewsroomAccess } from '@/features/newsroom/gate';
import { postIcon } from '@/features/newsroom/icons';
import { StatusRow } from '@/features/hiring/ui';
import { palette, radius } from '@/theme/tokens';
import { ActivityList, EmptyState, ErrorState, NavHeader, Screen, Segmented, Skeleton, SummaryHero } from '@/ui';

type Tab = 'mine' | 'all';

const newestFirst = (a: Announcement, b: Announcement) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

function subtitleOf(a: Announcement) {
  if (isPopup(a)) return `Pop-up · ${popupFreqLabel(a.popupFrequency)}`;
  return `${postTypeLabel(a)} · ${branchesLabel(a.branches)}`;
}

export default function NewsStudioScreen() {
  const router = useRouter();
  const now = useNow();
  const { user, ready, studio, celebrations } = useNewsroomAccess();
  const q = useAnnouncements();
  const [tab, setTab] = useState<Tab>('mine');

  if (ready && !studio) return <Redirect href="/" />;

  const all = (q.data ?? []).filter((a) => a && a.id && a.kind !== 'tv_media').sort(newestFirst);
  const mine = all.filter((a) => !!user?.name && a.createdBy === user.name);
  const rows = tab === 'mine' ? mine : all;

  const live = all.filter((a) => postStatus(a).tone === 'done');
  const scheduled = all.filter((a) => postStatus(a).tone === 'pending').length;
  const popups = live.filter(isPopup).length;
  const compose = () => router.push('/admin/news/compose');

  // The hero carries "New post", so the header keeps only News settings (HR and Super Admin).
  const actions = celebrations ? [{ key: 'settings', icon: Settings2, label: 'News settings', onPress: () => router.push('/admin/news/settings') }] : [];

  return (
    <Screen header={<NavHeader title="News studio" actions={actions} />} onRefresh={() => q.refetch()}>
      {q.isPending ? (
        <Skeleton height={228} radius={radius.xxl} />
      ) : q.isError && !q.data ? null : (
        <SummaryHero
          icon={Megaphone}
          module="news"
          label="Live now"
          value={live.length}
          unit={live.length === 1 ? 'post' : 'posts'}
          info={scheduled ? { label: 'Scheduled', value: String(scheduled) } : popups ? { label: 'Pop-ups', value: String(popups) } : undefined}
          sub="A post reaches Home, News and the office TVs at once."
          action={{ title: 'New post', icon: <Plus />, onPress: compose }}
        />
      )}

      <Segmented<Tab>
        options={[
          { key: 'mine', label: 'My posts', badge: mine.length || undefined },
          { key: 'all', label: 'All posts', badge: all.length || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />

      {q.isError && !q.data ? (
        <ErrorState message={q.error?.message ?? 'Posts could not be loaded.'} onRetry={() => void q.refetch()} />
      ) : (
        <ActivityList
          loading={q.isPending}
          loadingRows={4}
          empty={
            <EmptyState
              icon={<Megaphone color={palette.textMuted} strokeWidth={1.8} />}
              title={tab === 'mine' ? 'You haven’t posted yet' : 'No posts yet'}
              message="Share an update, a link, a picture or a file with everyone. Start with New post above."
            />
          }>
          {rows.map((a) => {
            const st = postStatus(a);
            return (
              <StatusRow
                key={a.id}
                module="news"
                icon={postIcon(a)}
                title={a.title || 'Untitled post'}
                subtitle={subtitleOf(a)}
                note={tab === 'all' && a.createdBy ? `By ${a.createdBy}` : null}
                meta={postedLabel(a.createdAt, now) || undefined}
                status={st}
                onPress={() => router.push(`/admin/news/${encodeURIComponent(a.id)}`)}
                accessibilityHint="Opens the post"
              />
            );
          })}
        </ActivityList>
      )}
    </Screen>
  );
}
