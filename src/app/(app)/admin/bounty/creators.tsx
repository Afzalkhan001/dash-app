// Task posters — the website's "Bounty Creators" tab (dash.html BountyCreatorsCard :3201 and, for Super
// Admin, BountyMonthlyCapCard :3271):
//   - who has been given the right to post bounty tasks (tenant.bountyCreators, matched by employee
//     number or name). Super Admin, CEO, COO and HR may add or remove people; the App Manager only sees
//     the list. The website's note that "HR and IT Admin always have this permission" is wrong — only
//     Super Admin, CEO and COO always do (server.js:4856) — so the phone says that instead.
//   - the monthly earning cap (Super Admin only; the server ignores it from anyone else).
// The server replaces the whole list on PUT /tenants/:id, so each change re-reads the company first and
// is applied to the freshest list.

import { useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { fetchFreshTenant, useUpdateTenant } from '@/api/company';
import type { TenantGrant } from '@/api/me';
import { CoinsField } from '@/features/bountyadmin/components';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { PersonPicker, type PickPerson, usePickablePeople } from '@/features/shared/person-picker';
import { palette, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, Card, ConfirmSheet, EmptyState, IconButton, NavHeader, Screen, Text, toast } from '@/ui';

const TITLE = 'Task posters';
const low = (v: unknown) => String(v ?? '').trim().toLowerCase();
const keyOf = (g: TenantGrant) => low(g.empNo || g.name);

export default function CreatorsScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.creators} ready={ready} title={TITLE}>
      <Creators />
    </AdminGate>
  );
}

function Creators() {
  const qc = useQueryClient();
  const { tenant, gates: g } = useBountyAdmin();
  const update = useUpdateTenant();
  const peopleQ = usePickablePeople({ enabled: g.editCreators });
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<TenantGrant | null>(null);
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState(tenant?.bountyMonthlyEarnCap ? String(tenant.bountyMonthlyEarnCap) : '');
  const [savingCap, setSavingCap] = useState(false);

  const tid = tenant?.id ?? '';
  const list: TenantGrant[] = Array.isArray(tenant?.bountyCreators) ? tenant.bountyCreators.filter((x) => !!x && typeof x === 'object') : [];
  const taken = new Set(list.map(keyOf));
  const people: PickPerson[] = (peopleQ.data ?? []).filter((p) => !taken.has(low(p.employeeNumber || p.name)));

  /** Re-read the company, apply `change` to the freshest list, save it whole. */
  const apply = async (change: (fresh: TenantGrant[]) => TenantGrant[], done: string) => {
    if (!tid) return false;
    setBusy(true);
    try {
      const fresh = await fetchFreshTenant(qc, tid);
      const current = Array.isArray(fresh?.bountyCreators) ? fresh.bountyCreators : [];
      if (JSON.stringify(current) !== JSON.stringify(list)) toast.show('This list changed a moment ago. Your change was made to the latest one.', 'info');
      await update.mutateAsync({ tenantId: tid, patch: { bountyCreators: change(current) } });
      void qc.invalidateQueries({ queryKey: ['bountyadmin', 'creators'] });
      toast.show(done, 'success');
      return true;
    } catch (e) {
      Alert.alert('Couldn’t save the list', e instanceof Error ? e.message : 'Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = (p: PickPerson) => {
    const grant = { name: p.name, empNo: p.employeeNumber || '' };
    void apply((fresh) => (fresh.some((x) => keyOf(x) === keyOf(grant)) ? fresh : [...fresh, grant]), `${p.name} can post bounty tasks`);
  };

  const remove = async () => {
    const r = removing;
    if (!r) return;
    const ok = await apply((fresh) => fresh.filter((x) => keyOf(x) !== keyOf(r)), `${r.name || 'They'} can no longer post bounty tasks`);
    if (ok) setRemoving(null);
  };

  // dash.html:3277: blank or 0 = no cap.
  const capN = cap.trim() === '' ? 0 : Math.round(Number(cap));
  const saveCap = async () => {
    if (!tid) return;
    setSavingCap(true);
    try {
      await update.mutateAsync({ tenantId: tid, patch: { bountyMonthlyEarnCap: capN } });
      toast.show(capN ? `Cap set to ${capN.toLocaleString('en-IN')} coins a month` : 'No monthly cap', 'success');
    } catch (e) {
      Alert.alert('Couldn’t save the cap', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSavingCap(false);
    }
  };

  return (
    <>
      <Screen header={<NavHeader title={TITLE} />} onRefresh={() => qc.invalidateQueries({ queryKey: ['tenants'] })}>
        <Banner
          tone="info"
          title="Who can post bounty tasks"
          message="Super Admin, CEO and COO always can. Add anyone else here by name — they fund their tasks with coins Super Admin gives them."
        />
        {!g.editCreators ? <Banner tone="info" message="You can see this list. Changing it is for Super Admin, CEO, COO and HR." /> : null}

        <ActivityList
          title="Added people"
          right={
            g.editCreators ? (
              <Button title="Add" size="sm" variant="ghost" icon={<UserPlus />} disabled={busy} onPress={() => setPicking(true)} />
            ) : undefined
          }>
          {list.length ? (
            list.map((c, i) => (
              <ActivityRow
                key={`${keyOf(c)}-${i}`}
                person={{ name: c.name || 'Employee' }}
                title={c.name || 'Employee'}
                subtitle={c.empNo ? `Employee no. ${c.empNo}` : 'Matched by name'}
                right={
                  g.editCreators ? (
                    <IconButton tone="surface" accessibilityLabel={`Remove ${c.name || 'this person'}`} disabled={busy} onPress={() => setRemoving(c)}>
                      <Trash2 size={18} color={palette.dangerInk} strokeWidth={1.8} />
                    </IconButton>
                  ) : undefined
                }
              />
            ))
          ) : (
            <EmptyState icon={<Users color={palette.textMuted} />} title="Nobody added yet" message="Only Super Admin, CEO and COO can post tasks." />
          )}
        </ActivityList>

        {g.cap ? (
          <Card tone="frostStrong" style={{ gap: space.sm }}>
            <Text variant="heading" accessibilityRole="header">
              Monthly earning cap
            </Text>
            <Text variant="label" muted>
              {tenant?.bountyMonthlyEarnCap ? `Now ${Number(tenant.bountyMonthlyEarnCap).toLocaleString('en-IN')} coins a month` : 'No cap now'}
            </Text>
            <CoinsField
              label="Most coins one person can earn in a month"
              value={cap}
              onChange={setCap}
              placeholder="No cap"
              hint="Once someone reaches it, new tasks stop showing for them until next month. Work they already took is not affected."
            />
            <Button title="Save cap" variant="ghost" loading={savingCap} disabled={capN === Number(tenant?.bountyMonthlyEarnCap || 0)} onPress={() => void saveCap()} />
          </Card>
        ) : null}
      </Screen>

      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Who can post tasks"
        people={people}
        loading={peopleQ.isLoading}
        allowOnLeave
        recentKey="bountyadmin.creators"
        onPick={add}
      />

      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title="Stop them posting tasks?"
        from={{ title: removing?.name || '', subtitle: removing?.empNo ? `Employee no. ${removing.empNo}` : undefined, avatar: { name: removing?.name || '' } }}
        to={{ title: 'Can’t post tasks', icon: Users, module: 'bounty' }}
        confirmLabel="Swipe to remove"
        onConfirm={() => void remove()}
        loading={busy}
        note="Their tasks already posted stay open. Unused coins stay with them until Super Admin takes them back. No message is sent."
      />
    </>
  );
}
