// The two sheets on a TV's screen:
//   TvSettingsSheet  the website's TvManageModal fields (dash.html:3039): name, branch, playlist, back to
//                    the posts after no remote use, when it counts as offline, and the offline dot →
//                    PATCH /tv/admin/devices/:id (tv.js:467; config is merged on the server).
//   ShowNowSheet     TvSendModal (dash.html:3081): one post (not a pop-up, not expired) for 30 s – 1 h,
//                    then the TV goes back to its playlist → command SHOW_ANNOUNCEMENT.

import { MonitorPlay, Undo2 } from 'lucide-react-native';
import { useState } from 'react';

import type { Announcement } from '@/api/announcements';
import { type TvDevice, type TvPlaylist, useTvCommand, useUpdateTv } from '@/api/newsroom';
import { TV_INACTIVITY, TV_OFFLINE, TV_SHOW_FOR } from '@/features/newsroom/format';
import { ToggleRow } from '@/features/newsroom/toggle-row';
import { ActionRow, Button, FieldMessage, ListCard, SelectField, Sheet, TextField, toast } from '@/ui';

const ALL = '__all';

export function TvSettingsSheet({
  visible,
  onClose,
  device,
  playlists,
  branches,
}: {
  visible: boolean;
  onClose: () => void;
  device: TvDevice;
  playlists: TvPlaylist[];
  branches: string[];
}) {
  const c = device.config ?? {};
  const [name, setName] = useState(device.name || '');
  const [location, setLocation] = useState(device.location || ALL);
  const [playlistId, setPlaylistId] = useState(c.playlistId || ALL);
  const [inactivity, setInactivity] = useState(String(c.inactivityMinutes ?? 5));
  const [offline, setOffline] = useState(String(c.offlineThresholdSeconds || 180));
  const [dot, setDot] = useState(!!c.showOfflineIndicator);
  const [error, setError] = useState<string | null>(null);
  const save = useUpdateTv();

  const branchList = !device.location || branches.includes(device.location) ? branches : [device.location, ...branches];
  const offlineOpts = TV_OFFLINE.some((o) => o.value === offline) ? TV_OFFLINE : [{ value: offline, label: `${Math.round(Number(offline) / 60)} minutes` }, ...TV_OFFLINE];
  const dirty =
    name.trim() !== (device.name || '') ||
    location !== (device.location || ALL) ||
    playlistId !== (c.playlistId || ALL) ||
    inactivity !== String(c.inactivityMinutes ?? 5) ||
    offline !== String(c.offlineThresholdSeconds || 180) ||
    dot !== !!c.showOfflineIndicator;

  const submit = () => {
    setError(null);
    save.mutate(
      {
        id: device.id,
        patch: {
          name: name.trim(),
          location: location === ALL ? '' : location,
          config: {
            playlistId: playlistId === ALL ? null : playlistId,
            inactivityMinutes: Number(inactivity),
            offlineThresholdSeconds: Number(offline),
            showOfflineIndicator: dot,
          },
        },
      },
      {
        onSuccess: () => {
          toast.show('Saved. The TV picks it up in a moment.');
          onClose();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="TV settings"
      dirty={dirty}
      footer={<Button title="Save changes" disabled={!dirty} loading={save.isPending} onPress={submit} />}>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={80} placeholder="Reception TV" />
      <SelectField<string> label="Branch" value={location} onChange={setLocation} options={[{ value: ALL, label: 'All branches' }, ...branchList.map((b) => ({ value: b, label: b }))]} />
      <SelectField<string>
        label="Playlist"
        value={playlistId}
        onChange={setPlaylistId}
        options={[
          { value: ALL, label: 'All published posts' },
          ...playlists.filter((p) => p.status !== 'archived' || p.id === playlistId).map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
      <SelectField<string> label="Back to the posts after no remote use for" value={inactivity} onChange={setInactivity} options={TV_INACTIVITY} />
      <SelectField<string> label="Show as offline after no signal for" value={offline} onChange={setOffline} options={offlineOpts} />
      <ListCard>
        <ToggleRow title="Offline dot on the TV" subtitle="A small dot in the corner of the TV while it can’t reach DASH." value={dot} onChange={setDot} />
      </ListCard>
      <FieldMessage error={error} />
    </Sheet>
  );
}

export function ShowNowSheet({ visible, onClose, device, posts }: { visible: boolean; onClose: () => void; device: TvDevice; posts: Announcement[] }) {
  const [id, setId] = useState<string | null>(null);
  const [secs, setSecs] = useState('60');
  const cmd = useTvCommand();
  const name = device.name || 'the TV';

  const send = (command: 'SHOW_ANNOUNCEMENT' | 'RETURN_TO_PLAYLIST') =>
    cmd.mutate(
      command === 'SHOW_ANNOUNCEMENT' && id ? { id: device.id, command, payload: { announcementId: id, seconds: Number(secs) } } : { id: device.id, command: 'RETURN_TO_PLAYLIST' },
      {
        onSuccess: () => {
          toast.show(command === 'SHOW_ANNOUNCEMENT' ? `Sent to ${name}. It shows within a minute.` : `${name} is going back to its playlist.`);
          onClose();
        },
        onError: (e) => toast.show(`Not sent: ${e.message}`, 'danger'),
      },
    );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Show a post now"
      subtitle={`On ${name} only, for a set time. Then it goes back to its playlist.`}
      footer={
        <ActionRow context="bar">
          <Button variant="ghost" title="Back to playlist" icon={<Undo2 />} disabled={cmd.isPending} onPress={() => send('RETURN_TO_PLAYLIST')} />
          <Button title="Show it" icon={<MonitorPlay />} disabled={!id} loading={cmd.isPending} onPress={() => send('SHOW_ANNOUNCEMENT')} />
        </ActionRow>
      }>
      <SelectField<string>
        label="Post"
        value={id}
        onChange={setId}
        placeholder={posts.length ? 'Choose a post' : 'No posts to show'}
        options={posts.map((a) => ({ value: a.id, label: a.title || '(untitled)' }))}
        hint="The post must be published for this TV’s branch."
      />
      <SelectField<string> label="Show for" value={secs} onChange={setSecs} options={TV_SHOW_FOR} />
    </Sheet>
  );
}
