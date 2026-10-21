// HR by department (HrAccessCard, dash.html:5377) — Super Admin only. GET /hr/config/overview lists the
// company's departments with HR on or off and their modules (only modules the platform owner granted
// the company can be chosen). A department's switch → PUT /hr/config/departments/:id {enabled};
// tap the row → its modules → {enabled: true, modules}; "Turn all on / off" → PUT /hr/config/departments
// {departmentIds, enabled}. Turning HR OFF stops clock-in, leave and pay requests for that department
// at once, so it is swiped to confirm.

import { Redirect } from 'expo-router';
import { Building2, ListChecks, MoreHorizontal, Search, ToggleLeft, ToggleRight } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type HrDeptAccess, useHrConfig, useSetHrDepartments } from '@/api/company';
import { canConfigureHr } from '@/features/company/access';
import { hrModuleLabel } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { ToggleRow } from '@/features/company/toggle-row';
import { plural } from '@/lib/format';
import { palette, space } from '@/theme/tokens';
import { Banner, Button, ConfirmSheet, EmptyState, ErrorState, ListCard, MenuSheet, NavHeader, PillField, Screen, SectionHeader, Sheet, SkeletonList, SummaryCard, Text, toast, useLayout } from '@/ui';

type Pending = { ids: string[]; label: string } | null;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export default function HrByDepartmentScreen() {
  const { gap } = useLayout();
  const { access, user, ready } = useCompanyAccess();
  const allowed = canConfigureHr(user, access.hr);
  const cfg = useHrConfig(allowed);
  const set = useSetHrDepartments();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [off, setOff] = useState<Pending>(null);

  if (ready && !allowed) return <Redirect href="/" />;

  const d = cfg.data;
  const granted = (d?.catalogue ?? []).filter((m) => m.granted && m.available);
  const needle = q.trim().toLowerCase();
  const list = (d?.departments ?? []).filter((x) => !needle || x.name.toLowerCase().includes(needle));
  const dept = d?.departments.find((x) => x.id === open) ?? null;

  const run = (ids: string[], enabled: boolean, modules?: string[], done?: string, after?: () => void) =>
    set.mutate(
      { ids, enabled, modules },
      {
        onSuccess: () => {
          if (done) toast.show(done, 'success');
          after?.();
        },
        onError: (e) => toast.show(`Couldn’t save: ${e.message}`, 'danger'),
      },
    );

  const flip = (x: HrDeptAccess, next: boolean) => {
    if (!next) return setOff({ ids: [x.id], label: x.name });
    run([x.id], true, undefined, `HR on for ${x.name}`);
  };

  const toggleModule = (x: HrDeptAccess, id: string) => {
    const has = x.modules.includes(id);
    const modules = has ? x.modules.filter((m) => m !== id) : [...x.modules, id];
    run([x.id], true, modules);
  };

  const subtitleOf = (x: HrDeptAccess) =>
    [x.adminName ? `Admin: ${x.adminName}` : 'No department admin', x.enabled ? plural(x.modules.length, 'feature') : 'HR off'].join(' · ');

  return (
    <Screen
      header={<NavHeader title="HR by department" actions={d?.tenant.enabled && list.length ? [{ icon: MoreHorizontal, label: 'Turn all on or off', onPress: () => setMenu(true), disabled: set.isPending }] : []} />}
      onRefresh={() => cfg.refetch()}>
      {cfg.isPending ? (
        <SkeletonList rows={6} />
      ) : cfg.isError && !d ? (
        <ErrorState message={cfg.error?.message ?? ''} onRetry={() => void cfg.refetch()} />
      ) : d && !d.tenant.enabled ? (
        <EmptyState icon={<Building2 color={palette.textMuted} />} title="HR isn’t on for your company" message="Ask the DASH platform owner to switch it on." />
      ) : d ? (
        // A View, not a fragment: Screen spaces its direct children only.
        <View style={{ gap }}>
          <View style={{ gap: space.xxs }}>
            <Text variant="body" muted>
              Departments that are off see no HR features at all.
            </Text>
            <Text variant="caption" muted>
              Your company has {granted.map((m) => lowerFirst(hrModuleLabel(m.id, m.label))).join(', ') || 'no HR features yet'}.
            </Text>
          </View>
          {d.departments.length > 6 ? <PillField icon={Search} placeholder="Search departments" value={q} onChangeText={setQ} /> : null}
          <View style={{ gap: gap - 8 }}>
            <SectionHeader title={plural(list.length, 'department')} />
            {list.length ? (
              <ListCard>
                {list.map((x) => (
                  <View key={x.id}>
                    <ToggleRow title={x.name} subtitle={subtitleOf(x)} value={x.enabled} busy={set.isPending} onChange={(v) => flip(x, v)} />
                    {x.enabled ? (
                      <View style={{ paddingHorizontal: space.sm, paddingBottom: space.xs, alignItems: 'flex-start' }}>
                        <Button variant="text" size="sm" title="Choose features" icon={<ListChecks />} onPress={() => setOpen(x.id)} accessibilityLabel={`Choose HR features for ${x.name}`} />
                      </View>
                    ) : null}
                  </View>
                ))}
              </ListCard>
            ) : (
              <EmptyState title={needle ? 'No department matches' : 'No departments yet'} />
            )}
          </View>
        </View>
      ) : null}

      <Sheet visible={!!dept} onClose={() => setOpen(null)} title={dept?.name ?? ''} subtitle="HR features for this department">
        {dept ? (
          <>
            <ListCard>
              {granted.map((m) => (
                <ToggleRow key={m.id} title={hrModuleLabel(m.id, m.label)} value={dept.modules.includes(m.id)} busy={set.isPending} onChange={() => toggleModule(dept, m.id)} />
              ))}
            </ListCard>
            <Banner tone="info" message="Changes apply straight away for everyone in the department. No one is notified." />
          </>
        ) : null}
      </Sheet>

      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={needle ? 'Departments shown' : 'All departments'}
        items={[
          { key: 'on', label: needle ? 'Turn HR on for those shown' : 'Turn HR on for all', icon: ToggleRight, onPress: () => run(list.map((x) => x.id), true, undefined, 'HR on') },
          { key: 'off', label: needle ? 'Turn HR off for those shown' : 'Turn HR off for all', icon: ToggleLeft, tone: 'danger', onPress: () => setOff({ ids: list.map((x) => x.id), label: plural(list.length, 'department') }) },
        ]}
      />

      <ConfirmSheet
        visible={!!off}
        onClose={() => setOff(null)}
        title="Turn HR off?"
        from={{ title: 'HR on', subtitle: off?.label, icon: ToggleRight, module: 'attendance' }}
        to={{ title: 'HR off', subtitle: 'Nothing to clock in or apply for', icon: ToggleLeft, module: 'security' }}
        confirmLabel="Swipe to turn off"
        onConfirm={() => {
          const p = off;
          if (p) run(p.ids, false, undefined, `HR off for ${p.label}`, () => setOff(null));
        }}
        loading={set.isPending}
        note="You can turn it back on at any time. No one is notified.">
        <SummaryCard rows={[{ key: 'what', label: 'What stops', value: `Clock-in, leave, pay and every other HR feature for ${off?.label ?? ''}.` }]} />
      </ConfirmSheet>
    </Screen>
  );
}
