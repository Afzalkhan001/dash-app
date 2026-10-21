// Payroll register — one month's run as the website's register table (PayrollRunView lines,
// dash.html:5136; the same columns as register.csv, hr_payroll.js:512): a column per earning,
// expense paid back, deduction and company contribution code in the run, then totals.
//
//   GET /hr/payroll/runs        the months (payrollAdmin 'view payroll')
//   GET /hr/payroll/runs/:id    every line of one run (up to 20,000; kept in memory only)
//
// Everyone's pay is on this screen: the header's eye masks every amount (the Pay screens' own choice),
// queries are never persisted, and the CSV asks first. Read-only: editing a line, recomputing and
// locking stay on Payroll › the run (features/payroll), which a row links to. Nobody is messaged.

import { useRouter } from 'expo-router';
import { FileSpreadsheet, Search } from 'lucide-react-native';
import { useState } from 'react';

import { type PayrollItem, usePayrollRun, usePayrollRuns } from '@/api/payroll';
import { GridView } from '@/features/grids/data-grid';
import { GridGateFallback, gridCsvColumns, RowSheet, ShareCsvButton, useGridGate, useZoom } from '@/features/grids/grid-ui';
import { filterItems, registerColumns, rupees } from '@/features/grids/model';
import { monthName, runStatus, usePayView } from '@/features/payroll/ui';
import { themedStyles } from '@/theme/themed';
import { moduleTone } from '@/theme/tokens';
import { Banner, Button, Chip, ChipRow, EmptyState, ErrorState, NavHeader, PillField, Screen, SkeletonList, Text } from '@/ui';

export default function PayrollRegister() {
  const router = useRouter();
  const { allowed, pending } = useGridGate('payroll');
  const { zoom, actions } = useZoom(0);
  const { money, eye } = usePayView();
  const runs = usePayrollRuns(allowed);
  const list = Array.isArray(runs.data) ? runs.data : [];
  const [picked, setPicked] = useState<string | null>(null);
  const runId = picked ?? list[0]?.id;
  const run = usePayrollRun(runId, allowed && !!runId);
  const [query, setQuery] = useState('');
  const [warnOnly, setWarnOnly] = useState(false);
  const [open, setOpen] = useState<PayrollItem | null>(null);
  const header = <NavHeader title="Payroll register" subtitle={run.data ? `${monthName(run.data.run.month)} · ${runStatus(run.data.run).label}` : undefined} actions={allowed ? [eye, ...actions] : undefined} />;
  if (!allowed) return <GridGateFallback pending={pending} header={header} />;

  const items = run.data?.items ?? [];
  const rows = filterItems(items, query.trim().toLowerCase(), warnOnly);
  const { first, columns, totals } = registerColumns(rows, money.hidden);
  const plain = registerColumns(rows, false);
  const withWarnings = items.filter((i) => Array.isArray(i.warnings) && i.warnings.length).length;
  const meta = run.data?.run;

  const top = (
    <>
      {runs.error && !runs.data ? <Banner tone="danger" title="Couldn’t load payroll runs" message={runs.error.message} action={{ label: 'Retry', onPress: () => void runs.refetch() }} /> : null}
      {list.length ? (
        <ChipRow>
          {list.map((r) => (
            <Chip key={r.id} label={`${monthName(r.month, true)}${r.status === 'draft' ? ' · draft' : ''}`} selected={r.id === runId} onPress={() => setPicked(r.id)} />
          ))}
        </ChipRow>
      ) : null}
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name, team or structure" accessibilityLabel="Search lines" autoCorrect={false} />
      {withWarnings ? (
        <ChipRow>
          <Chip label="Everyone" selected={!warnOnly} onPress={() => setWarnOnly(false)} />
          <Chip label="With warnings" count={withWarnings} selected={warnOnly} onPress={() => setWarnOnly(true)} />
        </ChipRow>
      ) : null}
      {meta ? (
        <Text variant="label" muted>
          {`${items.length} ${items.length === 1 ? 'person' : 'people'} · ${meta.status === 'draft' ? 'Draft: figures can still change' : `Locked${meta.locked_by_name ? ` by ${meta.locked_by_name}` : ''}`}`}
        </Text>
      ) : null}
    </>
  );

  return (
    <Screen scroll={false} header={header} animate={false} contentStyle={styles.bleed}>
      <GridView
        rows={rows}
        rowKey={(i) => i.id}
        first={first}
        columns={columns}
        zoom={zoom}
        lines={1}
        totals={rows.length > 1 ? { first: 'Total', cells: totals } : null}
        onRowPress={setOpen}
        rowLabel={(i) => `${i.employee_name}${money.hidden ? '' : `, net pay ${rupees(i.net)}`}`}
        top={top}
        onRefresh={() => Promise.all([runs.refetch(), run.refetch()])}
        empty={
          runs.isPending || (runId && run.isPending) ? (
            <SkeletonList rows={6} tone="surface" />
          ) : run.error ? (
            <ErrorState message={run.error.message} onRetry={() => void run.refetch()} />
          ) : (
            <EmptyState
              icon={<FileSpreadsheet color={moduleTone.pay.fg} strokeWidth={1.8} />}
              title={!list.length ? 'No payroll runs yet' : query || warnOnly ? 'Nothing matches' : 'No lines in this run'}
              message={!list.length ? 'Run a month in Payroll first.' : query || warnOnly ? 'Try another search.' : 'Recompute the run in Payroll.'}
            />
          )
        }
        bottom={
          meta ? (
            <>
              <ShareCsvButton
                fileName={`payroll-register-${meta.month}`}
                rows={rows}
                columns={gridCsvColumns(plain.first, plain.columns)}
                sensitive
                what={`Everyone’s pay for ${monthName(meta.month)}`}
              />
              <Button title="Open this run in Payroll" variant="text" onPress={() => router.push(`/admin/payroll/runs/${meta.id}`)} />
            </>
          ) : null
        }
      />
      <RowSheet row={open} title={open?.employee_name ?? ''} subtitle={[open?.department, meta ? monthName(meta.month) : null].filter(Boolean).join(' · ')} columns={columns} onClose={() => setOpen(null)}>
        {open && Array.isArray(open.warnings) && open.warnings.length ? <Banner tone="warning" title="Warnings" message={open.warnings.join('\n')} /> : null}
        {meta ? (
          <Button
            title={meta.status === 'draft' ? 'Open this line in Payroll' : 'Open this payslip line'}
            variant="accent"
            onPress={() => {
              const itemId = open?.id;
              setOpen(null);
              router.push(itemId ? `/admin/payroll/runs/${meta.id}/${itemId}` : `/admin/payroll/runs/${meta.id}`);
            }}
          />
        ) : null}
      </RowSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  bleed: { paddingHorizontal: 0 },
}));
