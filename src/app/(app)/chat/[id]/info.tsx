// Chat details (website MeetsMembersModal, dash.html:7224, plus the thread's Leave and Export buttons).
//   Summary   type, started, members, my part in it.
//   Members   current members with their role and team. The group's owner or an admin can:
//               - Add people (the directory minus current members) → POST …/members;
//               - Remove someone (never the owner) → swipe to confirm; they keep the history up to now
//                 and can't post again;
//               - Rename the group → PATCH (new on the phone; the endpoint exists, meets.js:947).
//   Export    Excel (.xlsx, like the website), .txt or .csv of what I can read (GET …/export; the
//             server records every export). Excel: features/chatvoice/excel.ts.
//   Leave     a group I'm still in → swipe to confirm; someone must add me back.
// Nobody is emailed or WhatsApped by any of these: chat lists update live.

import { useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Download, FileSpreadsheet, FileText, LogOut, Pencil, Type, UserMinus, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { chatApi, chatKeys, type ExportRow, type MeetsMember, type MeetsPerson, useConversation, useDirectory } from '@/api/chat';
import { isApiError } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { canLeaveGroup, canManageGroup, canRemoveMember, canSeeMeets } from '@/features/chat/access';
import { subtitleOf } from '@/features/chat/format';
import { PeopleList } from '@/features/chat/people-list';
import { shareChatXlsx } from '@/features/chatvoice/excel';
import { shareCsv } from '@/lib/csv';
import { dateLabel } from '@/lib/dates';
import { FileError, shareFile } from '@/lib/files';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  ActionBar,
  Avatar,
  Banner,
  Button,
  ConfirmSheet,
  ErrorState,
  haptic,
  IconBadge,
  LabelledSection,
  ListCard,
  ListRow,
  MenuSheet,
  NavHeader,
  PillField,
  Screen,
  Sheet,
  SkeletonList,
  SummaryCard,
  Text,
  toast,
} from '@/ui';

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

function safeFileName(s: string) {
  return (s || 'chat').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'chat';
}

async function shareText(fileName: string, text: string) {
  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) throw new FileError('Downloading is not available here.');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  // Written straight to the cache (lib/files saveDataUrl does not accept a `;charset=` data URL).
  let uri: string;
  try {
    const f = new File(Paths.cache, fileName);
    if (f.exists) f.delete();
    f.create();
    f.write(text);
    uri = f.uri;
  } catch {
    throw new FileError('The file could not be saved on this phone. Try again.');
  }
  await shareFile(uri, 'text/plain', 'Share chat');
}

export default function ChatInfoScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = String(params.id ?? '');
  const user = useSession((s) => s.user);
  const me = user?.id;
  const tenant = useMyTenant().data;
  const on = canSeeMeets(user, tenant);
  const today = useTodayIst();
  const conv = useConversation(id, on);

  const detail = conv.data?.conversation;
  const manage = canManageGroup(detail);
  const dir = useDirectory(on && manage);

  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [removing, setRemoving] = useState<MeetsMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-check the gate (the session may still be loading: only a signed-in person without chat goes home).
  if (user && !on) return <Redirect href="/" />;

  const members = conv.data?.members ?? [];
  const current = members.filter((m) => !m.leftAt);
  const group = detail?.type === 'group';
  const other = current.find((m) => m.id !== me) ?? members.find((m) => m.id !== me);
  const title = (group ? detail?.name : other?.name) || 'Chat';
  const mine = members.find((m) => m.id === me);
  const addable = (dir.data ?? []).filter((p) => !current.some((m) => m.id === p.id));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: chatKeys.conversation(me, id) });
    void qc.invalidateQueries({ queryKey: chatKeys.conversations(me) });
    void qc.invalidateQueries({ queryKey: chatKeys.unread(me) });
  };

  const addPeople = async () => {
    if (!picked.length) return;
    setAddBusy(true);
    const r = await chatApi.addMembers(id, picked);
    setAddBusy(false);
    if (isApiError(r)) {
      toast.show(r.error, 'danger');
      return;
    }
    haptic.success();
    const n = Array.isArray(r?.added) ? r.added.length : picked.length;
    setAdding(false);
    setPicked([]);
    refresh();
    toast.show(n ? `${plural(n, 'person', 'people')} added` : 'Already in the group');
  };

  const rename = async () => {
    const name = newName.trim();
    if (!name) return;
    setRenameBusy(true);
    const r = await chatApi.rename(id, name);
    setRenameBusy(false);
    if (isApiError(r)) {
      toast.show(r.error, 'danger');
      return;
    }
    haptic.success();
    setRenaming(false);
    refresh();
    toast.show('Group renamed');
  };

  const remove = async () => {
    const m = removing;
    if (!m) return;
    setBusy(true);
    const r = await chatApi.removeMember(id, m.id);
    setBusy(false);
    if (isApiError(r)) {
      setError(r.error);
      setRemoving(null);
      return;
    }
    haptic.success();
    setRemoving(null);
    refresh();
    toast.show(`${m.name || 'They'} removed`);
  };

  const leave = async () => {
    if (!me) return;
    setBusy(true);
    const r = await chatApi.removeMember(id, me);
    setBusy(false);
    if (isApiError(r)) {
      setError(r.error);
      setLeaving(false);
      return;
    }
    haptic.success();
    setLeaving(false);
    refresh();
    void qc.invalidateQueries({ queryKey: chatKeys.messages(me, id) });
    toast.show('You left the group');
    router.back();
  };

  const doExport = async (kind: 'xlsx' | 'txt' | 'csv') => {
    setExporting(true);
    const r = await chatApi.exportChat(id);
    if (isApiError(r)) {
      setExporting(false);
      toast.show(r.error, 'danger');
      return;
    }
    const base = `DASH_Meets_${safeFileName(title)}_${today}`; // the website's file name (dash.html:10107)
    try {
      if (kind === 'xlsx') await shareChatXlsx(base, Array.isArray(r.rows) ? r.rows : []);
      else if (kind === 'txt') await shareText(`${base}.txt`, String(r.txt ?? ''));
      else
        await shareCsv<ExportRow>(base, Array.isArray(r.rows) ? r.rows : [], [
          { label: 'Timestamp (IST)', value: (x) => x.timestamp },
          { label: 'Sender', value: (x) => x.sender },
          { label: 'Message', value: (x) => x.message },
          { label: 'File', value: (x) => x.attachment },
        ], 'Share chat');
      if (r.truncated) toast.show('This chat is very long, so the export stops at the first 20,000 messages.', 'info');
    } catch (e) {
      toast.show(e instanceof FileError ? e.message : 'The file could not be saved. Try again.', 'danger');
    } finally {
      setExporting(false);
    }
  };

  const leaveable = canLeaveGroup(detail);

  return (
    <Screen
      header={<NavHeader title={group ? 'Group details' : 'Chat details'} />}
      onRefresh={() => conv.refetch()}
      footer={
        leaveable ? (
          <ActionBar>
            <Button title="Leave group" variant="danger" icon={<LogOut />} onPress={() => setLeaving(true)} />
          </ActionBar>
        ) : undefined
      }>
      {conv.isPending ? (
        <SkeletonList rows={4} avatar />
      ) : conv.isError && !conv.data ? (
        <ErrorState message={conv.error?.message ?? ''} onRetry={() => void conv.refetch()} />
      ) : (
        <>
          <View style={styles.hero}>
            <Avatar name={title} size={72} ring={false} />
            <Text variant="title" align="center" numberOfLines={2}>
              {title}
            </Text>
            <Text variant="label" muted align="center">
              {subtitleOf(detail?.type, current.length, detail?.leftAt)}
            </Text>
            {manage ? (
              <Button
                title="Rename"
                variant="ghost"
                size="sm"
                icon={<Pencil />}
                onPress={() => {
                  setNewName(detail?.name ?? '');
                  setRenaming(true);
                }}
              />
            ) : null}
          </View>

          {error ? <Banner tone="danger" title="Couldn’t do that" message={error} /> : null}
          {detail?.leftAt ? <Banner tone="info" title="You left this group" message="You can still read and export what was said before you left." /> : null}

          {/* The type and the member count are in the hero and the section title: said once. */}
          <SummaryCard
            rows={[
              { label: 'Started', value: dateLabel(detail?.created_at, today) },
              ...(group && mine ? [{ label: 'You are', value: detail?.leftAt ? `Left on ${dateLabel(detail.leftAt, today)}` : ROLE[mine.role] ?? 'Member' }] : []),
            ]}
          />

          <LabelledSection
            title={group ? `Members (${current.length})` : 'In this chat'}
            right={manage ? <Button title="Add people" variant="text" size="sm" icon={<UserPlus />} onPress={() => setAdding(true)} /> : undefined}>
            <ListCard tone="surface">
              {current.map((m) => {
                const removable = canRemoveMember(detail, m, me);
                return (
                  <ListRow
                    key={m.id}
                    left={<Avatar name={m.name ?? m.email ?? ''} size={40} ring={false} />}
                    title={m.id === me ? `${m.name || 'You'} (you)` : m.name || m.email || 'Colleague'}
                    subtitle={[group ? ROLE[m.role] : null, m.jobTitle, m.dept].filter(Boolean).join(' · ')}
                    right={
                      removable ? (
                        <Button title="Remove" variant="text" size="sm" icon={<UserMinus />} onPress={() => setRemoving(m)} accessibilityLabel={`Remove ${m.name}`} />
                      ) : undefined
                    }
                  />
                );
              })}
            </ListCard>
          </LabelledSection>

          <LabelledSection title="Export">
            <ListCard tone="surface">
              <ListRow
                left={
                  <IconBadge bg={palette.primarySoft}>
                    <Download size={20} color={palette.primaryText} strokeWidth={1.8} />
                  </IconBadge>
                }
                title={exporting ? 'Preparing…' : 'Export chat'}
                subtitle="Excel, text or CSV of the messages you can read. DASH records each export."
                subtitleLines={3}
                chevron
                disabled={exporting}
                onPress={() => setExportMenu(true)}
              />
            </ListCard>
          </LabelledSection>
        </>
      )}

      <MenuSheet
        visible={exportMenu}
        onClose={() => setExportMenu(false)}
        title="Export chat"
        subtitle="Times are India time. Deleted messages are left out; files are named, not included."
        items={[
          { key: 'xlsx', label: 'Excel (.xlsx)', hint: 'The same workbook the website makes', icon: FileSpreadsheet, onPress: () => void doExport('xlsx') },
          { key: 'txt', label: 'Text file (.txt)', hint: 'Easy to read or forward', icon: FileText, onPress: () => void doExport('txt') },
          { key: 'csv', label: 'CSV (.csv)', hint: 'Plain rows that open in any spreadsheet app', icon: Download, onPress: () => void doExport('csv') },
        ]}
      />

      <Sheet
        visible={adding}
        onClose={() => {
          setAdding(false);
          setPicked([]);
        }}
        title="Add people"
        subtitle="They can read the whole history and post. Nobody is emailed or WhatsApped."
        dirty={picked.length > 0}
        footer={<Button title={picked.length ? `Add ${picked.length}` : 'Add'} icon={<UserPlus />} disabled={!picked.length} loading={addBusy} onPress={addPeople} />}>
        <PeopleList
          people={addable}
          loading={dir.isLoading}
          error={dir.isError ? dir.error?.message ?? 'Couldn’t load people.' : null}
          onRetry={() => void dir.refetch()}
          selected={picked}
          multi
          onPick={(p: MeetsPerson) => setPicked((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
          emptyText="Everyone is already in this group."
        />
      </Sheet>

      <Sheet
        visible={renaming}
        onClose={() => setRenaming(false)}
        title="Rename group"
        subtitle="Everyone in the group sees the new name."
        dirty={newName.trim() !== (detail?.name ?? '')}
        footer={<Button title="Save name" disabled={!newName.trim() || newName.trim() === detail?.name} loading={renameBusy} onPress={rename} />}>
        <PillField icon={Type} placeholder="Group name" value={newName} onChangeText={setNewName} maxLength={100} autoFocus accessibilityLabel="Group name" />
      </Sheet>

      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'them'}?`}
        subtitle="They keep the history up to now and can’t post again unless someone adds them back."
        from={{ title: removing?.name ?? '', subtitle: 'Leaves the group', avatar: { name: removing?.name ?? '' } }}
        to={{ title: title, subtitle: plural(current.length, 'member'), avatar: { name: title } }}
        confirmLabel="Swipe to remove"
        onConfirm={remove}
        loading={busy}
        note="Only the member list changes. Nothing is posted in the chat, and no email or WhatsApp is sent."
      />

      <ConfirmSheet
        visible={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave ${title}?`}
        subtitle="You keep the history up to now, but you can’t post again unless someone adds you back."
        from={{ title: user?.name || 'You', subtitle: 'Leaves the group', avatar: { name: user?.name || 'You' } }}
        to={{ title, subtitle: plural(current.length, 'member'), avatar: { name: title } }}
        confirmLabel="Swipe to leave"
        onConfirm={leave}
        loading={busy}
        note="Only the member list changes. Nothing is posted in the chat, and no email or WhatsApp is sent."
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.sm },
}));
