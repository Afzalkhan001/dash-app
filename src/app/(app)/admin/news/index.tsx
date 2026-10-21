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
import { palette } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, EmptyState, ErrorState, NavHeader, Screen, Segmented } from '@/ui';

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

  const actions = [
    { key: 'new', icon: Plus, label: 'New post', onPress: () => router.push('/admin/news/compose') },
    ...(celebrations ? [{ key: 'settings', icon: Settings2, label: 'News settings', onPress: () => router.push('/admin/news/settings') }] : []),
  ];

  return (
    <Screen header={<NavHeader title="News studio" actions={actions} />} onRefresh={() => q.refetch()}>
      <Banner
        tone="info"
        title="Posts reach everyone at once"
        message="A new post shows on Home and in News for its branches, and on the office TVs. A pop-up opens over everyone’s Home page."
      />

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
          title={tab === 'mine' ? 'Your posts' : 'Every post'}
          loading={q.isPending}
          loadingRows={4}
          empty={
            <EmptyState
              icon={<Megaphone color={palette.textMuted} strokeWidth={1.8} />}
              title={tab === 'mine' ? 'You haven’t posted yet' : 'No posts yet'}
              message="Share an update, a link, a picture or a file with everyone."
              action={<Button title="New post" icon={<Plus />} onPress={() => router.push('/admin/news/compose')} />}
            />
          }>
          {rows.map((a) => {
            const st = postStatus(a);
            return (
              <ActivityRow
                key={a.id}
                module="news"
                icon={postIcon(a)}
                title={a.title || '(untitled)'}
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
