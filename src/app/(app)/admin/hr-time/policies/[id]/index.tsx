// Write or change a policy — the website's PolicyManage form (dash.html ~L4994–5022):
//   GET  /hr/policies/:id                (HR admins read drafts and archived ones too)
//   POST /hr/policies                    a new draft, version 1 (`id` = "new" here)
//   PUT  /hr/policies/:id                409 when archived, or when someone else saved first
//   POST /hr/policies/:id/publish|archive
// hr_policies.js ~L96–165. Super Admin and HR with Policies on.
//
// A full screen, not a sheet: the text can be long. Plain text only (the server stores plain text).
// On a published policy, changing the title, text or link makes a new version and asks everyone to
// read and confirm it again — so that save goes through ConfirmSheet + SwipeToConfirm. Publishing
// (everyone in the audience sees it at once; there is no unpublish) and archiving (final) do too.
// Nobody is messaged by any of this: people see the policy in DASH. A 409 shows the server's words
// with a Reload.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Archive, Check, Eye, Link2, ScrollText, Send, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Policy, usePolicy } from '@/api/policies';
import { type PolicyDepartment, type PolicyInput, usePolicyAcks, usePolicyAdminActions, usePolicyDepartments } from '@/api/hrtime';
import { useTodayIst } from '@/features/attendance/use-now';
import { errorText, GateFallback, ToggleRow, useHrTimeGate } from '@/features/hrtime/ui';
import { dateLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  ActionBar,
  ActionRow,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  ErrorState,
  NavHeader,
  PillField,
  Screen,
  SkeletonList,
  StatusPill,
  SummaryCard,
  Text,
  TextField,
  toast,
} from '@/ui';

const EMPTY: PolicyInput = { title: '', category: '', body: '', link_url: '', requires_ack: true, audience: [] };
const STATUS = { draft: { label: 'Draft', tone: 'pending' }, published: { label: 'Published', tone: 'done' }, archived: { label: 'Archived', tone: 'neutral' } } as const;

export default function PolicyEditorScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = raw === 'new' ? undefined : raw;
  const { pending, allowed } = useHrTimeGate('policies');
  const q = usePolicy(id, allowed && !!id);
  const depts = usePolicyDepartments(allowed);
  const header = <NavHeader title={id ? 'Policy' : 'New policy'} />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  if (id && q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={5} tone="surface" />
      </Screen>
    );
  }
  if (id && (q.error || !q.data)) {
    return (
      <Screen header={header}>
        <ErrorState message={errorText(q.error, 'Policy not found.')} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  const p = id ? (q.data as Policy) : null;
  return (
    <PolicyForm
      key={p ? `${p.id}:${p.version}:${p.status}:${p.updated_at}` : 'new'}
      policy={p}
      departments={depts.data ?? []}
      onReload={() => void Promise.all([q.refetch(), depts.refetch()])}
    />
  );
}

type Confirm = null | 'material' | 'publish' | 'archive';

function PolicyForm({ policy: p, departments, onReload }: { policy: Policy | null; departments: PolicyDepartment[]; onReload: () => void }) {
  const router = useRouter();
  const today = useTodayIst();
  const { save, publish, archive } = usePolicyAdminActions();
  const start: PolicyInput = p
    ? { title: p.title, category: p.category ?? '', body: p.body ?? '', link_url: p.link_url ?? '', requires_ack: !!p.requires_ack, audience: Array.isArray(p.audience) ? p.audience : [] }
    : EMPTY;
  const [form, setForm] = useState<PolicyInput>(start);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const acks = usePolicyAcks(p?.id, !!p && p.status === 'published' && p.requires_ack);
  const archived = p?.status === 'archived';
  const published = p?.status === 'published';
  const set = (patch: Partial<PolicyInput>) => {
    setError(null);
    setForm((f) => ({ ...f, ...patch }));
  };
  const sameAud = form.audience.length === start.audience.length && form.audience.every((a) => start.audience.includes(a));
  const dirty =
    form.title !== start.title ||
    form.category !== start.category ||
    form.body !== start.body ||
    form.link_url !== start.link_url ||
    form.requires_ack !== start.requires_ack ||
    !sameAud;
  const material = !!p && (form.title.trim() !== p.title || form.body.trim() !== (p.body ?? '').trim() || form.link_url.trim() !== (p.link_url ?? ''));
  const busy = save.isPending || publish.isPending || archive.isPending;
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const audienceText = form.audience.length ? form.audience.map((a) => deptName.get(a) ?? 'A removed team').join(', ') : 'everyone';

  const fail = (e: unknown) => {
    const text = errorText(e);
    setError({ text, conflict: /changed|reload|archived|is (draft|published)/i.test(text) });
  };

  const doSave = async () => {
    setError(null);
    try {
      const r = await save.mutateAsync({
        id: p?.id,
        input: { ...form, title: form.title.trim(), category: form.category.trim(), body: form.body, link_url: form.link_url.trim() },
      });
      setConfirm(null);
      if (!p) {
        toast.show('Draft saved. Nobody sees it until you publish it.');
        router.replace(`/admin/hr-time/policies/${r.policy.id}`);
        return;
      }
      toast.show(r.newVersion ? `Saved as version ${r.policy.version}. Everyone is asked to read it again.` : 'Policy saved.');
    } catch (e) {
      setConfirm(null);
      fail(e);
    }
  };
  const doMove = async (what: 'publish' | 'archive') => {
    if (!p) return;
    setError(null);
    try {
      await (what === 'publish' ? publish : archive).mutateAsync(p.id);
      setConfirm(null);
      toast.show(what === 'publish' ? 'Published.' : 'Archived.');
    } catch (e) {
      setConfirm(null);
      fail(e);
    }
  };
  const onSave = () => {
    if (form.title.trim().length < 3) return setError({ text: 'Give the policy a title (3 to 120 characters).', conflict: false });
    if (form.body.trim().length < 10) return setError({ text: 'Write the policy text (at least 10 characters).', conflict: false });
    if (published && material) return setConfirm('material');
    void doSave();
  };

  const status = p ? STATUS[p.status] : null;
  const footer = archived ? undefined : (
    <ActionBar note={dirty ? (published && material ? 'This change makes a new version.' : 'Unsaved changes') : null}>
      <ActionRow context="bar">
        {/* Website PolicyManage: Archive for drafts and published ones, Publish for drafts only. */}
        {p && !dirty ? <Button title="Archive" variant="danger" icon={<Archive />} onPress={() => setConfirm('archive')} disabled={busy} /> : null}
        {p && !dirty && p.status === 'draft' ? <Button title="Publish" icon={<Send />} onPress={() => setConfirm('publish')} disabled={busy} /> : null}
        {!p || dirty ? <Button title={p ? 'Save' : 'Save draft'} icon={<Check />} loading={save.isPending} disabled={!dirty || busy} onPress={onSave} /> : null}
      </ActionRow>
    </ActionBar>
  );

  return (
    <Screen
      header={<NavHeader title={p ? 'Policy' : 'New policy'} />}
      footer={footer}
      onRefresh={p ? async () => onReload() : undefined}>
      {p && status ? (
        <View style={styles.statusRow}>
          <StatusPill label={status.label} tone={status.tone} />
          <Text variant="caption" muted style={styles.flex}>
            {`Version ${p.version}${p.published_at ? ` · published ${dateLabel(p.published_at, today)}` : ''}`}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Banner
          tone="danger"
          title="Couldn’t save"
          message={error.text}
          action={error.conflict ? { label: 'Reload', onPress: onReload } : undefined}
        />
      ) : null}
      {archived ? <Banner tone="info" message="Archived policies can’t be changed or brought back." /> : null}
      {published ? <Banner tone="warning" message="Changing the title, text or link makes a new version, and everyone is asked to read and confirm it again." /> : null}

      {published && p?.requires_ack ? (
        <ActivityList>
          <ActivityRow
            module="policies"
            icon={Eye}
            title="Who has read it"
            subtitle={acks.data ? `${acks.data.acknowledged} of ${acks.data.total} confirmed version ${acks.data.version}` : acks.isError ? 'Couldn’t load' : 'Loading…'}
            chevron
            onPress={() => router.push(`/admin/hr-time/policies/${p.id}/acks`)}
          />
        </ActivityList>
      ) : null}

      <Card tone="surface" style={styles.form}>
        <PillField icon={ScrollText} label="Title" value={form.title} onChangeText={(v) => set({ title: v })} maxLength={120} editable={!archived} placeholder="e.g. Work from home" />
        <PillField label="Category (optional)" value={form.category} onChangeText={(v) => set({ category: v })} maxLength={40} editable={!archived} placeholder="e.g. Attendance" />
        <TextField
          label="Policy text"
          value={form.body}
          onChangeText={(v) => set({ body: v })}
          maxLength={60000}
          multiline
          counter
          editable={!archived}
          placeholder="Plain text. A blank line starts a new paragraph; start a line with “- ” for a list."
          style={styles.body}
        />
        <PillField
          icon={Link2}
          label="Link to the full document (optional)"
          value={form.link_url}
          onChangeText={(v) => set({ link_url: v })}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!archived}
          placeholder="https://…"
          hint="Must start with https://"
        />
      </Card>

      <Card tone="surface" style={styles.toggle}>
        <ToggleRow
          label="Ask people to confirm they’ve read it"
          sub="They see it under “Waiting for you” until they confirm."
          value={form.requires_ack}
          onChange={(v) => set({ requires_ack: v })}
          disabled={archived}
        />
      </Card>

      <View style={styles.group}>
        <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
          Who it’s for
        </Text>
        <ChipRow wrap bleed="none">
          <Chip label="Everyone" icon={<Users />} selected={!form.audience.length} onPress={archived ? undefined : () => set({ audience: [] })} />
          {departments.map((d) => {
            const on = form.audience.includes(d.id);
            return (
              <Chip
                key={d.id}
                label={d.name}
                selected={on}
                onPress={archived ? undefined : () => set({ audience: on ? form.audience.filter((x) => x !== d.id) : [...form.audience, d.id] })}
              />
            );
          })}
        </ChipRow>
        <Text variant="caption" muted>
          {form.audience.length ? `Only ${audienceText} will see it.` : 'Everyone in the company will see it.'}
        </Text>
      </View>

      <ConfirmSheet
        visible={confirm === 'material'}
        onClose={() => setConfirm(null)}
        title="Save as a new version?"
        from={{ title: `Version ${p?.version ?? 1}`, subtitle: 'Read by people now' }}
        to={{ title: `Version ${(p?.version ?? 1) + 1}`, subtitle: 'Everyone asked again' }}
        confirmLabel="Swipe to save"
        onConfirm={() => void doSave()}
        loading={save.isPending}
        note="Nobody is messaged: people see it in DASH.">
        <SummaryCard rows={[{ label: 'Who reads it again', value: !form.requires_ack ? 'Nobody has to confirm' : form.audience.length ? `Everyone in ${audienceText}` : 'Everyone in the company' }, { label: 'Undo', value: 'Not possible' }]} />
      </ConfirmSheet>
      <ConfirmSheet
        visible={confirm === 'publish'}
        onClose={() => setConfirm(null)}
        title="Publish this policy?"
        from={{ title: 'Draft', subtitle: 'Only HR sees it', icon: ScrollText, module: 'policies' }}
        to={{ title: 'Published', subtitle: `For ${audienceText}` }}
        confirmLabel="Swipe to publish"
        onConfirm={() => void doMove('publish')}
        loading={publish.isPending}
        note="Nobody is messaged: it shows in their Policies straight away.">
        <SummaryCard
          rows={[
            { label: 'Title', value: form.title },
            { label: 'Asks to be read', value: form.requires_ack ? 'Yes' : 'No' },
            { label: 'Unpublish', value: 'Not possible — only archive' },
          ]}
        />
      </ConfirmSheet>
      <ConfirmSheet
        visible={confirm === 'archive'}
        onClose={() => setConfirm(null)}
        title="Archive this policy?"
        from={{ title: p?.title ?? '', subtitle: p ? STATUS[p.status].label : '', icon: ScrollText, module: 'policies' }}
        to={{ title: 'Archived', subtitle: 'Final' }}
        confirmLabel="Swipe to archive"
        onConfirm={() => void doMove('archive')}
        loading={archive.isPending}
        note="Nobody is messaged.">
        <SummaryCard
          rows={[
            { label: 'People', value: p?.status === 'draft' ? 'Never saw it' : 'No longer see it' },
            { label: 'Change or bring back', value: 'Not possible' },
          ]}
        />
      </ConfirmSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  form: { gap: space.md },
  body: { minHeight: 220 },
  toggle: { paddingVertical: space.xs, paddingHorizontal: space.xs },
  group: { gap: space.xs },
}));
