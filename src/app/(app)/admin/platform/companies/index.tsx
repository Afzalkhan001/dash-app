// Companies (MasterAdmin's Tenant Management, dash.html:2384) for the platform owner:
//   - "Companies on DASH" hero, then one row per company: initials, name, Super Admin email, people on
//     DASH out of its seat limit (counted from GET /users — the stored `users` is always 0), Active /
//     Suspended, "Bounty on". Tap → the company's page.
//   - "Register company" (+): name, seats, Super Admin name and email, tax ID, address, bounty switch →
//     confirm (swipe: the Super Admin is emailed) → POST /tenants, then POST /whitelist (super_admin,
//     the new company's id). The email is checked against every login and invitation first, because
//     POST /whitelist upserts by email and would move an existing person into the new company.
// Delete company stays on the website (a ~20-table cascade the server doesn't guard).

import { Redirect, useRouter } from 'expo-router';
import { Building2, Mail, Plus, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  companyEmail,
  companyName,
  companyStatus,
  countByCompany,
  findEmail,
  type RegisterInput,
  type RegisterResult,
  usePlatformUsers,
  usePlatformWhitelist,
  useRegisterCompany,
} from '@/api/platform';
import { canRegisterCompany, canSeeCompanies } from '@/features/platform/access';
import { usePlatformGate } from '@/features/platform/gate';
import { ToggleRow } from '@/features/platform/ui';
import { ROLE_LABEL } from '@/lib/access';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import {
  Avatar,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  NavHeader,
  Screen,
  Sheet,
  SkeletonList,
  StatusPill,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  TextField,
} from '@/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BLANK = { name: '', maxUsers: '50', superAdminName: '', superAdmin: '', tax: '', address: '', bountyEnabled: false };
type Form = typeof BLANK;

export default function CompaniesScreen() {
  const router = useRouter();
  const { user, ready, tenantsQ, tenants } = usePlatformGate();
  const allowed = canSeeCompanies(user);
  const canAdd = canRegisterCompany(user);
  const usersQ = usePlatformUsers(allowed);
  const invitesQ = usePlatformWhitelist(allowed && canAdd);
  const register = useRegisterCompany();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(BLANK);
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<RegisterResult | null>(null);

  if (ready && !allowed) return <Redirect href="/" />;

  const counts = countByCompany(usersQ.data);
  const people = tenants.reduce((s, t) => s + (counts.get(t.id) ?? 0), 0);
  const sorted = [...tenants].sort((a, b) => companyName(a).localeCompare(companyName(b)));

  // ── The register form ──
  const seats = Math.round(Number(form.maxUsers));
  const email = form.superAdmin.trim().toLowerCase();
  const clash = findEmail(email, usersQ.data, invitesQ.data);
  const listsReady = !!usersQ.data && !!invitesQ.data;
  const listsFailed = !listsReady && (usersQ.isError || invitesQ.isError) && !usersQ.isFetching && !invitesQ.isFetching;
  const reloadLists = () => void Promise.all([usersQ.isError ? usersQ.refetch() : null, invitesQ.isError ? invitesQ.refetch() : null]);
  const errors = {
    name: !form.name.trim() ? 'Give the company a name.' : tenants.some((t) => companyName(t).toLowerCase() === form.name.trim().toLowerCase()) ? 'A company with this name is already on DASH.' : null,
    maxUsers: !(seats >= 1 && seats <= 100000) ? 'Enter how many people it may have (at least 1).' : null,
    superAdminName: !form.superAdminName.trim() ? 'Who runs DASH at this company?' : null,
    superAdmin: !EMAIL_RE.test(email)
      ? 'Enter a valid email.'
      : clash
        ? `This email already ${clash.kind === 'user' ? 'has a DASH login' : 'has an invitation'} (${ROLE_LABEL[clash.person.role] ?? clash.person.role}${clash.person.tenantId ? ` at ${companyName(tenants.find((t) => t.id === clash.person.tenantId)) }` : ''}). Use a different email.`
        : null,
  };
  const valid = !errors.name && !errors.maxUsers && !errors.superAdminName && !errors.superAdmin;
  const dirty = JSON.stringify(form) !== JSON.stringify(BLANK);
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openForm = () => {
    setForm(BLANK);
    setTried(false);
    register.reset();
    setEditing(true);
  };
  const check = () => {
    setTried(true);
    if (!valid || !listsReady) return;
    setEditing(false);
    setTimeout(() => setConfirming(true), 320);
  };
  const submit = () => {
    const input: RegisterInput = {
      name: form.name.trim(),
      maxUsers: seats,
      superAdminName: form.superAdminName.trim(),
      superAdmin: email,
      tax: form.tax.trim(),
      address: form.address.trim(),
      bountyEnabled: form.bountyEnabled,
    };
    register.mutate(input, {
      onSuccess: (r) => {
        setConfirming(false);
        setTimeout(() => setDone(r), 320);
      },
    });
  };

  return (
    <Screen
      header={<NavHeader title="Companies" actions={canAdd ? [{ icon: Plus, label: 'Register a company', onPress: openForm }] : undefined} />}
      onRefresh={() => Promise.all([tenantsQ.refetch(), usersQ.refetch(), ...(canAdd ? [invitesQ.refetch()] : [])])}>
      {tenantsQ.data ? (
        <SummaryHero
          icon={Building2}
          module="policies"
          label="Companies on DASH"
          value={tenants.length}
          info={usersQ.data ? { label: 'People on DASH', value: people.toLocaleString('en-IN') } : undefined}
          action={canAdd ? { title: 'Register a company', onPress: openForm, icon: <Plus /> } : undefined}
        />
      ) : null}

      {tenantsQ.data ? (
        sorted.length ? (
          <ListCard>
            {sorted.map((t) => {
              const name = companyName(t);
              const n = counts.get(t.id) ?? 0;
              const max = Number(t.maxUsers) || 0;
              const suspended = companyStatus(t) === 'suspended';
              const seatLine = usersQ.data ? (max ? `${n} of ${max} people` : plural(n, 'person', 'people')) : max ? `Up to ${max} people` : null;
              return (
                <ListRow
                  key={t.id}
                  size="lg"
                  left={<Avatar name={name} size={40} ring={false} />}
                  title={name}
                  subtitle={companyEmail(t) || 'No Super Admin email'}
                  meta={[seatLine, t.bountyEnabled !== false ? 'Bounty on' : 'Bounty off'].filter(Boolean).join(' · ')}
                  right={<StatusPill label={suspended ? 'Suspended' : 'Active'} tone={suspended ? 'failed' : 'done'} />}
                  chevron
                  onPress={() => router.push(`/admin/platform/companies/${encodeURIComponent(t.id)}`)}
                  accessibilityLabel={`${name}, ${suspended ? 'suspended' : 'active'}${seatLine ? `, ${seatLine}` : ''}`}
                />
              );
            })}
          </ListCard>
        ) : (
          <EmptyState
            icon={<Building2 />}
            title="No companies yet"
            message="Register the first company and invite its Super Admin."
            action={canAdd ? <Button title="Register a company" variant="accent" size="md" onPress={openForm} /> : undefined}
          />
        )
      ) : tenantsQ.isError ? (
        <ErrorState message={tenantsQ.error?.message ?? 'The companies could not be loaded.'} onRetry={() => void tenantsQ.refetch()} />
      ) : (
        <SkeletonList rows={4} />
      )}

      <Banner tone="info" title="On the DASH website" message="Deleting a company, and the wallet reports, stay on the website." />

      {/* Register a company */}
      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Register a company"
        subtitle="Its Super Admin gets an invite to sign up."
        dirty={dirty}
        footer={
          listsFailed ? (
            <Button title="Load the people list again" onPress={reloadLists} />
          ) : (
            <Button title="Check details" disabled={!listsReady} loading={!listsReady && (usersQ.isFetching || invitesQ.isFetching)} onPress={check} />
          )
        }>
        <TextField label="Company name" value={form.name} onChangeText={set('name')} placeholder="Nexus Productions" error={tried ? errors.name : null} autoCapitalize="words" />
        <TextField
          label="People it may have"
          value={form.maxUsers}
          onChangeText={(v) => set('maxUsers')(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={6}
          error={tried ? errors.maxUsers : null}
          hint="A label for now: DASH doesn’t stop sign-ups past it."
        />
        <TextField
          label="Super Admin’s name"
          value={form.superAdminName}
          onChangeText={set('superAdminName')}
          placeholder="Who runs DASH there"
          left={<UserRound size={18} color={palette.textMuted} />}
          error={tried ? errors.superAdminName : null}
          autoCapitalize="words"
        />
        <TextField
          label="Super Admin’s email"
          value={form.superAdmin}
          onChangeText={set('superAdmin')}
          placeholder="admin@company.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          left={<Mail size={18} color={palette.textMuted} />}
          error={tried || (clash && EMAIL_RE.test(email)) ? errors.superAdmin : null}
          hint="They sign up to DASH with this email."
        />
        <TextField label="Tax ID (optional)" value={form.tax} onChangeText={set('tax')} autoCapitalize="characters" />
        <TextField label="Address (optional)" value={form.address} onChangeText={set('address')} multiline />
        <ListCard>
          <ToggleRow
            title="Bounty coins"
            subtitle="Bounty tasks and coin wallets for everyone there. You can change this later."
            value={form.bountyEnabled}
            onChange={(v) => setForm((f) => ({ ...f, bountyEnabled: v }))}
          />
        </ListCard>
        {listsFailed ? <Banner tone="danger" message="The list of people on DASH couldn’t be loaded, so the email can’t be checked yet. Load it again below." /> : null}
      </Sheet>

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Register this company?"
        from={{ title: form.name.trim() || 'New company', subtitle: plural(seats || 0, 'seat'), icon: Building2, module: 'policies' }}
        to={{ title: form.superAdminName.trim() || 'Super Admin', subtitle: 'Super Admin', avatar: { name: form.superAdminName.trim() || email } }}
        detailsTitle="Details"
        confirmLabel="Swipe to register"
        onConfirm={submit}
        loading={register.isPending}
        note={`${email} gets the DASH welcome email and can then sign up. No one else is notified.`}>
        <SummaryCard
          rows={[
            { key: 'email', label: 'Super Admin email', value: email },
            { key: 'tax', label: 'Tax ID', value: form.tax.trim() || '—' },
            { key: 'address', label: 'Address', value: form.address.trim() || '—' },
            { key: 'bounty', label: 'Bounty coins', value: form.bountyEnabled ? 'On' : 'Off' },
          ]}
        />
        {register.error ? <Banner tone="danger" message={`Couldn’t register: ${register.error.message}`} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={!!done}
        onClose={() => setDone(null)}
        title={done?.inviteError ? 'Company registered, invite not sent' : 'Company registered'}
        subtitle={done?.inviteError ? 'Open the company to send the invite again.' : `Invite sent to ${email}. They can now sign up to DASH.`}
        secondaryLabel="Open company"
        onSecondary={() => {
          const id = done?.tenant.id;
          setDone(null);
          if (id) router.push(`/admin/platform/companies/${encodeURIComponent(id)}`);
        }}
        onPrimary={() => setDone(null)}>
        <View style={{ gap: 12 }}>
          <SummaryCard
            rows={[
              { key: 'name', label: 'Company', value: done ? companyName(done.tenant) : '' },
              { key: 'admin', label: 'Super Admin', value: email },
              { key: 'invite', label: 'Invite', value: done?.inviteError ? 'Not sent' : 'Sent', status: done?.inviteError ? 'failed' : 'done' },
            ]}
          />
          {done?.inviteError ? <Banner tone="danger" message={done.inviteError} /> : null}
        </View>
      </SuccessSheet>
    </Screen>
  );
}
