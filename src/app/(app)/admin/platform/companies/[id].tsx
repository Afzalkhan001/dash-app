// One company (MasterAdmin TenantDetail, dash.html:2509): its details, its Super Admin's sign-up state,
// and links to its features and wallet.
//   Edit      name, Super Admin email, address, tax ID, seat limit, Active / Suspended →
//             PUT /tenants/:id with only what changed (the server merges; nothing else is sent back).
//             Suspended and the seat limit are labels only today: the server enforces neither.
//   Invite    when the Super Admin's email has neither a login nor an invitation (the invite failed when
//             the company was registered, or the email was changed), "Send the invite" → swipe →
//             POST /whitelist (super_admin) — the server emails them.
// Not ported: "Reset Super Admin Password" (no API behind it). Delete lives in admin/advanced/delete-company.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Coins, MailPlus, Pencil, ToggleRight, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Tenant } from '@/api/me';
import {
  companyEmail,
  companyName,
  companyStatus,
  countByCompany,
  findEmail,
  useHrTenantAccess,
  useInviteSuperAdmin,
  usePlatformUsers,
  usePlatformWhitelist,
  useUpdateCompany,
} from '@/api/platform';
import { canMoveCompanyCoins, canSeeCompanies, canSeeCompanyFeatures, canSeeCompanyWallets, featuresOff } from '@/features/platform/access';
import { usePlatformGate } from '@/features/platform/gate';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import {
  Avatar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  ListCard,
  ListRow,
  ModuleBadge,
  NavHeader,
  Screen,
  SectionHeader,
  SelectField,
  Sheet,
  SkeletonList,
  StatusPill,
  StripedProgress,
  SummaryCard,
  Text,
  TextField,
  toast,
  useLayout,
} from '@/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Edit = { name: string; superAdmin: string; address: string; tax: string; maxUsers: string; status: 'active' | 'suspended' };

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const editOf = (t: Tenant): Edit => ({
  name: companyName(t),
  superAdmin: companyEmail(t),
  address: str(t.address),
  tax: str(t.tax),
  maxUsers: String(Number(t.maxUsers) || ''),
  status: companyStatus(t),
});

export default function CompanyScreen() {
  const router = useRouter();
  const { gap } = useLayout();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { user, ready, tenantsQ, tenants } = usePlatformGate();
  const allowed = canSeeCompanies(user);
  const usersQ = usePlatformUsers(allowed);
  const invitesQ = usePlatformWhitelist(allowed);
  const hrQ = useHrTenantAccess(allowed ? id : null);
  const update = useUpdateCompany();
  const invite = useInviteSuperAdmin();

  const [edit, setEdit] = useState<Edit | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  if (ready && !allowed) return <Redirect href="/" />;

  const t = tenants.find((x) => x.id === id) ?? null;
  if (!t) {
    return (
      <Screen header={<NavHeader title="Company" />}>
        {tenantsQ.data ? (
          <ErrorState title="Company not found" message="It may have been deleted on the website." onRetry={() => void tenantsQ.refetch()} />
        ) : tenantsQ.isError ? (
          <ErrorState message={tenantsQ.error?.message ?? 'The company could not be loaded.'} onRetry={() => void tenantsQ.refetch()} />
        ) : (
          <SkeletonList rows={5} />
        )}
      </Screen>
    );
  }

  const name = companyName(t);
  const email = companyEmail(t);
  const suspended = companyStatus(t) === 'suspended';
  const n = countByCompany(usersQ.data).get(t.id) ?? 0;
  const max = Number(t.maxUsers) || 0;
  const off = featuresOff(t);
  const where = findEmail(email, usersQ.data, invitesQ.data);
  const listsReady = !!usersQ.data && !!invitesQ.data;
  const listsFailed = !listsReady && (usersQ.isError || invitesQ.isError);
  // The Super Admin on record: signed up, invited, or neither (then the invite can be sent from here).
  const adminState = !email ? 'none' : listsFailed ? 'error' : !listsReady ? 'loading' : !where ? 'missing' : where.kind === 'user' ? 'signed' : 'invited';
  const adminName = where?.person.name || str(t.superAdminName) || email.split('@')[0] || 'Super Admin';
  const wrongCompany = !!where && !!where.person.tenantId && where.person.tenantId !== t.id;

  const open = () => {
    setEdit(editOf(t));
    setEditError(null);
  };
  const before = editOf(t);
  const dirty = !!edit && JSON.stringify(edit) !== JSON.stringify(before);

  const save = () => {
    if (!edit) return;
    const seats = Math.round(Number(edit.maxUsers));
    const mail = edit.superAdmin.trim().toLowerCase();
    if (!edit.name.trim()) return setEditError('The company needs a name.');
    if (mail && !EMAIL_RE.test(mail)) return setEditError('Enter a valid Super Admin email.');
    // Only checked when changed: an older company may have no limit on record, and other edits must still save.
    if (edit.maxUsers !== before.maxUsers && !(seats >= 1)) return setEditError('Enter how many people it may have (at least 1).');
    const patch: Partial<Tenant> = {};
    if (edit.name.trim() !== before.name) patch.name = edit.name.trim();
    if (mail !== before.superAdmin) patch.superAdmin = mail;
    if (edit.address.trim() !== before.address) patch.address = edit.address.trim();
    if (edit.tax.trim() !== before.tax) patch.tax = edit.tax.trim();
    if (edit.maxUsers !== before.maxUsers) patch.maxUsers = seats;
    if (edit.status !== before.status) patch.status = edit.status;
    if (!Object.keys(patch).length) return setEdit(null);
    setEditError(null);
    update.mutate(
      { tenantId: t.id, patch },
      {
        onSuccess: () => {
          setEdit(null);
          toast.show('Company details saved', 'success');
        },
        onError: (e) => setEditError(e.message),
      },
    );
  };

  const sendInvite = () =>
    invite.mutate(
      { tenantId: t.id, email, name: str(t.superAdminName) || adminName },
      {
        onSuccess: () => {
          setInviting(false);
          toast.show(`Invite sent to ${email}`, 'success');
        },
      },
    );

  return (
    <Screen
      header={<NavHeader title={name} actions={[{ icon: Pencil, label: 'Edit company details', onPress: open }]} />}
      onRefresh={() => Promise.all([tenantsQ.refetch(), usersQ.refetch(), invitesQ.refetch(), hrQ.refetch()])}>
      <Card padded style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={name} size={48} ring={false} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="heading" numberOfLines={2}>
              {name}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {email || 'No Super Admin email'}
            </Text>
          </View>
          <StatusPill label={suspended ? 'Suspended' : 'Active'} tone={suspended ? 'failed' : 'done'} />
        </View>
        {usersQ.data && max ? <StripedProgress label="People on DASH" used={n} total={max} /> : null}
        {usersQ.data && !max ? <Text variant="label">{plural(n, 'person', 'people')} on DASH</Text> : null}
      </Card>

      {suspended ? <Banner tone="warning" message="Suspended is a label only today: people at this company can still sign in." /> : null}

      <View style={{ gap: gap - 8 }}>
        <SectionHeader title="Super Admin" />
        {adminState === 'loading' ? (
          <SkeletonList rows={1} />
        ) : adminState === 'error' ? (
          <ErrorState
            message="Couldn’t check whether the Super Admin has signed up."
            onRetry={() => void Promise.all([usersQ.isError ? usersQ.refetch() : null, invitesQ.isError ? invitesQ.refetch() : null])}
          />
        ) : adminState === 'none' ? (
          <Banner tone="warning" message="This company has no Super Admin email. Add one with Edit." />
        ) : (
          <ListCard>
            <ListRow
              left={<Avatar name={adminName} size={40} ring={false} />}
              title={adminName}
              subtitle={email}
              right={
                <StatusPill
                  label={adminState === 'signed' ? 'Signed up' : adminState === 'invited' ? 'Invited' : 'Not invited'}
                  tone={adminState === 'signed' ? 'done' : adminState === 'invited' ? 'pending' : 'failed'}
                />
              }
            />
          </ListCard>
        )}
        {adminState === 'invited' ? (
          <Text variant="caption" muted>
            They have an invitation but haven’t signed up yet.
          </Text>
        ) : null}
        {wrongCompany ? <Banner tone="warning" message="This email belongs to someone at another company. Check the Super Admin email." /> : null}
        {adminState === 'missing' ? (
          <Banner
            tone="warning"
            title="No invite for this email"
            message="They can’t sign up until they are invited."
            action={{ label: 'Send the invite', onPress: () => { invite.reset(); setInviting(true); } }}
          />
        ) : null}
      </View>

      <View style={{ gap: gap - 8 }}>
        <SectionHeader title="Details" />
        <SummaryCard
          rows={[
            { key: 'address', label: 'Address', value: str(t.address) || '—' },
            { key: 'tax', label: 'Tax ID', value: str(t.tax) || '—' },
            { key: 'seats', label: 'Seat limit', value: max ? plural(max, 'person', 'people') : '—', hint: 'Not enforced by DASH today' },
            { key: 'bounty', label: 'Bounty coins', value: t.bountyEnabled !== false ? 'On' : 'Off' },
            { key: 'hr', label: 'HR', value: hrQ.data ? (hrQ.data.enabled ? plural(hrQ.data.modules.length, 'module') : 'Off') : hrQ.isError ? '—' : '…' },
            { key: 'features', label: 'Features off', value: off ? String(off) : 'None' },
          ]}
        />
      </View>

      {canSeeCompanyFeatures(user) || canSeeCompanyWallets(user) ? (
        <ListCard>
          {canSeeCompanyFeatures(user) ? (
            <ListRow
              left={<ModuleBadge module="security" icon={ToggleRight} />}
              title="Features for this company"
              subtitle={off ? `${off} switched off` : 'Everything is on'}
              chevron
              onPress={() => router.push(`/admin/platform/features?company=${encodeURIComponent(t.id)}`)}
            />
          ) : null}
          {canSeeCompanyWallets(user) ? (
            <ListRow
              left={<ModuleBadge module="bounty" icon={Coins} />}
              title="Wallet"
              subtitle={canMoveCompanyCoins(user) ? 'Coins, credits, add coins' : 'Coins and credits'}
              chevron
              onPress={() => router.push(`/admin/platform/wallets?company=${encodeURIComponent(t.id)}`)}
            />
          ) : null}
        </ListCard>
      ) : null}

      <Button
        variant="text"
        title="Delete this company"
        onPress={() => router.push(`/admin/advanced/delete-company?company=${encodeURIComponent(t.id)}`)}
        accessibilityHint="Opens the delete screen. It lists what goes and asks you to type the company’s name"
      />

      {/* Edit */}
      <Sheet
        visible={!!edit}
        onClose={() => setEdit(null)}
        title="Company details"
        dirty={dirty}
        footer={<Button title="Save" loading={update.isPending} disabled={!dirty} onPress={save} />}>
        {edit ? (
          <>
            <TextField label="Company name" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} autoCapitalize="words" />
            <TextField
              label="Super Admin email"
              value={edit.superAdmin}
              onChangeText={(v) => setEdit({ ...edit, superAdmin: v })}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              left={<UserRound size={18} color={palette.textMuted} />}
              hint="Changes the email on record only. It doesn’t invite or remove anyone."
            />
            <TextField label="Address" value={edit.address} onChangeText={(v) => setEdit({ ...edit, address: v })} multiline />
            <TextField label="Tax ID" value={edit.tax} onChangeText={(v) => setEdit({ ...edit, tax: v })} autoCapitalize="characters" />
            <TextField
              label="People it may have"
              value={edit.maxUsers}
              onChangeText={(v) => setEdit({ ...edit, maxUsers: v.replace(/\D/g, '') })}
              keyboardType="number-pad"
              maxLength={6}
            />
            <SelectField
              label="Status"
              value={edit.status}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
              ]}
              onChange={(v) => setEdit({ ...edit, status: v })}
              hint="A label only today: suspending doesn’t block sign-in."
            />
            {editError ? <Banner tone="danger" message={editError} /> : null}
          </>
        ) : null}
      </Sheet>

      {/* Send the Super Admin invite */}
      <ConfirmSheet
        visible={inviting}
        onClose={() => setInviting(false)}
        title="Send the invite?"
        from={{ title: name, subtitle: 'Company', icon: Building2, module: 'policies' }}
        to={{ title: adminName, subtitle: 'Super Admin', avatar: { name: adminName } }}
        confirmLabel="Swipe to send"
        onConfirm={sendInvite}
        loading={invite.isPending}
        note={`${email} gets the DASH welcome email. No one else is notified.`}>
        <SummaryCard rows={[{ key: 'email', label: 'Email', value: email, hint: 'They sign up to DASH with it' }]} />
        {invite.error ? <Banner tone="danger" message={`Couldn’t send: ${invite.error.message}`} /> : null}
        {!invite.error ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <MailPlus size={16} color={palette.textMuted} />
            <Text variant="caption" muted style={{ flex: 1 }}>
              Role: Super Admin of {name}
            </Text>
          </View>
        ) : null}
      </ConfirmSheet>
    </Screen>
  );
}
