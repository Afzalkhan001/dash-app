// Users — the company's system logins (UserMgmt, dash.html:2631): signed-up people with a console role
// (GET /users) and invitations nobody has used yet (GET /whitelist, "Not signed up"). Employees and
// professionals live in the employee roster, not here.
//   Tap a row  → its details; Edit (dash.html:2795: name, phone, role incl. Accounts, a display's branch —
//                PUT /users/:id and/or PUT /whitelist/:id; the role only for a role-assigner; a new email
//                goes through POST /employees/change-email first, as both PUTs drop it) and Remove access
//                (DELETE /users/:id, then DELETE /whitelist/:id — irreversible, swipe to confirm).
//   +          → Add a login: name, work email, optional phone (sent as mobile + phone, so they can also
//                sign in with it), role (+ branch for a display). Both lists are re-read first, because
//                POST /whitelist silently overwrites an existing invitation and would change that person's
//                role. Sending it emails a welcome, so it is swiped to confirm.
// The company owner (Super Admin) and your own row can't be changed here, as on the website. The
// website's "tag every system login source:'system'" writes on opening this page are not ported.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { Mail, Phone, Plus, Search, ShieldCheck, Trash2, UserCog, UserPlus, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  type CompanyPerson,
  fetchFreshPeople,
  PartialError,
  useCompanyUsers,
  useEditUser,
  useProvisionUser,
  useRemoveAccess,
  useWhitelist,
} from '@/api/company';
import {
  canAssignRoles,
  canEditUsers,
  canRemoveUsers,
  canSeeUsers,
  EDIT_ROLES,
  isLockedRow,
  PROVISION_ROLES,
  SYSTEM_ROLES,
} from '@/features/company/access';
import { ALL_BRANCHES, branchLabel, roleLabel } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { canChangeEmailOf } from '@/features/people/access';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import {
  ActionRow,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Chip,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  NavHeader,
  PillField,
  Screen,
  SectionHeader,
  SelectField,
  Sheet,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  toast,
  useLayout,
} from '@/ui';

type Row = CompanyPerson & { signed: boolean; whitelistId: string | null };
type Filter = 'all' | 'active' | 'invited';
type Mode = { kind: 'detail' | 'edit' | 'remove'; row: Row } | null;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Signed up' },
  { key: 'invited', label: 'Not signed up' },
];

const roleOptions = (list: string[]) => list.map((r) => ({ value: r, label: roleLabel(r) }));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CompanyUsersScreen() {
  const qc = useQueryClient();
  const { gap } = useLayout();
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canSeeUsers(user, tenant);
  const users = useCompanyUsers(allowed);
  const wl = useWhitelist(allowed);
  const editUser = useEditUser();
  const remove = useRemoveAccess();
  const provision = useProvisionUser();

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [mode, setMode] = useState<Mode>(null);
  const [edit, setEdit] = useState({ name: '', email: '', phone: '' });
  const [role, setRole] = useState('');
  const [branch, setBranch] = useState(ALL_BRANCHES);
  const [editTried, setEditTried] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Add a login
  const [adding, setAdding] = useState<'form' | 'confirm' | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'admin', branch: ALL_BRANCHES });
  const [formError, setFormError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState<{ name: string; email: string; role: string } | null>(null);

  if (ready && !allowed) return <Redirect href="/" />;

  const tid = user?.tenantId ?? null;
  const signedEmails = new Set((users.data ?? []).map((u) => u.email).filter(Boolean));
  const wlByEmail = (email: string) => (wl.data ?? []).find((w) => !!email && w.email === email) ?? null;
  const signed: Row[] = (users.data ?? [])
    .filter((u) => u.tenantId === tid && SYSTEM_ROLES.includes(u.role))
    .map((u) => ({ ...u, signed: true, whitelistId: wlByEmail(u.email)?.id ?? null }));
  const invited: Row[] = (wl.data ?? [])
    .filter((w) => w.tenantId === tid && SYSTEM_ROLES.includes(w.role) && !signedEmails.has(w.email))
    .map((w) => ({ ...w, signed: false, whitelistId: w.id }));
  const all = [...signed, ...invited];
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((r) => (filter === 'active' ? r.signed : filter === 'invited' ? !r.signed : true))
    .filter((r) => !needle || [r.name, r.email, roleLabel(r.role)].some((v) => v.toLowerCase().includes(needle)));
  const branches = [ALL_BRANCHES, ...[...new Set([...(users.data ?? []), ...(wl.data ?? [])].map((u) => u.location).filter((v) => !!v && v !== ALL_BRANCHES))].sort()];
  const branchOptions = branches.map((b) => ({ value: b, label: branchLabel(b) }));

  const loading = users.isPending || wl.isPending;
  const failed = (users.isError && !users.data) || (wl.isError && !wl.data);

  const openRow = (r: Row) => setMode({ kind: 'detail', row: r });
  const inviteOf = (r: Row) => (r.whitelistId ? (wl.data ?? []).find((w) => w.id === r.whitelistId) : undefined);
  const startEdit = (r: Row) => {
    // Start on what they have now (dash.html:2746), so an Accounts login isn't switched by one tap.
    const inv = inviteOf(r);
    setEdit({ name: r.name || inv?.name || '', email: r.email || inv?.email || '', phone: r.phone || inv?.phone || '' });
    setRole(r.role);
    setBranch(r.location || inv?.location || ALL_BRANCHES);
    setEditTried(false);
    setRoleError(null);
    setMode({ kind: 'edit', row: r });
  };

  const editProblem = !edit.name.trim() ? 'Enter their full name.' : !EMAIL_RE.test(edit.email.trim().toLowerCase()) ? 'Enter a work email like name@company.com.' : null;

  const saveEdit = (r: Row) => {
    setEditTried(true);
    setRoleError(null);
    if (editProblem) return;
    const email = edit.email.trim().toLowerCase();
    editUser.mutate(
      {
        userId: r.signed ? r.id : null,
        whitelistId: r.whitelistId,
        name: edit.name,
        phone: edit.phone,
        // A non-assigner's role would be dropped by the server; send what they have.
        role: canAssignRoles(user) ? role : r.role,
        location: role === 'announcement_viewer' ? branch : null,
        newEmail: email !== r.email ? email : null,
      },
      {
        onSuccess: () => {
          setMode(null);
          toast.show(`Updated ${edit.name.trim()}`, 'success');
        },
        onError: (e) => {
          const done = e instanceof PartialError && e.done.length ? ` Their ${e.done.join(' and ')} already changed.` : '';
          setRoleError(`${e.message}${done}`);
        },
      },
    );
  };

  const doRemove = (r: Row) => {
    setRemoveError(null);
    remove.mutate(
      { userId: r.signed ? r.id : null, whitelistIds: r.whitelistId ? [r.whitelistId] : [] },
      {
        onSuccess: () => {
          setMode(null);
          toast.show(`${r.name} no longer has a DASH login`, 'success');
        },
        onError: (e) => {
          const done = e instanceof PartialError && e.done.length ? ` Their ${e.done.join(' and ')} was already deleted.` : '';
          setRemoveError(`${e.message}${done}`);
        },
      },
    );
  };

  const startAdd = () => {
    setForm({ name: '', email: '', phone: '', role: 'admin', branch: ALL_BRANCHES });
    setFormError(null);
    setAdding('form');
  };

  const checkAndConfirm = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) return setFormError('Enter their full name.');
    if (!EMAIL_RE.test(email)) return setFormError('Enter a work email like name@company.com.');
    setFormError(null);
    setChecking(true);
    try {
      const fresh = await fetchFreshPeople(qc, user?.id ?? '');
      const hasLogin = fresh.users.find((u) => u.email === email);
      if (hasLogin) return setFormError(`${email} already has a DASH login (${roleLabel(hasLogin.role)}).`);
      const invite = fresh.whitelist.find((w) => w.email === email);
      if (invite) return setFormError(`${email} is already invited as ${roleLabel(invite.role)}. Change their role from the list instead.`);
      setAdding('confirm');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'The lists could not be checked. Try again.');
    } finally {
      setChecking(false);
    }
  };

  const send = () => {
    if (!tid) return;
    const v = { name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role };
    provision.mutate(
      { ...v, phone: form.phone, tenantId: tid, location: form.role === 'announcement_viewer' ? form.branch || ALL_BRANCHES : null },
      {
        onSuccess: () => {
          setAdding(null);
          setSent(v);
        },
        onError: (e) => {
          setAdding('form');
          setFormError(e.message);
        },
      },
    );
  };

  const sel = mode?.row ?? null;
  const locked = sel ? isLockedRow(sel.role, sel.id, user) : false;
  const canEdit = !!sel && !locked && canEditUsers(user);
  const canRole = canEdit && canAssignRoles(user);
  const canEmail = canEdit && !!sel && canChangeEmailOf(user, sel.role);
  const canDel = !!sel && !locked && canRemoveUsers(user);

  return (
    <Screen
      header={<NavHeader title="Users" subtitle="System logins" actions={canAssignRoles(user) ? [{ icon: Plus, label: 'Add a login', onPress: startAdd }] : []} />}
      onRefresh={() => Promise.all([users.refetch(), wl.refetch()])}>
      <PillField icon={Search} placeholder="Search name, email or role" value={q} onChangeText={setQ} autoCorrect={false} autoCapitalize="none" />
      <ChipRow>
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            selected={filter === f.key}
            count={f.key === 'all' ? all.length : f.key === 'active' ? signed.length : invited.length}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ChipRow>

      <View style={{ gap: gap - 8 }}>
        {loading ? (
          <SkeletonList rows={6} avatar />
        ) : failed ? (
          <ErrorState message={(users.error ?? wl.error)?.message ?? 'The logins could not be loaded.'} onRetry={() => void Promise.all([users.refetch(), wl.refetch()])} />
        ) : rows.length ? (
          <>
            <SectionHeader title={plural(rows.length, 'login')} />
            <ActivityList>
              {rows.map((r) => (
                <ActivityRow
                  key={`${r.signed ? 'u' : 'w'}-${r.id}`}
                  person={{ name: r.name || r.email }}
                  title={r.name || r.email}
                  subtitle={roleLabel(r.role)}
                  note={r.name ? r.email : undefined}
                  subtitleLines={1}
                  status={r.signed ? { label: 'Signed up', tone: 'done' } : { label: 'Not signed up', tone: 'pending' }}
                  onPress={() => openRow(r)}
                  accessibilityHint="Opens their details"
                />
              ))}
            </ActivityList>
          </>
        ) : all.length ? (
          <EmptyState title="No one matches" message="Try another name, email or role." action={<Button title="Show all" variant="accent" size="md" onPress={() => { setQ(''); setFilter('all'); }} />} />
        ) : (
          <EmptyState icon={<UserCog color={palette.textMuted} />} title="No system logins yet" message="Tap + to add one." />
        )}
        <Text variant="caption" muted>
          Employees and professionals are added in the employee roster.
        </Text>
      </View>

      {/* Details */}
      <Sheet visible={mode?.kind === 'detail'} onClose={() => setMode(null)} title={sel?.name || sel?.email} subtitle={sel ? roleLabel(sel.role) : undefined}>
        {sel ? (
          <>
            <SummaryCard
              rows={[
                { key: 'email', label: 'Email', value: sel.email },
                { key: 'phone', label: 'Phone', value: sel.phone || inviteOf(sel)?.phone || '—' },
                { key: 'role', label: 'Role', value: roleLabel(sel.role) },
                { key: 'status', label: 'Status', value: sel.signed ? 'Signed up' : 'Not signed up', status: sel.signed ? 'done' : 'pending' },
                ...(sel.role === 'announcement_viewer' ? [{ key: 'branch', label: 'Branch', value: branchLabel(sel.location) }] : []),
                ...(sel.employeeNumber ? [{ key: 'emp', label: 'Employee number', value: sel.employeeNumber }] : []),
              ]}
            />
            {locked ? (
              <Banner tone="info" icon={ShieldCheck} message={sel.role === 'super_admin' ? 'The company owner can’t be changed or removed here.' : 'You can’t change your own role.'} />
            ) : canEdit || canDel ? (
              <ActionRow context="sheet">
                {canDel ? <Button variant="danger" title="Remove" icon={<Trash2 />} onPress={() => { setRemoveError(null); setMode({ kind: 'remove', row: sel }); }} /> : null}
                {canEdit ? <Button variant="primary" title="Edit" icon={<UserCog />} onPress={() => startEdit(sel)} /> : null}
              </ActionRow>
            ) : null}
          </>
        ) : null}
      </Sheet>

      {/* Edit user (reversible: a plain save) */}
      <Sheet
        visible={mode?.kind === 'edit'}
        onClose={() => setMode(null)}
        title="Edit user"
        subtitle={sel?.name || sel?.email}
        dirty={!!sel && (role !== sel.role || edit.name !== sel.name || edit.email.trim().toLowerCase() !== sel.email || edit.phone !== (sel.phone || inviteOf(sel)?.phone || ''))}
        footer={sel ? <Button title="Save" loading={editUser.isPending} onPress={() => saveEdit(sel)} /> : null}>
        <TextField
          label="Full name"
          value={edit.name}
          onChangeText={(v) => setEdit((x) => ({ ...x, name: v }))}
          placeholder="Jane Smith"
          autoCapitalize="words"
          maxLength={120}
          error={editTried && !edit.name.trim() ? 'Enter their full name.' : null}
        />
        <TextField
          label="Work email"
          value={edit.email}
          onChangeText={(v) => setEdit((x) => ({ ...x, email: v }))}
          editable={canEmail}
          placeholder="jane@company.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          left={<Mail size={18} color={palette.textMuted} />}
          hint={canEmail ? 'A new email becomes their sign-in. The old address is told.' : 'Only a Super Admin can change this login’s email.'}
          error={editTried && edit.name.trim() && editProblem ? editProblem : null}
        />
        <TextField
          label="Phone (optional)"
          value={edit.phone}
          onChangeText={(v) => setEdit((x) => ({ ...x, phone: v }))}
          placeholder="e.g. +91 98765 43210"
          keyboardType="phone-pad"
          maxLength={20}
          left={<Phone size={18} color={palette.textMuted} />}
          hint="If set, they can also sign in with this number."
        />
        {canRole ? (
          <SelectField label="Role" value={role} options={roleOptions(sel && !EDIT_ROLES.includes(sel.role) ? [sel.role, ...EDIT_ROLES] : EDIT_ROLES)} onChange={setRole} />
        ) : null}
        {canRole && role === 'announcement_viewer' ? <SelectField label="Branch" value={branch} options={branchOptions} onChange={setBranch} hint="Which branch’s news this display shows." /> : null}
        <Text variant="caption" muted>
          {canRole ? 'A new role applies the next time they open DASH. ' : ''}No one is notified{canEmail ? ' unless the email changes' : ''}.
        </Text>
        {roleError ? <Banner tone="danger" title="Couldn’t save the changes" message={roleError} /> : null}
      </Sheet>

      {/* Remove access (irreversible) */}
      <ConfirmSheet
        visible={mode?.kind === 'remove'}
        onClose={() => setMode(null)}
        title="Remove access?"
        from={sel ? { title: sel.name || sel.email, subtitle: roleLabel(sel.role), avatar: { name: sel.name || sel.email } } : undefined}
        to={{ title: 'No DASH login', subtitle: sel?.signed ? 'Account deleted' : 'Invitation deleted', icon: UserX, module: 'security' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to remove"
        onConfirm={() => sel && doRemove(sel)}
        loading={remove.isPending}
        note="This can’t be undone. No one is notified.">
        {sel ? (
          <SummaryCard
            rows={[
              { key: 'email', label: 'Email', value: sel.email },
              { key: 'acc', label: 'Account', value: sel.signed ? 'Deleted' : 'None yet' },
              { key: 'inv', label: 'Invitation', value: sel.whitelistId ? 'Deleted' : 'None' },
            ]}
          />
        ) : null}
        {removeError ? <Banner tone="danger" title="Couldn’t remove access" message={removeError} /> : null}
      </ConfirmSheet>

      {/* Add a login */}
      <Sheet
        visible={adding === 'form'}
        onClose={() => setAdding(null)}
        title="Add a login"
        subtitle="For admin, HR, IT and other console roles"
        dirty={!!(form.name || form.email || form.phone)}
        footer={<Button title="Continue" icon={<UserPlus />} loading={checking} onPress={() => void checkAndConfirm()} />}>
        <TextField label="Full name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Jane Smith" autoCapitalize="words" />
        <TextField
          label="Work email"
          value={form.email}
          onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
          placeholder="jane@company.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          left={<Mail size={18} color={palette.textMuted} />}
        />
        <TextField
          label="Phone (optional)"
          value={form.phone}
          onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
          placeholder="e.g. +91 98765 43210"
          keyboardType="phone-pad"
          maxLength={20}
          left={<Phone size={18} color={palette.textMuted} />}
          hint="If added, they can also sign in with this number."
        />
        <SelectField label="Role" value={form.role} options={roleOptions(PROVISION_ROLES)} onChange={(v) => setForm((f) => ({ ...f, role: v }))} />
        {form.role === 'announcement_viewer' ? (
          <SelectField label="Branch" value={form.branch} options={branchOptions} onChange={(v) => setForm((f) => ({ ...f, branch: v }))} hint="Which branch’s news this display shows." />
        ) : null}
        {formError ? <Banner tone="danger" message={formError} /> : null}
      </Sheet>

      <ConfirmSheet
        visible={adding === 'confirm'}
        onClose={() => setAdding('form')}
        title="Send the invite?"
        from={{ title: user?.name ?? 'You', subtitle: 'You', avatar: { name: user?.name ?? 'You' } }}
        to={{ title: form.name.trim() || 'New login', subtitle: roleLabel(form.role), avatar: { name: form.name.trim() || form.email } }}
        detailsTitle="Invite details"
        confirmLabel="Swipe to send the invite"
        onConfirm={send}
        loading={provision.isPending}
        note="They sign up in the DASH app or on the website with this email.">
        <SummaryCard
          rows={[
            { key: 'email', label: 'Email', value: form.email.trim().toLowerCase() },
            ...(form.phone.trim() ? [{ key: 'phone', label: 'Phone', value: form.phone.trim() }] : []),
            { key: 'role', label: 'Role', value: roleLabel(form.role) },
            ...(form.role === 'announcement_viewer' ? [{ key: 'branch', label: 'Branch', value: branchLabel(form.branch) }] : []),
            { key: 'told', label: 'Who is told', value: 'They get a welcome email, and a WhatsApp if a mobile number is on file' },
          ]}
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={!!sent}
        onClose={() => setSent(null)}
        title="Invite sent"
        subtitle={sent ? `${sent.name} can now sign up in the DASH app or on the website with ${sent.email}.` : undefined}>
        {sent ? <SummaryCard rows={[{ key: 'role', label: 'Role', value: roleLabel(sent.role) }, { key: 'status', label: 'Status', value: 'Not signed up', status: 'pending' }]} /> : null}
      </SuccessSheet>
    </Screen>
  );
}
