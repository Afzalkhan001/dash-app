// Office TVs — the website's Config › TV Displays card (dash.html TvDisplaysCard :2864) for Super
// Admin (CEO and COO share that menu). Each paired TV with its online dot, branch, what it is showing
// and when it was last seen, refreshed every 20 s while this screen is on top (the website's own
// rhythm); "+" pairs a new TV by the 6-digit code on its screen. Playlists are shown read only — the
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
import { palette } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  MenuSheet,
  NavHeader,
  Screen,
  SummaryCard,
  Text,
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
    return a ? a.title || '(untitled)' : 'A post';
  };

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
      header={<NavHeader title="Office TVs" subtitle={devices.data ? `${list.length} paired · ${online} online` : undefined} actions={[{ key: 'add', icon: Plus, label: 'Add a TV', onPress: () => router.push('/admin/news/tvs/add') }]} />}
      onRefresh={() => Promise.all([devices.refetch(), playlists.refetch(), media.refetch()])}>
      <Banner
        tone="info"
        title="Add a TV in a minute"
        message="Open the Dash TV app on the TV (or dash-tv-web.vercel.app in its browser), then tap + and type the 6-digit code it shows."
      />

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
              message="Pair the first one with the code on its screen."
              action={<Button title="Add a TV" icon={<Plus />} onPress={() => router.push('/admin/news/tvs/add')} />}
            />
          }>
          {list.map((d) => {
            const on = tvOnline(d);
            const showing = titleOf(d.currentAnnouncementId);
            return (
              <ActivityRow
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

      <ActivityList title="Playlists" loading={playlists.isPending} empty="No playlists. A TV without one shows every published post for its branch, most important first.">
        {lists.map((p) => (
          <ActivityRow
            key={p.id}
            module="news"
            icon={ListVideo}
            title={p.name}
            subtitle={[`${(p.items ?? []).length} ${(p.items ?? []).length === 1 ? 'item' : 'items'}`, p.description].filter(Boolean).join(' · ')}
            status={p.status === 'archived' ? { label: 'Archived', tone: 'neutral' } : null}
          />
        ))}
      </ActivityList>
      <Button variant="text" title="Make or change playlists" onPress={() => router.push('/admin/advanced/playlists')} />
      <Text variant="caption" muted align="center">
        Here you choose which one each TV plays.
      </Text>

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
