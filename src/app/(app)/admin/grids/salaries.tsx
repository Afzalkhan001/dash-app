// Salaries table — the website's SalaryPeople table (dash.html:5232) with every column: structure,
// annual and monthly pay, since when, and the tax set-up. GET /hr/salary/people (hr_payroll.js:217,
// salaryAdmin; kept in memory only). Amounts follow the Pay screens' eye; the CSV asks first.
// Read-only: setting or revising a salary stays on Payroll › Salaries, which a row links to (never
// for your own row — notSelf on the server). Nobody is messaged.

import { useRouter } from 'expo-router';
import { Search, Wallet } from 'lucide-react-native';
import { useState } from 'react';

import { type SalaryPerson, useSalaryPeople } from '@/api/payroll';
import { useTodayIst } from '@/features/attendance/use-now';
import { GridView } from '@/features/grids/data-grid';
import { GridGateFallback, gridCsvColumns, RowSheet, ShareCsvButton, useGridGate, useZoom } from '@/features/grids/grid-ui';
import { filterSalaries, salaryColumns } from '@/features/grids/model';
import { isSelf } from '@/features/payroll/access';
import { usePayView } from '@/features/payroll/ui';
import { themedStyles } from '@/theme/themed';
import { moduleTone } from '@/theme/tokens';
import { Button, Chip, ChipRow, EmptyState, ErrorState, NavHeader, PillField, Screen, SkeletonList, Text } from '@/ui';

export default function SalariesGrid() {
  const router = useRouter();
  const today = useTodayIst();
  const { access, allowed, pending } = useGridGate('salaries');
  const { zoom, actions } = useZoom(1);
  const { money, eye } = usePayView();
  const q = useSalaryPeople(allowed);
  const [query, setQuery] = useState('');
  const [unset, setUnset] = useState(false);
  const [open, setOpen] = useState<SalaryPerson | null>(null);
  const header = <NavHeader title="Salaries" subtitle="Everyone’s pay set-up" actions={allowed ? [eye, ...actions] : undefined} />;
  if (!allowed) return <GridGateFallback pending={pending} header={header} />;

  const people = Array.isArray(q.data) ? q.data : [];
  const rows = filterSalaries(people, query.trim().toLowerCase(), unset);
  const { first, columns } = salaryColumns(today, money.hidden);
  const plain = salaryColumns(today, false);
  const noSalary = people.filter((p) => !p.salary).length;

  const top = (
    <>
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name, team or structure" accessibilityLabel="Search people" autoCorrect={false} />
      {noSalary ? (
        <ChipRow>
          <Chip label="Everyone" selected={!unset} onPress={() => setUnset(false)} />
          <Chip label="No salary yet" count={noSalary} selected={unset} onPress={() => setUnset(true)} />
        </ChipRow>
      ) : null}
      {people.length ? (
        <Text variant="label" muted>
          {`${people.length} ${people.length === 1 ? 'person' : 'people'}${noSalary ? ` · ${noSalary} without a salary` : ''}`}
        </Text>
      ) : null}
    </>
  );

  return (
    <Screen scroll={false} header={header} animate={false} contentStyle={styles.bleed}>
      <GridView
        rows={rows}
        rowKey={(p) => p.id}
        first={first}
        columns={columns}
        zoom={zoom}
        onRowPress={setOpen}
        top={top}
        onRefresh={() => q.refetch()}
        empty={
          q.isPending ? (
            <SkeletonList rows={6} tone="surface" />
          ) : q.error ? (
            <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState icon={<Wallet color={moduleTone.pay.fg} strokeWidth={1.8} />} title="Nobody matches" message="Try another search." />
          )
        }
        bottom={<ShareCsvButton fileName={`salaries-${today}`} rows={rows} columns={gridCsvColumns(plain.first, plain.columns)} sensitive what="Everyone’s salary and tax set-up" />}
      />
      <RowSheet row={open} title={open?.name ?? ''} subtitle={open?.department || 'No team'} columns={columns} onClose={() => setOpen(null)}>
        {open && !isSelf(open.id, access.user) ? (
          <Button
            title={open.salary ? 'Revise in Payroll' : 'Set salary in Payroll'}
            variant="accent"
            onPress={() => {
              const id = open.id;
              setOpen(null);
              router.push(`/admin/payroll/salaries/${id}`);
            }}
          />
        ) : open ? (
          <Text variant="caption" muted align="center">
            You can’t change your own salary. Ask another HR admin.
          </Text>
        ) : null}
      </RowSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  bleed: { paddingHorizontal: 0 },
}));
