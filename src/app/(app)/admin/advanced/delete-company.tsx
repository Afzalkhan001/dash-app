// Delete a company (master_admin) — the website's Tenants grid → Delete (dash.html:2479, deleteTenant :2413).
//
//   ?company=<id>  opens straight on that company (the platform company screen can link here);
//                  without it, a list of companies to pick from.
//
// The server's DELETE /tenants/:id removes the company and ~20 tables of its data (every login, booking,
// task, ticket, department, room, project, asset, invitation, support entry and post), then the app
// removes any logins, invitations, departments and projects still left, 15 at a time, like the website.
// It has no role check on the server and no undo, so: a list of what goes, the company's name typed, a
// swipe. Nobody is emailed; everyone at the company simply can't sign in any more.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Search, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { Tenant } from '@/api/me';
import { companyEmail, companyName, companyStatus } from '@/api/platform';
import { canDeleteCompanies } from '@/features/adminadvanced/access';
import { companyCounts, type DeleteProgress, useCompanyData, useDeleteCompany } from '@/features/adminadvanced/api';
import { GateFallback, plural, TypeToConfirm, typedMatches } from '@/features/adminadvanced/ui';
import { usePlatformGate } from '@/features/platform/gate';
import { palette } from '@/theme/tokens';
import {
  Avatar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  NavHeader,
  PillField,
  Screen,
  SkeletonList,
  StatusPill,
  SuccessSheet,
  SummaryCard,
  Text,
} from '@/ui';

const progressText = (p: DeleteProgress | null) =>
  !p ? '' : p.step === 'company' ? 'Deleting the company…' : p.step === 'leftovers' ? `Removing what’s left… ${p.done} of ${p.total}` : 'Finishing…';

export default function DeleteCompanyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ company?: string }>();
  const { user, ready, tenantsQ, tenants } = usePlatformGate();
  const allowed = canDeleteCompanies(user);
  const [picked, setPicked] = useState<string | null>(typeof params.company === 'string' ? params.company : null);
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [progress, setProgress] = useState<DeleteProgress | null>(null);
  const [result, setResult] = useState<{ name: string; leftovers: number; failed: number; checked: boolean } | null>(null);
  const dataQ = useCompanyData(allowed);
  const del = useDeleteCompany();

  const header = <NavHeader title="Delete a company" />;
  if (!allowed) return <GateFallback pending={!ready} header={header} />;

  const t: Tenant | null = picked ? (tenants.find((x) => x.id === picked) ?? null) : null;

  const successSheet = (
    <SuccessSheet
      visible={!!result}
      onClose={() => router.replace('/admin/platform/companies')}
      title="Company deleted"
      subtitle={result ? `${result.name} is no longer on DASH.` : undefined}
      primaryLabel="Done"
      onPrimary={() => router.replace('/admin/platform/companies')}>
      {result ? (
        <SummaryCard
          rows={[
            result.checked
              ? { key: 'left', label: 'Rows tidied up after', value: String(result.leftovers) }
              : { key: 'left', label: 'Rows tidied up after', value: 'Not checked', valueColor: palette.warningInk },
            ...(result.failed ? [{ key: 'failed', label: 'Couldn’t remove', value: String(result.failed), valueColor: palette.dangerInk }] : []),
          ]}
        />
      ) : null}
    </SuccessSheet>
  );

  // ── Pick a company ─────────────────────────────────────────────────────────
  if (!t) {
    const q = search.trim().toLowerCase();
    const list = tenants.filter((x) => !q || companyName(x).toLowerCase().includes(q) || companyEmail(x).includes(q));
    return (
      <Screen header={header} onRefresh={() => Promise.all([tenantsQ.refetch(), dataQ.refetch()])}>
        {picked && tenantsQ.data && !result ? <Banner tone="warning" message="That company is no longer on DASH. Pick another one." /> : null}
        <PillField icon={Search} placeholder="Search companies" value={search} onChangeText={setSearch} accessibilityLabel="Search companies" />
        {tenantsQ.isError && !tenantsQ.data ? (
          <ErrorState message={tenantsQ.error?.message ?? 'The companies could not be loaded.'} onRetry={() => void tenantsQ.refetch()} />
        ) : !tenantsQ.data ? (
          <SkeletonList rows={4} avatar />
        ) : !list.length ? (
          <EmptyState title={q ? 'No company matches' : 'No companies'} message={q ? 'Try another name or email.' : undefined} />
        ) : (
          <ListCard>
            {list.map((x) => {
              const c = companyCounts(dataQ.data, x.id);
              return (
                <ListRow
                  key={x.id}
                  left={<Avatar name={companyName(x)} size={40} ring={false} />}
                  title={companyName(x)}
                  subtitle={dataQ.data ? `${plural(c.users, 'person', 'people')} · ${plural(c.projects, 'project')}` : companyEmail(x) || 'No Super Admin email'}
                  right={companyStatus(x) === 'suspended' ? <StatusPill label="Suspended" tone="failed" /> : undefined}
                  chevron
                  onPress={() => {
                    setPicked(x.id);
                    setTyped('');
                  }}
                />
              );
            })}
          </ListCard>
        )}
        {successSheet}
      </Screen>
    );
  }

  // ── One company ────────────────────────────────────────────────────────────
  const name = companyName(t);
  const c = companyCounts(dataQ.data, t.id);
  const counted = !!dataQ.data;
  // The server deletes every login with this company's id, platform owners included, so deleting the
  // company you are signed in to would delete you too. The website has no such guard; the app does.
  const own = !!user?.tenantId && user.tenantId === t.id;

  const run = () => {
    setProgress(null);
    del.mutate(
      { tenantId: t.id, onProgress: setProgress },
      {
        onSuccess: (r) => {
          setConfirming(false);
          setTyped('');
          setPicked(null);
          setResult({ name, ...r });
        },
      },
    );
  };

  return (
    <Screen header={<NavHeader title="Delete a company" />} onRefresh={() => Promise.all([tenantsQ.refetch(), dataQ.refetch()])}>
      <Card padded style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={name} size={48} ring={false} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="heading" numberOfLines={2}>
              {name}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {companyEmail(t) || 'No Super Admin email'}
            </Text>
          </View>
        </View>
        <Button title="Pick another company" variant="accent" size="md" onPress={() => setPicked(null)} />
      </Card>

      <Banner
        tone="danger"
        title="Everything at this company goes"
        message="The company and all its data are deleted for good: logins, bookings, tasks, service requests, rooms, assets, projects, posts and more. There is no undo, on the website either."
      />

      {dataQ.isError && !counted ? (
        <ErrorState message={dataQ.error?.message ?? 'Couldn’t count what this company has.'} onRetry={() => void dataQ.refetch()} />
      ) : !counted ? (
        <SkeletonList rows={2} />
      ) : (
        <SummaryCard
          title="What will be deleted"
          rows={[
            { key: 'users', label: 'People who sign in', value: plural(c.users, 'person', 'people') },
            { key: 'invites', label: 'Invitations', value: plural(c.invites, 'invitation') },
            { key: 'depts', label: 'Departments', value: plural(c.departments, 'department') },
            { key: 'projects', label: 'Projects (Keka codes)', value: plural(c.projects, 'project') },
            { key: 'rest', label: 'Also', value: 'Bookings, tasks, requests, rooms, assets, posts' },
          ]}
        />
      )}

      {own ? <Banner tone="warning" message="This is the company you are signed in to. Deleting it would delete your own login, so it can’t be done here." /> : null}
      <Button
        title="Delete this company"
        variant="destructive"
        icon={<Trash2 />}
        disabled={!counted || own}
        onPress={() => {
          del.reset();
          setTyped('');
          setConfirming(true);
        }}
      />

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this company?"
        subtitle="This can’t be undone"
        from={{ title: name, subtitle: plural(c.users, 'person', 'people'), icon: Building2, module: 'policies' }}
        to={{ title: 'Deleted for good', subtitle: 'No undo', icon: Trash2, module: 'expenses' }}
        confirmLabel="Swipe to delete the company"
        onConfirm={run}
        loading={del.isPending}
        disabled={own || !typedMatches(typed, name)}
        note={`Nobody is emailed. Everyone at ${name} can’t sign in any more.`}>
        <TypeToConfirm word={name} value={typed} onChangeText={setTyped} what="company name" />
        {del.isPending ? (
          <Text variant="caption" muted align="center">
            {progressText(progress)}
          </Text>
        ) : null}
        {del.error ? <Banner tone="danger" title="Couldn’t delete" message={del.error.message} /> : null}
      </ConfirmSheet>

      {successSheet}
    </Screen>
  );
}
