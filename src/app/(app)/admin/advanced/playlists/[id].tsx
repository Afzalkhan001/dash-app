// One TV playlist — new (`/admin/advanced/playlists/new`) or an existing one. The website's
// TvPlaylistModal (dash.html:3096–3138):
//   name (80), description (300), Active / Archived (edit only; archived = TVs fall back to every post),
//   the posts in order — each with its seconds on screen (3–300) and optional first and last day —
//   moved up and down, removed, or swapped for another post.
//   POST /tv/admin/playlists or PUT /tv/admin/playlists/:id {name, description, items[, status]}.
// Only posts a TV could show are offered (not a pop-up, not expired: tvUsableAnns :2862); a post already
// in the list stays even if it has since expired, shown as such, so opening an old playlist never
// blanks a row. A per-item priority the website can't see is kept as it was.
// Delete: ConfirmSheet + swipe — TVs on it go back to showing every post. Nobody is messaged.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, ListVideo, Plus, Repeat, Search, Trash2, Tv, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Announcement, useAnnouncements } from '@/api/announcements';
import { useTvDevices, useTvPlaylists } from '@/api/newsroom';
import { canEditPlaylists } from '@/features/adminadvanced/access';
import { itemsOf, type PlaylistItem, usePlaylistWrites } from '@/features/adminadvanced/api';
import { GateFallback, plural, useGate } from '@/features/adminadvanced/ui';
import { postTypeLabel, tvUsablePosts } from '@/features/newsroom/format';
import { dateLabel } from '@/lib/dates';
import { palette } from '@/theme/tokens';
import {
  ActionBar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  DateField,
  EmptyState,
  ErrorState,
  IconButton,
  ListCard,
  ListRow,
  ModuleBadge,
  NavHeader,
  PillField,
  Screen,
  SectionHeader,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  SummaryCard,
  Text,
  TextField,
  toast,
} from '@/ui';

type Row = Omit<PlaylistItem, 'durationSeconds'> & { key: string; seconds: string };
type Draft = { name: string; description: string; status: 'active' | 'archived'; rows: Row[] };

// Saved rows get keys from their position (the same on every render); rows added later get a fresh one
// in the event handler.
let seq = 0;
const rowKey = () => `n${++seq}`;
const toRows = (items: PlaylistItem[]): Row[] => items.map(({ durationSeconds, ...i }, k) => ({ ...i, key: `s${k}`, seconds: String(durationSeconds) }));
const secondsOk = (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= 3 && Number(v) <= 300;

export default function PlaylistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : 'new';
  const isNew = id === 'new';
  const { access, pending } = useGate();
  const allowed = canEditPlaylists(access.user, access.tenant);
  const listQ = useTvPlaylists(allowed);
  const tvsQ = useTvDevices(allowed);
  const postsQ = useAnnouncements();
  const writes = usePlaylistWrites();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ index: number | null } | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(false);

  const header = (title: string, withDelete = false) => (
    <NavHeader
      title={title}
      actions={
        withDelete
          ? [
              {
                icon: Trash2,
                label: 'Delete playlist',
                onPress: () => {
                  writes.remove.reset();
                  setDeleting(true);
                },
              },
            ]
          : []
      }
    />
  );
  if (!allowed) return <GateFallback pending={pending} header={header('Playlist')} />;

  const existing = isNew ? null : ((listQ.data ?? []).find((p) => p.id === id) ?? null);
  if (!isNew && !existing) {
    return (
      <Screen header={header('Playlist')}>
        {listQ.isError && !listQ.data ? (
          <ErrorState message={listQ.error?.message ?? 'The playlist could not be loaded.'} onRetry={() => void listQ.refetch()} />
        ) : listQ.data ? (
          <EmptyState icon={<ListVideo color={palette.textMuted} />} title="Playlist not found" message="It may have been deleted on the website." />
        ) : (
          <SkeletonList rows={4} />
        )}
      </Screen>
    );
  }

  // The form starts from the saved playlist (or blank) and is only copied into state on the first edit.
  const base: Draft = existing
    ? { name: existing.name ?? '', description: existing.description ?? '', status: existing.status === 'archived' ? 'archived' : 'active', rows: toRows(itemsOf(existing.items)) }
    : { name: '', description: '', status: 'active', rows: [] };
  const d = draft ?? base;
  const edit = (patch: Partial<Draft>) => {
    setError(null);
    setDraft({ ...d, ...patch });
  };
  const setRow = (i: number, patch: Partial<Row>) => edit({ rows: d.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= d.rows.length) return;
    const next = d.rows.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    edit({ rows: next });
  };

  const posts = postsQ.data ?? [];
  const usable = tvUsablePosts(posts);
  const postOf = (pid: string): Announcement | null => posts.find((a) => a.id === pid) ?? null;
  const tvsOn = (tvsQ.data ?? []).filter((t) => !isNew && t.config?.playlistId === id);
  const dirty = draft !== null;
  const busy = writes.create.isPending || writes.update.isPending;

  const save = () => {
    const name = d.name.trim();
    if (!name) return setError('Give the playlist a name.');
    const bad = d.rows.findIndex((r) => !secondsOk(r.seconds));
    if (bad >= 0) return setError(`Post ${bad + 1}: seconds on screen must be a whole number from 3 to 300.`);
    const backwards = d.rows.findIndex((r) => r.startDate && r.endDate && r.endDate < r.startDate);
    if (backwards >= 0) return setError(`Post ${backwards + 1}: the last day is before the first day.`);
    const items: PlaylistItem[] = d.rows
      .filter((r) => r.announcementId)
      .map(({ key: _k, seconds, ...r }) => ({ ...r, durationSeconds: Number(seconds), startDate: r.startDate || null, endDate: r.endDate || null }));
    const body = { name, description: d.description, items, ...(isNew ? {} : { status: d.status }) };
    const done = () => {
      setDraft(null);
      toast.show('Playlist saved', 'success');
      if (isNew) router.back();
    };
    if (isNew) writes.create.mutate(body, { onSuccess: done, onError: (e) => setError(e.message) });
    else writes.update.mutate({ id, body }, { onSuccess: done, onError: (e) => setError(e.message) });
  };

  const pick = (a: Announcement) => {
    if (picker?.index == null) edit({ rows: [...d.rows, { key: rowKey(), announcementId: a.id, seconds: '15', startDate: null, endDate: null }] });
    else setRow(picker.index, { announcementId: a.id });
    setPicker(null);
    setSearch('');
  };

  const q = search.trim().toLowerCase();
  const choices = usable.filter((a) => !q || (a.title ?? '').toLowerCase().includes(q));

  return (
    <Screen
      header={header(isNew ? 'New playlist' : 'Playlist', !isNew)}
      onRefresh={() => Promise.all([listQ.refetch(), postsQ.refetch(), tvsQ.refetch()])}
      footer={
        <ActionBar note={!d.name.trim() ? 'Give the playlist a name to save it.' : 'TVs on this playlist update within a minute. Nobody is messaged.'}>
          <Button title={isNew ? 'Create playlist' : 'Save playlist'} loading={busy} disabled={!dirty || !d.name.trim()} onPress={save} />
        </ActionBar>
      }>
      <Card padded style={{ gap: 12 }}>
        <TextField label="Name" value={d.name} onChangeText={(v) => edit({ name: v })} maxLength={80} placeholder="General announcements" />
        <TextField label="Description (optional)" value={d.description} onChangeText={(v) => edit({ description: v })} maxLength={300} multiline />
        {!isNew ? (
          <SelectField
            label="Status"
            value={d.status}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
            onChange={(v) => edit({ status: v })}
            hint={d.status === 'archived' ? 'TVs on it go back to showing every post.' : undefined}
          />
        ) : null}
      </Card>

      {!isNew ? (
        <SummaryCard
          rows={[{ key: 'tvs', label: 'Playing on', value: tvsQ.data ? (tvsOn.length ? tvsOn.map((t) => t.name || 'TV').join(', ') : 'No TV yet') : '…' }]}
        />
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title={`Posts${d.rows.length ? ` (${d.rows.length})` : ''}`} />
        <Text variant="caption" muted>
          Shown in this order, then repeated. Emergency posts always interrupt.
        </Text>
        {postsQ.isError && !postsQ.data ? <Banner tone="warning" message="Couldn’t load the posts, so their titles may be missing." /> : null}
        {!d.rows.length ? (
          <EmptyState icon={<Tv color={palette.textMuted} />} title="No posts yet" message="Add the posts this playlist should show." />
        ) : (
          d.rows.map((r, i) => {
            const a = postOf(r.announcementId);
            const gone = !!postsQ.data && (!a || !usable.some((x) => x.id === a.id));
            return (
              <Card key={r.key} padded style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Text variant="label" muted style={{ minWidth: 20 }}>
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text variant="body" numberOfLines={2}>
                      {a?.title || (postsQ.data ? 'Post no longer available' : 'Loading…')}
                    </Text>
                    {a ? (
                      <Text variant="caption" muted numberOfLines={1}>
                        {postTypeLabel(a)}
                        {a.expiresAt ? ` · until ${dateLabel(a.expiresAt)}` : ''}
                      </Text>
                    ) : null}
                    {gone ? <StatusPill label="Expired or removed" tone="failed" /> : null}
                  </View>
                </View>
                <TextField
                  label="Seconds on screen"
                  value={r.seconds}
                  onChangeText={(v) => setRow(i, { seconds: v.replace(/\D/g, '').slice(0, 3) })}
                  keyboardType="number-pad"
                  error={r.seconds && !secondsOk(r.seconds) ? '3 to 300' : null}
                />
                <DateField label="First day (optional)" value={r.startDate} onChange={(v) => setRow(i, { startDate: v })} />
                <DateField label="Last day (optional)" value={r.endDate} onChange={(v) => setRow(i, { endDate: v })} minimumDate={r.startDate ?? undefined} />
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button title="Change post" variant="ghost" size="sm" icon={<Repeat />} onPress={() => setPicker({ index: i })} style={{ marginRight: 'auto' }} />
                  {r.startDate || r.endDate ? (
                    <Button title="Clear days" variant="ghost" size="sm" onPress={() => setRow(i, { startDate: null, endDate: null })} />
                  ) : null}
                  <IconButton accessibilityLabel={`Move post ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)}>
                    <ArrowUp size={18} color={i === 0 ? palette.textFaint : palette.ink} />
                  </IconButton>
                  <IconButton accessibilityLabel={`Move post ${i + 1} down`} disabled={i === d.rows.length - 1} onPress={() => move(i, 1)}>
                    <ArrowDown size={18} color={i === d.rows.length - 1 ? palette.textFaint : palette.ink} />
                  </IconButton>
                  <IconButton accessibilityLabel={`Remove post ${i + 1}`} onPress={() => edit({ rows: d.rows.filter((_, k) => k !== i) })}>
                    <X size={18} color={palette.dangerInk} />
                  </IconButton>
                </View>
              </Card>
            );
          })
        )}
        <Button title="Add a post" variant="accent" icon={<Plus />} disabled={d.rows.length >= 200} onPress={() => setPicker({ index: null })} />
      </View>

      {error ? <Banner tone="danger" message={error} /> : null}

      <Sheet visible={!!picker} onClose={() => setPicker(null)} title={picker?.index == null ? 'Add a post' : 'Change the post'}>
        <PillField icon={Search} placeholder="Search posts" value={search} onChangeText={setSearch} accessibilityLabel="Search posts" />
        {!postsQ.data ? (
          <SkeletonList rows={4} avatar />
        ) : !choices.length ? (
          <EmptyState title={q ? 'No post matches' : 'No posts a TV can show'} message="Pop-ups and expired posts can’t go on a TV." />
        ) : (
          <ListCard>
            {choices.map((a) => (
              <ListRow
                key={a.id}
                left={<ModuleBadge module="news" icon={Tv} />}
                title={a.title || 'Untitled post'}
                subtitle={`${postTypeLabel(a)}${a.branches?.length ? ` · ${a.branches.join(', ')}` : ' · Every branch'}`}
                onPress={() => pick(a)}
              />
            ))}
          </ListCard>
        )}
      </Sheet>

      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this playlist?"
        from={{ title: existing?.name || 'Playlist', subtitle: plural(d.rows.length, 'post'), icon: ListVideo, module: 'news' }}
        to={{ title: 'Every post', subtitle: tvsOn.length ? `${plural(tvsOn.length, 'TV')} fall back` : 'No TV uses it', icon: Tv, module: 'news' }}
        confirmLabel="Swipe to delete"
        loading={writes.remove.isPending}
        onConfirm={() =>
          writes.remove.mutate(id, {
            onSuccess: () => {
              setDeleting(false);
              toast.show('Playlist deleted', 'success');
              router.back();
            },
          })
        }
        note="The posts themselves stay. Nobody is messaged.">
        {writes.remove.error ? <Banner tone="danger" title="Couldn’t delete" message={writes.remove.error.message} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}
