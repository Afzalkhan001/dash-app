// One office TV — the website's TvManageModal + TvSendModal (dash.html:3039 / 3081): its state (online,
// app, what it shows, playlist, last signal), the remote (sync, refresh, reload, clear cache, back to
// playlist — each acts on the TV live), "Show a post now", its settings, the recent log, and Unpair
// (the TV goes back to showing a new code; swiped to confirm).

import { Redirect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { Eraser, ListRestart, MonitorPlay, Pencil, RefreshCw, RotateCw, Tv, Unlink, Undo2 } from 'lucide-react-native';
import { useState } from 'react';

import { useAnnouncements } from '@/api/announcements';
import { type TvCommand, useBranches, useTvCommand, useTvDevices, useTvLogs, useTvPlaylists, useUnpairTv } from '@/api/newsroom';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { agoLabel, playlistName, TV_INACTIVITY, TV_REMOTE, tvLogLine, tvOnline, tvPlatformLabel, tvUsablePosts } from '@/features/newsroom/format';
import { useNewsroomAccess } from '@/features/newsroom/gate';
import { ShowNowSheet, TvSettingsSheet } from '@/features/newsroom/tv-sheets';
import { stampLabel } from '@/lib/dates';
import { palette } from '@/theme/tokens';
import {
  Button,
  Card,
  CategoryGrid,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  EventTimeline,
  LabelledSection,
  NavHeader,
  Screen,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  Text,
  toast,
} from '@/ui';

const REMOTE_ICON = { SYNC: RefreshCw, REFRESH: RotateCw, RELOAD: ListRestart, CLEAR_CACHE: Eraser, RETURN_TO_PLAYLIST: Undo2 } as const;

export default function TvScreen() {
  const router = useRouter();
  const now = useNow(30_000);
  const today = useTodayIst();
  const focused = useIsFocused();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, tvs } = useNewsroomAccess();
  const devices = useTvDevices(tvs, focused);
  const playlists = useTvPlaylists(tvs);
  const branches = useBranches(tvs);
  const posts = useAnnouncements();
  const logs = useTvLogs(String(id ?? ''), tvs);
  const cmd = useTvCommand();
  const unpair = useUnpairTv();
  const [editKey, setEditKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showing, setShowing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [gone, setGone] = useState<string | null>(null);

  if (ready && !tvs) return <Redirect href="/" />;

  if (gone) {
    return (
      <Screen header={<NavHeader title="TV" />}>
        <SuccessSheet visible onClose={() => router.back()} onPrimary={() => router.back()} title="TV unpaired" subtitle={`${gone} now shows a new pairing code.`} />
      </Screen>
    );
  }

  const d = (devices.data ?? []).find((x) => x.id === id) ?? null;
  if (!d) {
    return (
      <Screen header={<NavHeader title="TV" />}>
        {devices.isPending ? (
          <SkeletonList rows={6} />
        ) : devices.isError ? (
          <ErrorState message={devices.error?.message ?? ''} onRetry={() => void devices.refetch()} />
        ) : (
          <EmptyState icon={<Tv color={palette.textMuted} />} title="This TV isn’t paired any more" message="Someone may have unpaired it." />
        )}
      </Screen>
    );
  }

  const on = tvOnline(d);
  const name = d.name || 'TV';
  const lists = playlists.data ?? [];
  const current = d.currentAnnouncementId ? (posts.data ?? []).find((a) => a.id === d.currentAnnouncementId) : null;
  const inactivity = TV_INACTIVITY.find((o) => o.value === String(d.config?.inactivityMinutes ?? 5))?.label ?? '5 minutes';

  const remote = (command: Exclude<TvCommand, 'SHOW_ANNOUNCEMENT'>, label: string) =>
    cmd.mutate(
      { id: d.id, command },
      {
        onSuccess: () => toast.show(`${label}: sent to ${name}. It applies within a minute.`),
        onError: (e) => toast.show(`Not sent: ${e.message}`, 'danger'),
      },
    );

  return (
    <Screen
      header={
        <NavHeader
          title={name}
          subtitle={d.location || 'All branches'}
          actions={[
            {
              key: 'edit',
              icon: Pencil,
              label: 'TV settings',
              onPress: () => {
                setEditKey((k) => k + 1);
                setEditing(true);
              },
            },
          ]}
        />
      }
      onRefresh={() => Promise.all([devices.refetch(), logs.refetch()])}>
      <SummaryCard
        rows={[
          { key: 'status', label: 'Status', value: on ? 'Online' : 'Offline', status: on ? 'done' : 'failed' },
          { key: 'now', label: 'Showing now', value: d.currentAnnouncementId ? (current ? current.title || 'Untitled post' : 'A post') : '—' },
          { key: 'pl', label: 'Playlist', value: playlistName(d, lists) },
          { key: 'seen', label: 'Last signal', value: agoLabel(d.lastSeenAt, now) },
          { key: 'sync', label: 'Last sync', value: agoLabel(d.lastSyncAt, now) },
          { key: 'app', label: 'App', value: `${tvPlatformLabel(d)}${d.appVersion ? ` · v${d.appVersion}` : ''}` },
          { key: 'idle', label: 'Back to posts after', value: inactivity },
          ...(d.claimedAt ? [{ key: 'paired', label: 'Paired', value: stampLabel(d.claimedAt, today) }] : []),
        ]}
      />

      <Button title="Show a post now" icon={<MonitorPlay />} onPress={() => setShowing(true)} />

      <LabelledSection title="Remote">
        <CategoryGrid
          columns={3}
          items={TV_REMOTE.map((r) => ({
            key: r.command,
            label: r.label,
            icon: REMOTE_ICON[r.command],
            module: 'news' as const,
            hint: r.hint,
            onPress: () => remote(r.command, r.label),
          }))}
        />
        {!on ? (
          <Text variant="caption" muted>
            This TV is offline. It acts on these when it comes back.
          </Text>
        ) : null}
      </LabelledSection>

      <LabelledSection title="Recent log">
        {logs.isPending ? (
          <SkeletonList rows={3} tone="surface" />
        ) : (
          <Card>
            {logs.isError ? (
              <Text variant="caption" muted>
                The log could not be loaded.
              </Text>
            ) : (logs.data ?? []).length ? (
              <EventTimeline
                events={(logs.data ?? []).slice(0, 15).map((l, i) => {
                  const line = tvLogLine(l.event_type, l.message);
                  return {
                    key: `${l.created_at}-${i}`,
                    label: line.label,
                    detail: line.detail,
                    at: stampLabel(l.created_at, today),
                    tone: /error|fail|offline/i.test(l.event_type) ? 'bad' : 'neutral',
                  };
                })}
              />
            ) : (
              <Text variant="caption" muted>
                No log lines yet.
              </Text>
            )}
          </Card>
        )}
      </LabelledSection>

      <Button variant="danger" title="Unpair this TV" icon={<Unlink />} onPress={() => setConfirm(true)} />

      <TvSettingsSheet key={editKey} visible={editing} onClose={() => setEditing(false)} device={d} playlists={lists} branches={branches.data ?? []} />
      <ShowNowSheet visible={showing} onClose={() => setShowing(false)} device={d} posts={tvUsablePosts(posts.data ?? [])} />

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={`Unpair ${name}?`}
        from={{ title: name, subtitle: on ? 'Online' : 'Offline', icon: Tv, module: 'news' }}
        to={{ title: 'Unpaired', subtitle: 'Shows a new code', icon: Unlink, module: 'security' }}
        confirmLabel="Swipe to unpair"
        loading={unpair.isPending}
        onConfirm={() =>
          unpair.mutate(d.id, {
            onSuccess: () => {
              setConfirm(false);
              setGone(name);
            },
            onError: (e) => toast.show(`Couldn’t unpair: ${e.message}`, 'danger'),
          })
        }
        note="It stops showing posts at once and goes back to a pairing code. To use it again, pair it with the new code. No one is notified."
      />
    </Screen>
  );
}
