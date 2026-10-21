// Add a TV — the website's TvAddModal (dash.html:3012): stand in front of the TV, type the 6-digit
// code it shows, name it, pick its branch, its playlist and when it goes back to the posts after
// someone uses its remote → POST /tv/admin/claim (tv.js:426). The server's own words show when the
// code is wrong or has expired.

import { Redirect, useRouter } from 'expo-router';
import { Link2 } from 'lucide-react-native';
import { useState } from 'react';

import { usePairTv, useTvPlaylists, useBranches } from '@/api/newsroom';
import { TV_INACTIVITY } from '@/features/newsroom/format';
import { useNewsroomAccess } from '@/features/newsroom/gate';
import { ActionBar, Banner, Button, LabelledSection, NavHeader, OtpBoxes, Screen, SelectField, SuccessSheet, TextField } from '@/ui';

const ALL = '__all';

export default function AddTvScreen() {
  const router = useRouter();
  const { ready, tvs } = useNewsroomAccess();
  const branches = useBranches(tvs);
  const playlists = useTvPlaylists(tvs);
  const pair = usePairTv();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState(ALL);
  const [playlistId, setPlaylistId] = useState(ALL);
  const [inactivity, setInactivity] = useState('5');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (ready && !tvs) return <Redirect href="/" />;

  const submit = () => {
    setError(null);
    pair.mutate(
      {
        code: code.trim(),
        name: name.trim(),
        location: location === ALL ? '' : location,
        playlistId: playlistId === ALL ? null : playlistId,
        inactivityMinutes: Number(inactivity),
      },
      {
        onSuccess: (r) => setDone(r?.device?.name || name.trim() || 'TV Display'),
        onError: (e) => setError(e.message || 'That code didn’t work. Use the code the TV shows now.'),
      },
    );
  };

  if (done) {
    return (
      <Screen header={<NavHeader title="Add a TV" />}>
        <SuccessSheet
          visible
          onClose={() => router.back()}
          onPrimary={() => router.back()}
          title="TV connected"
          subtitle={`${done} starts showing posts in a few seconds.`}
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={<NavHeader title="Add a TV" />}
      keyboardShouldPersistTaps="handled"
      footer={
        <ActionBar note={code.length !== 6 ? 'Type the 6-digit code first.' : null}>
          <Button title="Pair this TV" icon={<Link2 />} disabled={code.length !== 6} loading={pair.isPending} onPress={submit} />
        </ActionBar>
      }>
      <LabelledSection title="Code on the TV">
        <OtpBoxes
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          error={!!error}
          accessibilityLabel="Pairing code shown on the TV"
        />
      </LabelledSection>
      {error ? <Banner tone="danger" title="Not paired" message={error} /> : null}

      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Reception TV" maxLength={80} />
      <SelectField<string>
        label="Branch"
        value={location}
        onChange={setLocation}
        options={[{ value: ALL, label: 'All branches' }, ...(branches.data ?? []).map((b) => ({ value: b, label: b }))]}
        hint="It shows posts for this branch and for all branches."
      />
      <SelectField<string>
        label="Playlist"
        value={playlistId}
        onChange={setPlaylistId}
        options={[
          { value: ALL, label: 'All published posts' },
          ...(playlists.data ?? []).filter((p) => p.status !== 'archived').map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
      <SelectField<string>
        label="Back to the posts after no remote use for"
        value={inactivity}
        onChange={setInactivity}
        options={TV_INACTIVITY}
      />
    </Screen>
  );
}
