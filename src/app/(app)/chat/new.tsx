// New chat or group (website MeetsNewModal, dash.html:7176).
//   Person  tap someone: POST /meets/conversations {type:'direct', memberIds:[id]} and the chat opens.
//           If we already have a chat, the server returns it (existed: true) and that one opens.
//   Group   a name (100 characters at most) and the people in it, then "Create group (n)".
// Nobody is emailed or WhatsApped: the new chat appears in their chat list.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Type, UserRound, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { chatApi, chatKeys, type MeetsPerson, useDirectory } from '@/api/chat';
import { isApiError } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { canSeeMeets } from '@/features/chat/access';
import { PeopleList } from '@/features/chat/people-list';
import { plural } from '@/lib/format';
import { space } from '@/theme/tokens';
import { ActionBar, Banner, Button, haptic, NavHeader, PillField, Screen, SelectTiles, Text } from '@/ui';

type Mode = 'direct' | 'group';

export default function NewChatScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ mode?: string }>();
  const user = useSession((s) => s.user);
  const tenant = useMyTenant().data;
  const on = canSeeMeets(user, tenant);
  const dir = useDirectory(on);
  const [mode, setMode] = useState<Mode>(params.mode === 'group' ? 'group' : 'direct');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-check the gate (the session may still be loading: only a signed-in person without chat goes home).
  if (user && !on) return <Redirect href="/" />;

  const open = (id: string, title?: string | null) => {
    void qc.invalidateQueries({ queryKey: chatKeys.conversations(user?.id) });
    router.replace({ pathname: '/chat/[id]', params: { id, ...(title ? { name: title } : null) } });
  };

  const startDirect = async (p: MeetsPerson) => {
    if (busy) return;
    setError(null);
    setBusy(p.id);
    const r = await chatApi.createDirect(p.id);
    setBusy(null);
    if (isApiError(r) || !r?.conversation?.id) {
      setError(isApiError(r) ? r.error : 'Could not start that chat.');
      return;
    }
    haptic.success();
    open(r.conversation.id, p.name);
  };

  const createGroup = async () => {
    if (busy) return;
    if (!picked.length) return setError('Pick at least one person.');
    if (!name.trim()) return setError('Give the group a name.');
    setError(null);
    setBusy('group');
    const r = await chatApi.createGroup(name.trim(), picked);
    setBusy(null);
    if (isApiError(r) || !r?.conversation?.id) {
      setError(isApiError(r) ? r.error : 'Could not create that group.');
      return;
    }
    haptic.success();
    open(r.conversation.id, name.trim());
  };

  const toggle = (p: MeetsPerson) => {
    setError(null);
    setPicked((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]));
  };

  const group = mode === 'group';
  return (
    <Screen
      header={<NavHeader title={group ? 'New group' : 'New chat'} />}
      footer={
        group ? (
          <ActionBar note={!name.trim() ? 'Name the group to create it' : !picked.length ? 'Pick who is in it' : null}>
            <Button
              title={picked.length ? `Create group (${picked.length})` : 'Create group'}
              icon={<UsersRound />}
              disabled={!picked.length || !name.trim()}
              loading={busy === 'group'}
              onPress={createGroup}
            />
          </ActionBar>
        ) : undefined
      }>
      <SelectTiles<Mode>
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        accessibilityLabel="Chat type"
        options={[
          { value: 'direct', label: 'Person', icon: UserRound, sub: 'One colleague' },
          { value: 'group', label: 'Group', icon: UsersRound, sub: 'Several people' },
        ]}
      />

      {group ? (
        <View style={{ gap: space.xs }}>
          <PillField icon={Type} placeholder="Group name, e.g. Post Production" value={name} onChangeText={setName} maxLength={100} accessibilityLabel="Group name" />
          <Text variant="caption" muted>
            {picked.length ? `${plural(picked.length, 'person', 'people')} picked. You can add more later.` : 'You can add more people later.'}
          </Text>
        </View>
      ) : (
        <Text variant="label" muted>
          Pick one person. If you already have a chat with them, it opens that one.
        </Text>
      )}

      {error ? <Banner tone="danger" title="Couldn’t do that" message={error} /> : null}

      <PeopleList
        people={dir.data ?? []}
        loading={dir.isPending}
        error={dir.isError ? dir.error?.message ?? 'Couldn’t load people.' : null}
        onRetry={() => void dir.refetch()}
        selected={group ? picked : []}
        multi={group}
        busyId={group ? null : busy}
        onPick={group ? toggle : startDirect}
        emptyText="Nobody else is on DASH yet."
      />
    </Screen>
  );
}
