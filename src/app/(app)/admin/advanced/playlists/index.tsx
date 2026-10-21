// TV playlists (Super Admin, CEO, COO) — the website's Config › TV Displays › Playlists
// (dash.html:2936–2950). A TV with no playlist shows every published post for its branch, most
// important first; a playlist fixes the order and how long each post stays on screen. Tap a playlist
// to edit it, "+" for a new one. Which TV plays which playlist is set on the TV (Office TVs).

import { useRouter } from 'expo-router';
import { ListVideo, Plus, Tv } from 'lucide-react-native';

import { type TvPlaylist, useTvDevices, useTvPlaylists } from '@/api/newsroom';
import { canEditPlaylists } from '@/features/adminadvanced/access';
import { GateFallback, plural, useGate } from '@/features/adminadvanced/ui';
import { palette } from '@/theme/tokens';
import { Banner, Button, EmptyState, ErrorState, ListCard, ListRow, ModuleBadge, NavHeader, Screen, SkeletonList, StatusPill, Text } from '@/ui';

export default function PlaylistsScreen() {
  const router = useRouter();
  const { access, pending } = useGate();
  const allowed = canEditPlaylists(access.user, access.tenant);
  const q = useTvPlaylists(allowed);
  const tvs = useTvDevices(allowed);
  const add = () => router.push('/admin/advanced/playlists/new');
  const header = <NavHeader title="TV playlists" actions={allowed ? [{ icon: Plus, label: 'New playlist', onPress: add }] : []} />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const list = q.data ?? [];
  const usedBy = (p: TvPlaylist) => (tvs.data ?? []).filter((d) => d.config?.playlistId === p.id).length;
  const sorted = [...list].sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'));

  return (
    <Screen header={header} onRefresh={() => Promise.all([q.refetch(), tvs.refetch()])}>
      <Banner tone="info" message="A TV with no playlist shows every published post for its branch, most important first. Emergency posts always interrupt." />
      {q.isError && !q.data ? (
        <ErrorState message={q.error?.message ?? 'The playlists could not be loaded.'} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <SkeletonList rows={3} avatar />
      ) : !list.length ? (
        <EmptyState
          icon={<ListVideo color={palette.textMuted} />}
          title="No playlists yet"
          message="Make one to choose which posts a TV shows, in what order and for how long."
          action={<Button title="New playlist" variant="accent" size="md" icon={<Plus />} onPress={add} />}
        />
      ) : (
        <ListCard>
          {sorted.map((p) => {
            const n = Array.isArray(p.items) ? p.items.length : 0;
            const tvsOn = usedBy(p);
            return (
              <ListRow
                key={p.id}
                left={<ModuleBadge module="news" icon={p.status === 'archived' ? ListVideo : Tv} />}
                title={p.name || 'Untitled playlist'}
                subtitle={`${plural(n, 'post')}${tvs.data ? ` · ${tvsOn ? `on ${plural(tvsOn, 'TV')}` : 'on no TV'}` : ''}`}
                right={p.status === 'archived' ? <StatusPill label="Archived" tone="neutral" /> : undefined}
                chevron
                onPress={() => router.push(`/admin/advanced/playlists/${encodeURIComponent(p.id)}`)}
              />
            );
          })}
        </ListCard>
      )}
      <Text variant="caption" muted align="center">
        Pick a TV’s playlist in Office TVs.
      </Text>
    </Screen>
  );
}
