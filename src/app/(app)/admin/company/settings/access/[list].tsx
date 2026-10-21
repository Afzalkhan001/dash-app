// "Who can…" — one Config grant list (dash.html AnnouncementCreatorsCard :3141, BountyCreatorsCard
// :3201, ProjectCreatorsCard :3297, AuditAccessCard :3355, SubscriptionAccessCard :11817):
//   news → announcementCreators, bounty → bountyCreators, projects → projectCreators  {name, empNo}
//   audit → auditAccess {name, empNo, userId, permissions{viewLogs, searchUsers, viewDetail, downloadReports}}
//   subscriptions → subscriptionAccess {name, empNo, userId}
// "Add person" picks from GET /users + GET /whitelist of this company, deduped by email (the website's
// roster for these cards). The server REPLACES the whole list on PUT /tenants/:id, so every change
// re-reads the company record first and is applied to the freshest list (a toast says so when someone
// else changed it in the meantime).

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Trash2, UserPlus, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type AnyGrant, fetchFreshTenant, useCompanyDepartments, useCompanyUsers, useUpdateTenant, useWhitelist } from '@/api/company';
import { canSeeCompanySettings } from '@/features/company/access';
import { AUDIT_PERMISSIONS, DEFAULT_AUDIT_PERMS, grantListBySlug, roleLabel } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { ToggleRow } from '@/features/company/toggle-row';
import { PersonPicker, type PickPerson } from '@/features/shared/person-picker';
import { plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, EmptyState, ListCard, NavHeader, Screen, SectionHeader, Sheet, SkeletonList, SummaryCard, Text, toast, useLayout } from '@/ui';

type Perm = (typeof AUDIT_PERMISSIONS)[number]['key'];

const low = (v: unknown) => String(v ?? '').trim().toLowerCase();

export default function GrantListScreen() {
  const qc = useQueryClient();
  const { gap } = useLayout();
  const { list: slug } = useLocalSearchParams<{ list: string }>();
  const meta = grantListBySlug(typeof slug === 'string' ? slug : '');
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canSeeCompanySettings(user, tenant) && !!meta;
  const users = useCompanyUsers(allowed);
  const wl = useWhitelist(allowed);
  const depts = useCompanyDepartments(allowed);
  const update = useUpdateTenant();
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<AnyGrant | null>(null);
  const [busy, setBusy] = useState(false);

  if (ready && !allowed) return <Redirect href="/" />;
  if (!meta) return null;

  const tid = tenant?.id ?? '';
  const grants: AnyGrant[] = Array.isArray(tenant?.[meta.key]) ? (tenant[meta.key] as AnyGrant[]).filter((g) => !!g && typeof g === 'object') : [];
  // The identity each card de-duplicates on (dash.html add()).
  const idOf = (g: { userId?: string; empNo?: string; name?: string }) => low(meta.withUserId ? g.userId || g.empNo || g.name : g.empNo || g.name);
  const deptName = (id: string) => depts.data?.find((d) => d.id === id || d.name === id)?.name ?? '';

  // The website's roster for these cards: users then invitations, same company, one row per email.
  const seen = new Set<string>();
  const pool: PickPerson[] = [...(users.data ?? []), ...(wl.data ?? [])]
    .filter((u) => !tid || u.tenantId === tid)
    .filter((u) => {
      const k = low(u.email || u.id);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return !!u.name;
    })
    .map((u) => ({ id: u.id, name: u.name, employeeNumber: u.employeeNumber || undefined, jobTitle: u.jobTitle || roleLabel(u.role), dept: deptName(u.dept) || undefined, role: u.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const taken = new Set(grants.map(idOf));
  const asGrant = (p: PickPerson) => ({ name: p.name, empNo: p.employeeNumber || '', userId: p.id });

  /** Re-read the company, apply `change` to the freshest list, save it whole. */
  const apply = async (change: (fresh: AnyGrant[]) => AnyGrant[], done: string) => {
    if (!tid) return;
    setBusy(true);
    try {
      const fresh = await fetchFreshTenant(qc, tid);
      const current = Array.isArray(fresh?.[meta.key]) ? (fresh[meta.key] as AnyGrant[]) : [];
      if (JSON.stringify(current) !== JSON.stringify(grants)) toast.show('This list changed a moment ago. Your change was made to the latest one.', 'info');
      const next = change(current);
      await update.mutateAsync({ tenantId: tid, patch: { [meta.key]: next } });
      toast.show(done, 'success');
    } catch (e) {
      toast.show(`Couldn’t save: ${e instanceof Error ? e.message : 'try again'}`, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const add = (p: PickPerson) => {
    const g = asGrant(p);
    const entry: AnyGrant =
      meta.key === 'auditAccess'
        ? { name: g.name, empNo: g.empNo, userId: g.userId, permissions: { ...DEFAULT_AUDIT_PERMS } }
        : meta.withUserId
          ? { name: g.name, empNo: g.empNo, userId: g.userId }
          : { name: g.name, empNo: g.empNo };
    void apply((fresh) => (fresh.some((x) => idOf(x) === idOf(entry)) ? fresh : [...fresh, entry]), `${p.name} added`);
  };

  const removeGrant = (g: AnyGrant) => {
    setOpen(null);
    void apply((fresh) => fresh.filter((x) => idOf(x) !== idOf(g)), `${g.name ?? 'They'} removed`);
  };

  const togglePerm = (g: AnyGrant, perm: Perm) => {
    const nextVal = !g.permissions?.[perm];
    setOpen({ ...g, permissions: { ...g.permissions, [perm]: nextVal } });
    void apply(
      (fresh) => fresh.map((x) => (idOf(x) === idOf(g) ? { ...x, permissions: { ...x.permissions, [perm]: nextVal } } : x)),
      'Saved. It applies straight away.',
    );
  };

  const permSummary = (g: AnyGrant) => {
    const on = AUDIT_PERMISSIONS.filter((p) => g.permissions?.[p.key]).map((p) => p.label.toLowerCase());
    return on.length ? on.join(', ') : 'Nothing switched on';
  };

  return (
    <Screen
      header={<NavHeader title={meta.title} actions={[{ icon: UserPlus, label: 'Add a person', onPress: () => setPicking(true), disabled: busy }]} />}
      onRefresh={() => qc.invalidateQueries({ queryKey: ['tenants'] })}>
      <View style={{ gap: 6 }}>
        <Text variant="body">{meta.intro}</Text>
        <Text variant="caption" muted>
          {meta.always}
        </Text>
      </View>

      <View style={{ gap: gap - 8 }}>
        <SectionHeader title={grants.length ? plural(grants.length, 'person', 'people') : 'No one yet'} />
        {!tenant ? (
          <SkeletonList rows={3} avatar />
        ) : grants.length ? (
          <ActivityList>
            {grants.map((g, i) => (
              <ActivityRow
                key={`${idOf(g)}-${i}`}
                person={{ name: g.name || g.empNo || '?' }}
                title={g.name || g.empNo || 'Unnamed'}
                subtitle={[g.empNo ? `Employee no. ${g.empNo}` : '', meta.key === 'auditAccess' ? permSummary(g) : ''].filter(Boolean).join(' · ') || undefined}
                chevron
                onPress={() => setOpen(g)}
              />
            ))}
          </ActivityList>
        ) : (
          <EmptyState icon={<UsersRound color={palette.textMuted} />} title={meta.empty} action={<Button title="Add a person" variant="accent" size="md" icon={<UserPlus />} onPress={() => setPicking(true)} />} />
        )}
      </View>

      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Add a person"
        subtitle={meta.rowLabel}
        people={pool}
        loading={users.isPending || wl.isPending}
        filter={(p) => !taken.has(idOf(asGrant(p))) && !taken.has(low(p.name))}
        allowOnLeave
        recentKey={`company.grants.${meta.slug}`}
        onPick={add}
        emptyMessage="Everyone who matches is already on the list."
      />

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name || 'Person'} subtitle={meta.rowLabel}>
        {open ? (
          <>
            <SummaryCard rows={[{ key: 'emp', label: 'Employee number', value: open.empNo || '—' }]} />
            {meta.key === 'auditAccess' ? (
              <ListCard>
                {AUDIT_PERMISSIONS.map((p) => (
                  <ToggleRow key={p.key} title={p.label} subtitle={p.hint} value={!!open.permissions?.[p.key]} busy={busy} onChange={() => togglePerm(open, p.key)} />
                ))}
              </ListCard>
            ) : null}
            <Banner tone="info" message="Removing them takes effect straight away. No one is notified." />
            <Button variant="danger" title="Remove from this list" icon={<Trash2 />} loading={busy} onPress={() => removeGrant(open)} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
