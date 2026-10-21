// Company features (TenantFeaturesView, dash.html:2326) for the platform owner. Pick a company, then:
//   HR (HRMS)   HrCompanyCard (:5343): HR on or off for the whole company and which HR modules it may
//               use (grouped Time / People / Payroll; "coming soon" modules can't be picked) —
//               GET / PUT /hr/admin/tenants/:id/access. Switching HR on with nothing chosen gives Attendance.
//   Features    one card per FEATURE_REGISTRY group, a switch per feature. Each switch sends only its own
//               key (PUT /tenants/:id { featureFlags: { id } }, or { bountyEnabled } for bounty) so two
//               quick flips never overwrite each other.
// Anything going OFF hides it for everyone at that company, so it is swiped to confirm; going ON is
// immediate. Nobody is notified either way (the server writes an audit row per change).

import { Redirect, useLocalSearchParams } from 'expo-router';
import { Building2, ToggleLeft, ToggleRight } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { companyName, type HrModule, useHrTenantAccess, useSetHrTenantAccess, useUpdateCompany } from '@/api/platform';
import { canSeeCompanyFeatures, FEATURE_GROUPS, FEATURE_REGISTRY, featureOn, featurePatch, featuresOff } from '@/features/platform/access';
import { usePlatformGate } from '@/features/platform/gate';
import { CompanyPicker, ToggleRow } from '@/features/platform/ui';
import { plural } from '@/lib/format';
import { Banner, ConfirmSheet, EmptyState, ErrorState, ListCard, NavHeader, Screen, SectionHeader, SkeletonList, SummaryCard, toast, useLayout } from '@/ui';

type Off =
  | { kind: 'feature'; id: string; label: string }
  | { kind: 'hr' }
  | { kind: 'module'; id: string; label: string };

const HR_GROUP_ORDER = ['Time', 'People', 'Payroll'];

export default function CompanyFeaturesScreen() {
  const { gap } = useLayout();
  const params = useLocalSearchParams<{ company?: string }>();
  const { user, ready, tenantsQ, tenants } = usePlatformGate();
  const allowed = canSeeCompanyFeatures(user);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [off, setOff] = useState<Off | null>(null);
  const update = useUpdateCompany();
  const setHr = useSetHrTenantAccess();

  const asked = typeof params.company === 'string' ? params.company : '';
  const cid = [chosen, asked].find((x) => x && tenants.some((t) => t.id === x)) ?? tenants[0]?.id ?? '';
  const t = tenants.find((x) => x.id === cid) ?? null;
  const hrQ = useHrTenantAccess(allowed && cid ? cid : null);

  if (ready && !allowed) return <Redirect href="/" />;

  const name = companyName(t);
  const offCount = featuresOff(t);

  const flipFeature = (id: string, label: string, next: boolean) => {
    if (!t) return;
    if (!next) return setOff({ kind: 'feature', id, label });
    saveFeature(id, label, true);
  };
  const saveFeature = (id: string, label: string, next: boolean, after?: () => void) => {
    if (!t) return;
    setBusy(`f:${id}`);
    update.mutate(
      { tenantId: t.id, patch: featurePatch(id, next) },
      {
        onSuccess: () => {
          after?.();
          toast.show(`${label} ${next ? 'on' : 'off'} for ${name}`, 'success');
        },
        onError: (e) => {
          after?.();
          toast.show(`Couldn’t save: ${e.message}`, 'danger');
        },
        onSettled: () => setBusy(null),
      },
    );
  };

  const hr = hrQ.data;
  const saveHr = (enabled: boolean, modules: string[] | undefined, key: string, done: string, after?: () => void) => {
    if (!t) return;
    setBusy(key);
    setHr.mutate(
      { tenantId: t.id, enabled, modules },
      {
        onSuccess: () => {
          after?.();
          toast.show(done, 'success');
        },
        onError: (e) => {
          after?.();
          toast.show(`Couldn’t save: ${e.message}`, 'danger');
        },
        onSettled: () => setBusy(null),
      },
    );
  };
  const flipHr = (next: boolean) => {
    if (!hr) return;
    if (!next) return setOff({ kind: 'hr' });
    // As the website: keep the chosen modules, or let the server give Attendance when there are none.
    saveHr(true, hr.modules.length ? hr.modules : undefined, 'hr', `HR on for ${name}`);
  };
  const flipModule = (m: HrModule, next: boolean) => {
    if (!hr) return;
    if (!next) return setOff({ kind: 'module', id: m.id, label: m.label });
    saveHr(true, [...hr.modules.filter((x) => x !== m.id), m.id], `m:${m.id}`, `${m.label} on for ${name}`);
  };

  const confirmOff = () => {
    const o = off;
    if (!o || !t) return;
    const close = () => setOff(null);
    if (o.kind === 'feature') return saveFeature(o.id, o.label, false, close);
    if (!hr) return close();
    if (o.kind === 'hr') return saveHr(false, hr.modules.length ? hr.modules : undefined, 'hr', `HR off for ${name}`, close);
    saveHr(true, hr.modules.filter((x) => x !== o.id), `m:${o.id}`, `${o.label} off for ${name}`, close);
  };
  const offBusy = !!off && (off.kind === 'feature' ? busy === `f:${off.id}` : off.kind === 'hr' ? busy === 'hr' : busy === `m:${off.id}`);
  const offTitle = off ? (off.kind === 'hr' ? 'HR' : off.label) : '';
  const offWhat = !off
    ? ''
    : off.kind === 'hr'
      ? 'Every HR feature disappears for everyone there: clock-in, leave, pay and the rest. Their records are kept.'
      : off.kind === 'module'
        ? `${off.label} disappears for everyone there. Their records are kept.`
        : `${off.label} disappears from the menus, tabs and links of everyone there, whatever their role.`;

  const hrGroups = hr ? [...HR_GROUP_ORDER.filter((g) => hr.catalogue.some((m) => m.group === g)), ...[...new Set(hr.catalogue.map((m) => m.group))].filter((g) => !HR_GROUP_ORDER.includes(g))] : [];

  return (
    <Screen header={<NavHeader title="Company features" />} onRefresh={() => Promise.all([tenantsQ.refetch(), hrQ.refetch()])}>
      {tenantsQ.data ? (
        tenants.length ? (
          <>
            <View style={{ alignItems: 'flex-start' }}>
              <CompanyPicker tenants={tenants} value={cid} onChange={setChosen} />
            </View>
            <Banner
              tone={offCount ? 'warning' : 'info'}
              message={
                offCount
                  ? `${plural(offCount, 'feature')} switched off for ${name}. A feature that is off disappears for everyone there.`
                  : `Every feature is on for ${name}. A feature you switch off disappears for everyone there.`
              }
            />

            <View style={{ gap: gap - 8 }}>
              <SectionHeader title="HR" overline="The company’s Super Admin then turns it on per department" />
              {hr ? (
                <ListCard>
                  <ToggleRow
                    title="HR (HRMS)"
                    subtitle={hr.enabled ? plural(hr.modules.length, 'module') + ' on' : 'Off: no HR features at all'}
                    value={hr.enabled}
                    busy={busy === 'hr'}
                    onChange={flipHr}
                  />
                </ListCard>
              ) : hrQ.isError ? (
                <ErrorState message={hrQ.error?.message ?? 'HR access could not be loaded.'} onRetry={() => void hrQ.refetch()} />
              ) : (
                <SkeletonList rows={1} />
              )}
              {hr?.enabled
                ? hrGroups.map((g) => (
                    <ListCard key={g} title={g}>
                      {hr.catalogue
                        .filter((m) => m.group === g)
                        .map((m) => (
                          <ToggleRow
                            key={m.id}
                            title={m.label}
                            subtitle={m.available ? m.desc : `Coming soon. ${m.desc}`}
                            value={hr.modules.includes(m.id)}
                            disabled={!m.available}
                            busy={busy === `m:${m.id}` || busy === 'hr'}
                            onChange={(v) => flipModule(m, v)}
                          />
                        ))}
                    </ListCard>
                  ))
                : null}
            </View>

            {FEATURE_GROUPS.map((g) => (
              <View key={g} style={{ gap: gap - 8 }}>
                <SectionHeader title={g} />
                <ListCard>
                  {FEATURE_REGISTRY.filter((f) => f.group === g).map((f) => (
                    <ToggleRow
                      key={f.id}
                      title={f.label}
                      subtitle={f.sub}
                      value={featureOn(t, f.id)}
                      busy={busy === `f:${f.id}`}
                      onChange={(v) => flipFeature(f.id, f.label, v)}
                    />
                  ))}
                </ListCard>
              </View>
            ))}
          </>
        ) : (
          <EmptyState icon={<Building2 />} title="No companies yet" message="Register a company first, in Companies." />
        )
      ) : tenantsQ.isError ? (
        <ErrorState message={tenantsQ.error?.message ?? 'The companies could not be loaded.'} onRetry={() => void tenantsQ.refetch()} />
      ) : (
        <SkeletonList rows={6} />
      )}

      <ConfirmSheet
        visible={!!off}
        onClose={() => setOff(null)}
        title={`Turn off ${offTitle}?`}
        from={{ title: 'On', subtitle: offTitle, icon: ToggleRight, module: 'policies' }}
        to={{ title: 'Off', subtitle: `For everyone at ${name}`, icon: ToggleLeft, module: 'security' }}
        confirmLabel="Swipe to turn off"
        onConfirm={confirmOff}
        loading={offBusy}
        note="You can turn it back on at any time. No one is notified.">
        <SummaryCard rows={[{ key: 'what', label: 'What changes', value: offWhat }]} />
      </ConfirmSheet>
    </Screen>
  );
}
