// Salary structures to edit — the list half of the website's SalaryStructures (dash.html:5167):
// GET /hr/salary/structures, "New structure", and Edit on each row. Retire and "Try a CTC" stay on
// the payroll domain's read-only screen (/admin/payroll/structures), linked at the bottom.

import { router } from 'expo-router';
import { Layers, Plus } from 'lucide-react-native';

import { useHrMe } from '@/api/me';
import { useSalaryStructures } from '@/api/payroll';
import { payrollSetupGates } from '@/features/hradvanced/access';
import { errorText, GateFallback } from '@/features/hradvanced/ui';
import { calcWords } from '@/features/payroll/ui';
import { inr } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { ActivityList, ActivityRow, Banner, Button, NavHeader, Screen } from '@/ui';

export default function StructureListScreen() {
  const access = useAccess();
  const hrQ = useHrMe();
  const allowed = payrollSetupGates(access.hr, access.user).structures;
  const q = useSalaryStructures(allowed);
  const header = <NavHeader title="Salary structures" actions={allowed ? [{ icon: Plus, label: 'New structure', onPress: () => router.push('/admin/hr-advanced/structures/new') }] : undefined} />;
  if (!allowed) return <GateFallback pending={hrQ.isPending} header={header} />;
  const list = Array.isArray(q.data) ? q.data : [];

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {q.error && !q.data ? <Banner tone="danger" title="Couldn’t load structures" message={errorText(q.error)} action={{ label: 'Retry', onPress: () => void q.refetch() }} /> : null}
      <Button title="New structure" icon={<Plus />} onPress={() => router.push('/admin/hr-advanced/structures/new')} />
      <ActivityList title="Active structures" loading={q.isPending} empty={q.error ? 'Couldn’t load.' : 'No structures yet. Create the first one.'}>
        {list.map((s) => (
          <ActivityRow
            key={s.id}
            module="pay"
            icon={Layers}
            title={s.name}
            subtitle={[s.description, s.components.map((c) => `${c.code} ${calcWords(c, (n) => inr(n, { decimals: false }))}`).join(' · ')].filter(Boolean).join('\n')}
            subtitleLines={4}
            chevron
            onPress={() => router.push({ pathname: '/admin/hr-advanced/structures/[id]', params: { id: s.id } })}
            accessibilityHint="Opens the editor"
          />
        ))}
      </ActivityList>
      <Button title="Retire a structure or try a CTC" variant="ghost" onPress={() => router.push('/admin/payroll/structures')} />
    </Screen>
  );
}
