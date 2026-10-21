// Clients (web: ClientsView, dash.html:23331): the clients this person added — GET /clients is the
// whole company, kept to managerId = me or managerName = my name, exactly as the web filters it.
//
// + adds one (Name required; channel, email, contact number). Each row's ••• has Call, Email,
// WhatsApp, Book a professional (a shortcut only — the client isn't carried into the booking, as on
// the web), Edit, and Delete (a swipe: it can't be undone). CSV upload stays on the website.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarPlus, Mail, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, Search, SearchX, Trash2, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { clientWriteKeys, createClient, deleteClient, updateClient, useAllClients, type WorkClient } from '@/api/work';
import { callNumber, canWhatsApp, openWhatsApp, phoneDisplay, sendMail } from '@/features/people/contact';
import { canSeeClients, isMyClient } from '@/features/work/access';
import { WorkGate } from '@/features/work/gate';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import {
  Avatar,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  haptic,
  ListCard,
  ListRow,
  type MenuItem,
  MenuSheet,
  NavHeader,
  PillField,
  Screen,
  Sheet,
  SkeletonList,
  SummaryCard,
  SummaryHero,
  TextField,
  toast,
} from '@/ui';

const AFTER_MENU_MS = 420;
type Draft = { name: string; channelName: string; email: string; phone: string };
const EMPTY: Draft = { name: '', channelName: '', email: '', phone: '' };

export default function ClientsRoute() {
  return (
    <WorkGate title="Clients" allow={canSeeClients}>
      <Clients />
    </WorkGate>
  );
}

function Clients() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = access.user;
  const q0 = useAllClients();
  const [q, setQ] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const [del, setDel] = useState<WorkClient | null>(null);
  const [delOpen, setDelOpen] = useState(false);

  const mine = (Array.isArray(q0.data) ? q0.data : []).filter((c) => isMyClient(c, me)).sort((a, b) => a.name.localeCompare(b.name));
  const needle = q.trim().toLowerCase();
  const shown = needle ? mine.filter((c) => [c.name, c.channelName, c.email, c.phone].some((v) => v.toLowerCase().includes(needle))) : mine;
  const menuClient = menuId ? mine.find((c) => c.id === menuId) : undefined;
  const refresh = () => Promise.all(clientWriteKeys(me?.id).map((queryKey) => qc.invalidateQueries({ queryKey })));

  const save = useMutation({
    mutationFn: async (f: { id: string | null; draft: Draft }) => {
      const d = { name: f.draft.name.trim(), channelName: f.draft.channelName.trim(), email: f.draft.email.trim(), phone: f.draft.phone.trim() };
      if (f.id) return updateClient(f.id, d);
      return createClient({ id: `cl${Date.now()}`, managerId: me?.id ?? '', managerName: me?.name ?? '', ...d, createdAt: new Date().toISOString() });
    },
    onSuccess: (_r, f) => {
      haptic.success();
      setFormOpen(false);
      toast.show(f.id ? 'Client saved' : 'Client added', 'success');
      void refresh();
    },
    onError: () => haptic.error(),
  });
  const remove = useMutation({
    mutationFn: (c: WorkClient) => deleteClient(c.id),
    onSuccess: () => {
      haptic.success();
      setDelOpen(false);
      toast.show('Client deleted', 'success');
      void refresh();
    },
    onError: () => haptic.error(),
  });

  const openForm = (c: WorkClient | null, fromMenu = false) => {
    save.reset();
    setTried(false);
    setForm({ id: c?.id ?? null, draft: c ? { name: c.name, channelName: c.channelName, email: c.email, phone: c.phone } : EMPTY });
    if (fromMenu) setTimeout(() => setFormOpen(true), AFTER_MENU_MS);
    else setFormOpen(true);
  };
  const setField = (k: keyof Draft) => (v: string) => setForm((f) => (f ? { ...f, draft: { ...f.draft, [k]: v } } : f));

  const menu = (c: WorkClient): MenuItem[] => [
    ...(c.phone ? [{ key: 'call', label: 'Call', icon: Phone, onPress: () => callNumber(c.phone) }] : []),
    ...(c.phone && canWhatsApp(c.phone) ? [{ key: 'wa', label: 'WhatsApp', icon: MessageCircle, onPress: () => openWhatsApp(c.phone) }] : []),
    ...(c.email ? [{ key: 'mail', label: 'Email', icon: Mail, onPress: () => sendMail(c.email) }] : []),
    ...(access.web('booking') ? [{ key: 'book', label: 'Book a professional', icon: CalendarPlus, onPress: () => router.push('/admin/booking/pro') }] : []),
    { key: 'edit', label: 'Edit', icon: Pencil, onPress: () => openForm(c, true) },
    {
      key: 'delete',
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      onPress: () => {
        remove.reset();
        setDel(c);
        setTimeout(() => setDelOpen(true), AFTER_MENU_MS);
      },
    },
  ];

  const draft = form?.draft ?? EMPTY;
  const nameMissing = !draft.name.trim();

  return (
    <Screen
      header={<NavHeader title="Clients" actions={[{ icon: Plus, label: 'Add a client', onPress: () => openForm(null) }]} />}
      onRefresh={() => q0.refetch()}>
      {q0.data ? (
        <SummaryHero icon={UsersRound} module="tasks" label="Your clients" value={mine.length} sub={mine.length ? 'Only you see the clients you add.' : undefined} />
      ) : null}
      {mine.length > 6 ? (
        <PillField icon={Search} value={q} onChangeText={setQ} placeholder="Search clients" accessibilityLabel="Search clients" autoCorrect={false} returnKeyType="search" />
      ) : null}

      {q0.isPending && !q0.data ? (
        <SkeletonList rows={4} avatar />
      ) : q0.isError && !q0.data ? (
        <ErrorState message={q0.error.message} onRetry={() => void q0.refetch()} />
      ) : !mine.length ? (
        <EmptyState
          icon={<UsersRound color={palette.textMuted} />}
          title="No clients yet"
          message="Add the clients you work with, to call or email them from here."
          action={<Button title="Add a client" variant="accent" size="md" icon={<Plus />} onPress={() => openForm(null)} />}
        />
      ) : !shown.length ? (
        <EmptyState icon={<SearchX color={palette.textMuted} />} title="No clients found" message={`Nothing matches “${q.trim()}”.`} />
      ) : (
        <View style={styles.list}>
          <ListCard tone="surface">
            {shown.map((c) => {
              const sub = [c.channelName, phoneDisplay(c.phone), c.email].filter(Boolean).join(' · ');
              return (
                <ListRow
                  key={c.id}
                  size="lg"
                  left={<Avatar name={c.name} size={40} ring={false} />}
                  title={c.name}
                  subtitle={sub || undefined}
                  subtitleLines={2}
                  onPress={() => {
                    setMenuId(c.id);
                    setMenuOpen(true);
                  }}
                  // A plain ••• hint, not a second button: the whole row opens the same menu, and a
                  // button inside the row's button is invalid HTML on web (React warns).
                  right={<MoreHorizontal size={20} color={palette.text} />}
                  accessibilityLabel={`${c.name}${sub ? `, ${sub}` : ''}`}
                  accessibilityHint="Shows call, email and edit"
                />
              );
            })}
          </ListCard>
        </View>
      )}

      <MenuSheet
        visible={menuOpen && !!menuClient}
        onClose={() => setMenuOpen(false)}
        title={menuClient?.name ?? 'Client'}
        subtitle={menuClient?.channelName || undefined}
        items={menuClient ? menu(menuClient) : []}
      />

      <Sheet
        visible={formOpen}
        onClose={() => (save.isPending ? undefined : setFormOpen(false))}
        dirty={!save.isPending && !!(draft.name || draft.channelName || draft.email || draft.phone) && !form?.id}
        title={form?.id ? 'Edit client' : 'Add a client'}
        subtitle="Only you see it. No message is sent."
        footer={
          <Button
            title={form?.id ? 'Save changes' : 'Add client'}
            loading={save.isPending}
            onPress={() => {
              setTried(true);
              if (form && !nameMissing) save.mutate(form);
            }}
          />
        }>
        <TextField label="Name" value={draft.name} onChangeText={setField('name')} placeholder="Client or company name" error={tried && nameMissing ? 'Add a name' : null} autoFocus={!form?.id} />
        <TextField label="Channel name" value={draft.channelName} onChangeText={setField('channelName')} placeholder="Optional" />
        <TextField label="Email" value={draft.email} onChangeText={setField('email')} placeholder="Optional" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <TextField label="Contact number" value={draft.phone} onChangeText={setField('phone')} placeholder="Optional" keyboardType="phone-pad" />
        {save.error ? <Banner tone="danger" title="Couldn’t save the client" message={save.error.message} /> : null}
      </Sheet>

      <ConfirmSheet
        visible={delOpen && !!del}
        onClose={() => setDelOpen(false)}
        title="Delete this client?"
        detailsTitle="Client"
        confirmLabel="Swipe to delete"
        onConfirm={() => del && remove.mutate(del)}
        loading={remove.isPending}
        note="This removes the client for good. No message is sent.">
        {del ? (
          <SummaryCard
            rows={[
              { key: 'name', label: 'Name', value: del.name },
              { key: 'channel', label: 'Channel', value: del.channelName },
              { key: 'phone', label: 'Contact number', value: phoneDisplay(del.phone) },
              { key: 'email', label: 'Email', value: del.email },
            ]}
            hideEmpty
          />
        ) : null}
        {remove.error ? <Banner tone="danger" title="Couldn’t delete it" message={remove.error.message} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { gap: space.sm },
}));
