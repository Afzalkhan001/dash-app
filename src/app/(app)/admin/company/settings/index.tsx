// Company settings (ConfigToggles, dash.html:3489) for Super Admin, CEO and COO. Every save is
// PUT /tenants/:id with just the changed keys (the server merges them):
//   Company        name, contact email (stored as `superAdmin`), phone, address — the letterhead
//   Switches       Bounty coins, People directory and org chart, App Manager approvals, Team Roster.
//                  Turning a module OFF hides it for everyone, so that is swiped to confirm.
//   Visitors       how long to wait for the host (1–240 min), how long to keep photos (1–365 days)
//   Who can…       the five grant lists → settings/access/[list]
//   Earning cap    Super Admin only (routes/tenants.js keeps it only from super / master)
//   HR / Team Roster by department (Super Admin) → settings/hr, settings/team-roster
//   Seats          read-only: people on DASH out of the limit the platform owner set
// Logos, professional categories and TV / display pairing stay on the website.

import { Redirect, useRouter } from 'expo-router';
import { Building2, Coins, Network, Pencil, ToggleLeft, ToggleRight, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCompanyUsers, useUpdateTenant } from '@/api/company';
import type { Tenant } from '@/api/me';
import { canConfigureHr, canSeeCompanySettings, canSeeTeamRosterAccess, canSetEarnCap } from '@/features/company/access';
import { GRANT_LISTS } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { ToggleRow } from '@/features/company/toggle-row';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import {
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  KeyValueList,
  ListCard,
  ListRow,
  ModuleBadge,
  NavHeader,
  Screen,
  SectionHeader,
  Sheet,
  SkeletonList,
  StripedProgress,
  SummaryCard,
  Text,
  TextField,
  toast,
  useLayout,
} from '@/ui';

type SwitchKey = 'bountyEnabled' | 'orgEnabled' | 'appManagerBountyApprovalsOn' | 'teamRosterEnabled';

const SWITCHES: { key: SwitchKey; title: string; sub: string; offWarning?: string; defaultOn: boolean }[] = [
  {
    key: 'bountyEnabled',
    title: 'Bounty coins',
    sub: 'Bounty tasks, coin wallets and rewards for everyone.',
    offWarning: 'Bounty disappears for everyone at the company: tasks, wallets and rewards.',
    defaultOn: true,
  },
  {
    key: 'orgEnabled',
    title: 'People directory and org chart',
    sub: 'In everyone’s menu. Turning it off hides both; it doesn’t change who sees what inside them.',
    offWarning: 'The people directory and org chart disappear from everyone’s menu.',
    defaultOn: true,
  },
  {
    key: 'appManagerBountyApprovalsOn',
    title: 'App Manager can approve bounty work',
    sub: 'Lets the Application Manager approve finished bounty tasks and coin requests. Nothing else changes.',
    defaultOn: false,
  },
  {
    key: 'teamRosterEnabled',
    title: 'Team Roster',
    sub: 'Teams, projects and timed tasks inside a department. Each department also needs its own switch.',
    offWarning: 'Team Roster closes for every department. Teams, projects and tasks are kept.',
    defaultOn: false,
  },
];

const isOn = (t: Tenant | null, s: (typeof SWITCHES)[number]) => (s.defaultOn ? t?.[s.key] !== false : t?.[s.key] === true);

export default function CompanySettingsScreen() {
  const router = useRouter();
  const { gap } = useLayout();
  const { access, user, tenant, ready } = useCompanyAccess();
  const allowed = canSeeCompanySettings(user, tenant);
  const update = useUpdateTenant();
  const users = useCompanyUsers(allowed);

  const [editCo, setEditCo] = useState(false);
  const [co, setCo] = useState({ name: '', email: '', phone: '', address: '' });
  const [coError, setCoError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<(typeof SWITCHES)[number] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [wait, setWait] = useState<string | null>(null);
  const [keep, setKeep] = useState<string | null>(null);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [cap, setCap] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);

  if (ready && !allowed) return <Redirect href="/" />;

  const t = tenant;
  const tid = t?.id ?? '';
  const save = (patch: Partial<Tenant>, opts: { key?: string; done?: string; onDone?: () => void; onFail?: (m: string) => void } = {}) => {
    if (!tid) return;
    setBusyKey(opts.key ?? 'any');
    update.mutate(
      { tenantId: tid, patch },
      {
        onSuccess: () => {
          if (opts.done) toast.show(opts.done, 'success');
          opts.onDone?.();
        },
        onError: (e) => (opts.onFail ? opts.onFail(e.message) : toast.show(`Couldn’t save: ${e.message}`, 'danger')),
        onSettled: () => setBusyKey(null),
      },
    );
  };

  const flip = (s: (typeof SWITCHES)[number], next: boolean) => {
    if (!next && s.offWarning) return setConfirmOff(s);
    save({ [s.key]: next } as Partial<Tenant>, { key: s.key, done: `${s.title} ${next ? 'on' : 'off'}` });
  };

  const openCo = () => {
    setCo({ name: t?.name ?? '', email: typeof t?.superAdmin === 'string' ? t.superAdmin : '', phone: t?.phone ?? '', address: t?.address ?? '' });
    setCoError(null);
    setEditCo(true);
  };

  const waitV = wait ?? String(t?.visitorApprovalTimeoutMin || 10);
  const keepV = keep ?? String(t?.visitorPhotoRetentionDays || 30);
  const saveVisitors = () => {
    const a = Math.round(Number(waitV));
    const b = Math.round(Number(keepV));
    if (!(a >= 1 && a <= 240)) return setVisitError('The wait must be between 1 and 240 minutes.');
    if (!(b >= 1 && b <= 365)) return setVisitError('Keep photos for between 1 and 365 days.');
    setVisitError(null);
    save({ visitorApprovalTimeoutMin: a, visitorPhotoRetentionDays: b }, { key: 'visitors', done: 'Visitor settings saved', onDone: () => { setWait(null); setKeep(null); }, onFail: setVisitError });
  };

  const capV = cap ?? (t?.bountyMonthlyEarnCap ? String(t.bountyMonthlyEarnCap) : '');
  const saveCap = () => {
    const n = capV.trim() === '' ? 0 : Math.round(Number(capV));
    if (capV.trim() !== '' && (!Number.isFinite(n) || n < 0)) return setCapError('Enter a whole number, or leave it empty for no limit.');
    setCapError(null);
    save({ bountyMonthlyEarnCap: n }, { key: 'cap', done: n ? `Limit set to ${n.toLocaleString('en-IN')} coins a month` : 'No monthly limit', onDone: () => setCap(null), onFail: setCapError });
  };

  const seatsUsed = (users.data ?? []).filter((u) => u.tenantId === tid).length;
  const seatsMax = Number(t?.maxUsers) || 100;
  const hrRow = canConfigureHr(user, access.hr);
  const rosterRow = canSeeTeamRosterAccess(user) && t?.teamRosterEnabled === true;

  if (!t) {
    return (
      <Screen header={<NavHeader title="Company settings" />}>
        {ready ? <ErrorState message="Your company’s settings could not be loaded." onRetry={() => void access.refetch()} /> : <SkeletonList rows={6} />}
      </Screen>
    );
  }

  return (
    <Screen header={<NavHeader title="Company settings" subtitle={t.name} />} onRefresh={() => access.refetch()}>
      <View style={{ gap: gap - 8 }}>
        <SectionHeader title="Company" right={<Button variant="text" size="sm" title="Edit" icon={<Pencil />} onPress={openCo} />} />
        <Card padded>
          <KeyValueList
            rows={[
              { key: 'name', label: 'Name', value: t.name },
              { key: 'email', label: 'Contact email', value: typeof t.superAdmin === 'string' ? t.superAdmin : '' },
              { key: 'phone', label: 'Phone', value: t.phone },
              { key: 'address', label: 'Address', value: t.address },
            ]}
          />
        </Card>
        <Text variant="caption" muted>
          These print as the letterhead on every report people download.
        </Text>
      </View>

      <View style={{ gap: gap - 8 }}>
        <SectionHeader title="Switches" overline="For everyone at the company" />
        <ListCard>
          {SWITCHES.map((s) => (
            <ToggleRow key={s.key} title={s.title} subtitle={s.sub} value={isOn(t, s)} busy={busyKey === s.key} onChange={(v) => flip(s, v)} />
          ))}
        </ListCard>
      </View>

      <View style={{ gap: gap - 8 }}>
        <SectionHeader title="Visitors" />
        <Card padded style={{ gap: 16 }}>
          <TextField
            label="Wait for the host (minutes)"
            value={waitV}
            onChangeText={setWait}
            keyboardType="number-pad"
            maxLength={3}
            hint="After this, an unanswered visit shows “No response” so reception can step in."
          />
          <TextField label="Keep visitor photos (days)" value={keepV} onChangeText={setKeep} keyboardType="number-pad" maxLength={3} hint="Then the photo is deleted for good. The visit itself stays." />
          {visitError ? <Banner tone="danger" message={visitError} /> : null}
          <Button title="Save" variant="primary" size="md" loading={busyKey === 'visitors'} disabled={wait === null && keep === null} onPress={saveVisitors} />
        </Card>
      </View>

      <View style={{ gap: gap - 8 }}>
        <SectionHeader title="Who can…" overline="People added by name, whatever their role" />
        <ListCard>
          {GRANT_LISTS.map((g) => {
            const n = Array.isArray(t[g.key]) ? (t[g.key] as unknown[]).length : 0;
            return (
              <ListRow
                key={g.key}
                left={<ModuleBadge module="people" icon={UsersRound} />}
                title={g.rowLabel}
                subtitle={n ? plural(n, 'person', 'people') : 'No one added'}
                chevron
                onPress={() => router.push(`/admin/company/settings/access/${g.slug}`)}
              />
            );
          })}
        </ListCard>
      </View>

      {canSetEarnCap(user) ? (
        <View style={{ gap: gap - 8 }}>
          <SectionHeader title="Bounty earning limit" />
          <Card padded style={{ gap: 16 }}>
            <TextField
              label="Coins one person can earn a month"
              value={capV}
              onChangeText={setCap}
              keyboardType="number-pad"
              placeholder="No limit"
              left={<Coins size={18} color={palette.textMuted} />}
              hint="Once someone reaches it, new bounty tasks stop showing for them until next month. Work they already took is not affected."
            />
            {capError ? <Banner tone="danger" message={capError} /> : null}
            <Button title="Save" variant="primary" size="md" loading={busyKey === 'cap'} disabled={cap === null} onPress={saveCap} />
          </Card>
        </View>
      ) : null}

      {hrRow || rosterRow ? (
        <View style={{ gap: gap - 8 }}>
          <SectionHeader title="By department" />
          <ListCard>
            {hrRow ? (
              <ListRow
                left={<ModuleBadge module="attendance" icon={Building2} />}
                title="HR by department"
                subtitle="Which departments get clock-in, leave, pay and the other HR features"
                subtitleLines={2}
                chevron
                onPress={() => router.push('/admin/company/settings/hr')}
              />
            ) : null}
            {rosterRow ? (
              <ListRow
                left={<ModuleBadge module="tasks" icon={Network} />}
                title="Team Roster by department"
                subtitle="Which departments can run teams and timed tasks"
                subtitleLines={2}
                chevron
                onPress={() => router.push('/admin/company/settings/team-roster')}
              />
            ) : null}
          </ListCard>
        </View>
      ) : null}

      <View style={{ gap: gap - 8 }}>
        <SectionHeader title="Seats" />
        <Card padded style={{ gap: 12 }}>
          {users.data ? (
            <StripedProgress label="People on DASH" used={seatsUsed} total={seatsMax} />
          ) : (
            <SkeletonList rows={1} />
          )}
          <Text variant="caption" muted>
            The limit is set by the DASH platform owner.
          </Text>
        </Card>
      </View>

      <Banner
        tone="info"
        title="On the DASH website"
        message="Change the logo, the report logo, professional categories, and TV and display pairing there."
      />

      {/* Company details */}
      <Sheet
        visible={editCo}
        onClose={() => setEditCo(false)}
        title="Company details"
        dirty={co.name !== (t.name ?? '') || co.email !== (typeof t.superAdmin === 'string' ? t.superAdmin : '') || co.phone !== (t.phone ?? '') || co.address !== (t.address ?? '')}
        footer={
          <Button
            title="Save"
            loading={busyKey === 'company'}
            onPress={() => {
              if (!co.name.trim()) return setCoError('The company needs a name.');
              save(
                { name: co.name.trim(), superAdmin: co.email.trim(), address: co.address.trim(), phone: co.phone.trim() },
                { key: 'company', done: 'Company details saved', onDone: () => setEditCo(false), onFail: setCoError },
              );
            }}
          />
        }>
        <TextField label="Company name" value={co.name} onChangeText={(v) => setCo((c) => ({ ...c, name: v }))} />
        <TextField
          label="Contact email"
          value={co.email}
          onChangeText={(v) => setCo((c) => ({ ...c, email: v }))}
          keyboardType="email-address"
          autoCapitalize="none"
          hint="This is the company’s Super Admin email on record."
        />
        <TextField label="Phone" value={co.phone} onChangeText={(v) => setCo((c) => ({ ...c, phone: v }))} keyboardType="phone-pad" />
        <TextField label="Address" value={co.address} onChangeText={(v) => setCo((c) => ({ ...c, address: v }))} multiline />
        {coError ? <Banner tone="danger" message={coError} /> : null}
      </Sheet>

      {/* Turning a module off for everyone */}
      <ConfirmSheet
        visible={!!confirmOff}
        onClose={() => setConfirmOff(null)}
        title={confirmOff ? `Turn off ${confirmOff.title.toLowerCase()}?` : ''}
        from={{ title: 'On', subtitle: confirmOff?.title, icon: ToggleRight, module: 'policies' }}
        to={{ title: 'Off', subtitle: `For everyone at ${t.name ?? 'the company'}`, icon: ToggleLeft, module: 'security' }}
        confirmLabel="Swipe to turn off"
        onConfirm={() => {
          const s = confirmOff;
          if (!s) return;
          save({ [s.key]: false } as Partial<Tenant>, { key: s.key, done: `${s.title} off`, onDone: () => setConfirmOff(null), onFail: (m) => { setConfirmOff(null); toast.show(`Couldn’t save: ${m}`, 'danger'); } });
        }}
        loading={!!confirmOff && busyKey === confirmOff.key}
        note="You can turn it back on at any time. No one is notified.">
        {confirmOff?.offWarning ? <SummaryCard rows={[{ key: 'what', label: 'What changes', value: confirmOff.offWarning }]} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}
