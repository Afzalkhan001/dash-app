// Office TVs — the website's Config › TV Displays card (dash.html TvDisplaysCard :2864) for Super
// Admin (CEO and COO share that menu). Each paired TV with its online dot, branch, what it is showing
// and when it was last seen, refreshed every 20 s while this screen is on top (the website's own
// rhythm); the hero's "Add a TV" pairs a new TV by the 6-digit code on its screen. Playlists are shown read only — the
// playlist editor (ordered rows with durations and date windows) stays on the website. Custom TV media
// (a picture or video that plays on EVERY TV) can be added and removed here, both swiped to confirm.

import { Redirect, useIsFocused, useRouter } from 'expo-router';
import { Clapperboard, Image as ImageIcon, ListVideo, Plus, Trash2, Tv, Upload } from 'lucide-react-native';
import { useState } from 'react';

import { useAnnouncements } from '@/api/announcements';
import { type TvMedia, useDeleteTvMedia, useTvDevices, useTvMedia, useTvPlaylists, useUploadTvMedia } from '@/api/newsroom';
import { useNow } from '@/features/attendance/use-now';
import { agoLabel, playlistName, tvOnline, tvPlatformLabel } from '@/features/newsroom/format';
import { useNewsroomAccess } from '@/features/newsroom/gate';
import { FileError, type PickedFile, pickDocument, pickImage } from '@/lib/files';
import { StatusRow } from '@/features/hiring/ui';
import { palette, radius } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  MenuSheet,
  NavHeader,
  Screen,
  Skeleton,
  SummaryCard,
  SummaryHero,
  toast,
} from '@/ui';

export default function OfficeTvsScreen() {
  const router = useRouter();
  const now = useNow(30_000);
  const focused = useIsFocused();
  const { ready, tvs } = useNewsroomAccess();
  const devices = useTvDevices(tvs, focused);
  const playlists = useTvPlaylists(tvs);
  const media = useTvMedia(tvs);
  const posts = useAnnouncements();
  const upload = useUploadTvMedia();
  const remove = useDeleteTvMedia();
  const [menu, setMenu] = useState(false);
  const [picked, setPicked] = useState<{ type: 'image' | 'video'; file: PickedFile } | null>(null);
  const [removing, setRemoving] = useState<TvMedia | null>(null);

  if (ready && !tvs) return <Redirect href="/" />;

  const list = devices.data ?? [];
  const lists = playlists.data ?? [];
  const online = list.filter(tvOnline).length;
  const titleOf = (id?: string | null) => {
    if (!id) return null;
    const a = (posts.data ?? []).find((x) => x.id === id);
    return a ? a.title || 'Untitled post' : 'A post';
  };

  const addTv = () => router.push('/admin/news/tvs/add');

  const choose = async (type: 'image' | 'video') => {
    setMenu(false);
    try {
      const file = type === 'image' ? await pickImage('library') : await pickDocument(['video/*']);
      if (!file) return;
      if (type === 'video' && !file.type.startsWith('video/')) {
        toast.show('Pick a video file.', 'danger');
        return;
      }
      setPicked({ type, file });
    } catch (e) {
      toast.show(e instanceof FileError ? e.message : 'That file could not be read.', 'danger');
    }
  };

  return (
    <Screen
      header={<NavHeader title="Office TVs" />}
      onRefresh={() => Promise.all([devices.refetch(), playlists.refetch(), media.refetch()])}>
      {devices.isPending ? (
        <Skeleton height={228} radius={radius.xxl} />
      ) : devices.isError && !devices.data ? null : (
        <SummaryHero
          icon={Tv}
          module="news"
          label="TVs online"
          value={online}
          unit={`of ${list.length}`}
          sub={list.length ? 'Pair another TV with the 6-digit code on its screen.' : 'Pair the first TV with the 6-digit code on its screen.'}
          action={{ title: 'Add a TV', icon: <Plus />, onPress: addTv }}
        />
      )}

      {devices.isError && !devices.data ? (
        <ErrorState message={devices.error?.message ?? 'TVs could not be loaded.'} onRetry={() => void devices.refetch()} />
      ) : (
        <ActivityList
          title="TVs"
          loading={devices.isPending}
          empty={
            <EmptyState
              icon={<Tv color={palette.textMuted} strokeWidth={1.8} />}
              title="No TVs yet"
              message="Open the Dash TV app on the TV, then tap Add a TV above and type the code it shows."
            />
          }>
          {list.map((d) => {
            const on = tvOnline(d);
            const showing = titleOf(d.currentAnnouncementId);
            return (
              <StatusRow
                key={d.id}
                module="news"
                icon={Tv}
                title={d.name || 'TV'}
                subtitle={`${d.location || 'All branches'} · ${playlistName(d, lists)}`}
                note={showing ? `Showing: ${showing}` : `${tvPlatformLabel(d)}`}
                meta={on ? undefined : `Seen ${agoLabel(d.lastSeenAt, now)}`}
                status={{ label: on ? 'Online' : 'Offline', tone: on ? 'done' : 'failed' }}
                onPress={() => router.push(`/admin/news/tvs/${encodeURIComponent(d.id)}`)}
                accessibilityHint="Opens the TV: remote, show a post, settings"
              />
            );
          })}
        </ActivityList>
      )}

      <ActivityList
        title="Playlists"
        onSeeAll={() => router.push('/admin/advanced/playlists')}
        seeAllLabel="Manage"
        seeAllAccessibilityLabel="Manage playlists and choose which one each TV plays"
        loading={playlists.isPending}
        empty="No playlists. A TV without one shows every published post for its branch, most important first.">
        {lists.map((p) => (
          <StatusRow
            key={p.id}
            module="news"
            icon={ListVideo}
            title={p.name}
            subtitle={[`${(p.items ?? []).length} ${(p.items ?? []).length === 1 ? 'item' : 'items'}`, p.description].filter(Boolean).join(' · ')}
            status={p.status === 'archived' ? { label: 'Archived', tone: 'neutral' } : null}
          />
        ))}
      </ActivityList>

      <ActivityList
        title="Custom TV media"
        right={<Button variant="text" size="sm" title="Upload" icon={<Upload />} onPress={() => setMenu(true)} loading={upload.isPending} />}
        loading={media.isPending}
        empty="Nothing uploaded. A picture or video added here plays on every TV, without a post.">
        {(media.data ?? []).map((m) => (
          <ActivityRow
            key={m.id}
            module="news"
            icon={m.type === 'video' ? Clapperboard : ImageIcon}
            title={m.fileName || (m.type === 'video' ? 'Video' : 'Picture')}
            subtitle={`${m.type === 'video' ? 'Video' : 'Picture'} · uploaded ${agoLabel(m.createdAt, now)}`}
            right={
              <IconButton accessibilityLabel={`Remove ${m.fileName || 'this file'} from the TVs`} onPress={() => setRemoving(m)}>
                <Trash2 size={18} color={palette.dangerInk} />
              </IconButton>
            }
          />
        ))}
      </ActivityList>

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Upload to every TV"
        subtitle="Up to 8 MB. Pictures show for 7 seconds; videos play to the end."
        items={[
          { key: 'image', label: 'A picture', icon: ImageIcon, onPress: () => void choose('image') },
          { key: 'video', label: 'A video', icon: Clapperboard, onPress: () => void choose('video') },
        ]}
      />

      <ConfirmSheet
        visible={!!picked}
        onClose={() => setPicked(null)}
        title="Play this on every TV?"
        from={{ title: picked?.file.name ?? '', subtitle: picked?.type === 'video' ? 'Video' : 'Picture', icon: picked?.type === 'video' ? Clapperboard : ImageIcon, module: 'news' }}
        to={{ title: `${list.length} ${list.length === 1 ? 'TV' : 'TVs'}`, subtitle: 'Every office TV', icon: Tv, module: 'news' }}
        confirmLabel="Swipe to upload"
        loading={upload.isPending}
        onConfirm={() => {
          if (!picked) return;
          upload.mutate(
            { type: picked.type, fileData: picked.file.dataUrl, fileName: picked.file.name },
            {
              onSuccess: () => {
                setPicked(null);
                toast.show('Uploaded. It starts playing on your TVs in a few seconds.');
              },
              onError: (e) => toast.show(`Couldn’t upload: ${e.message}`, 'danger'),
            },
          );
        }}
        note="It joins every TV’s rotation within a few seconds. It never shows in News or on Home. No one is notified.">
        <SummaryCard rows={[{ key: 'size', label: 'Size', value: picked ? `${(picked.file.size / (1024 * 1024)).toFixed(1)} MB` : '—' }]} />
      </ConfirmSheet>

      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove it from the TVs?"
        from={{ title: removing?.fileName || 'This file', subtitle: removing?.type === 'video' ? 'Video' : 'Picture', icon: removing?.type === 'video' ? Clapperboard : ImageIcon, module: 'news' }}
        to={{ title: 'Removed', subtitle: 'From every TV', icon: Trash2, module: 'security' }}
        confirmLabel="Swipe to remove"
        loading={remove.isPending}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id, {
            onSuccess: () => {
              setRemoving(null);
              toast.show('Removed from the TVs.');
            },
            onError: (e) => toast.show(`Couldn’t remove: ${e.message}`, 'danger'),
          });
        }}
        note="This can’t be undone. You would need to upload it again. No one is notified."
      />
    </Screen>
  );
}
