// Payroll setup — the editing half of the website's payroll tabs that the phone used to leave on the
// website (dash.html:5167 SalaryStructures editor, :5239 StatutorySettings), plus the HR database
// check that the website shows HR admins on the HR page (HrDbCheckBanner :5315, GET /hr/admin/db-check
// hr.js:437). Super Admin and HR only, each part behind its own module (features/hradvanced/access).

import { router } from 'expo-router';
import { Database, Layers, Scale } from 'lucide-react-native';

import { useHrMe } from '@/api/me';
import { useSalaryStructures, useStatutory } from '@/api/payroll';
import { payrollSetupGates } from '@/features/hradvanced/access';
import { useHrDbCheck } from '@/features/hradvanced/api';
import { errorText, GateFallback } from '@/features/hradvanced/ui';
import { useAccess } from '@/lib/use-access';
import { ActivityList, ActivityRow, Banner, NavHeader, Screen, Text } from '@/ui';

export default function PayrollSetupScreen() {
  const access = useAccess();
  const hrQ = useHrMe();
  const g = payrollSetupGates(access.hr, access.user);
  const structures = useSalaryStructures(g.structures);
  const statutory = useStatutory(g.statutory);
  const db = useHrDbCheck(g.any && g.dbCheck);
  const header = <NavHeader title="Payroll setup" />;
  if (!g.any) return <GateFallback pending={hrQ.isPending} header={header} />;

  const count = Array.isArray(structures.data) ? structures.data.length : null;
  const missing = statutory.data?.missing ?? null;
  const missingDb = db.data && !db.data.ok ? db.data.results.filter((r) => !r.ok) : [];

  return (
    <Screen header={header} onRefresh={() =>
        // refetch() ignores `enabled`: only re-read what this person may see (HR with only the tax module
        // would otherwise get a 403 from the structures route and a false "Couldn’t load" banner).
        Promise.all([g.structures ? structures.refetch() : null, g.statutory ? statutory.refetch() : null, g.dbCheck ? db.refetch() : null])
      }>
      {db.data && !db.data.ok ? (
        <Banner
          tone="warning"
          icon={Database}
          title="HR database setup isn’t finished"
          message={`In Supabase, open the SQL Editor and run each file below in full, in this order: ${db.data.runFiles.join(' → ')}. Missing now: ${missingDb.map((x) => x.missing || x.table).join(', ')}.`}
          action={{ label: 'Check again', onPress: () => void db.refetch(), loading: db.isFetching }}
        />
      ) : null}

      <ActivityList title="What you can change">
        {g.structures ? (
          <ActivityRow
            module="pay"
            icon={Layers}
            title="Salary structures"
            subtitle="Create a structure or change its parts. Existing salaries keep their own copy."
            subtitleLines={3}
            meta={count === null ? null : `${count} active`}
            chevron
            onPress={() => router.push('/admin/hr-advanced/structures')}
          />
        ) : null}
        {g.statutory ? (
          <ActivityRow
            module="policies"
            icon={Scale}
            title="Statutory and TDS"
            subtitle="Provident Fund, ESI, professional tax and income tax slabs."
            subtitleLines={3}
            status={missing === null ? null : missing.length ? { label: `${missing.length} missing`, tone: 'failed' } : { label: 'Complete', tone: 'done' }}
            chevron
            onPress={() => router.push('/admin/hr-advanced/statutory')}
          />
        ) : null}
      </ActivityList>
      {structures.error && !structures.data ? <Banner tone="danger" title="Couldn’t load structures" message={errorText(structures.error)} /> : null}
      <Text variant="caption" muted align="center">
        These change everyone’s pay from the next payroll run. Values for tax must be confirmed with your CA. Nobody is messaged.
      </Text>
    </Screen>
  );
}
