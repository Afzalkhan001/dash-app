// Leave balances table — people × leave types, the website's Leave setup "Company balances" grid
// (dash.html:4945). GET /hr/leave/balances?year= (hr_leave.js:230; heavy, kept in memory only).
// Each cell is the days left, with used and waiting under it. Read-only: adjusting a balance or
// carrying leave forward stays on HR setup › Leave balances (features/hrtime), which a row links to.

import { useRouter } from 'expo-router';
import { Search, Table2 } from 'lucide-react-native';
import { useState } from 'react';

import { useCompanyBalances } from '@/api/hrtime';
import { useLeaveSettings } from '@/api/leave';
import { useTodayIst } from '@/features/attendance/use-now';
import { GridView } from '@/features/grids/data-grid';
import { GridGateFallback, gridCsvColumns, RowSheet, ShareCsvButton, useGridGate, useZoom } from '@/features/grids/grid-ui';
import { balanceColumns, filterBalances } from '@/features/grids/model';
import { leaveYearOf } from '@/features/leave/rules';
import type { BalancePerson } from '@/api/hrtime';
import { themedStyles } from '@/theme/themed';
import { moduleTone } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, NavHeader, PillField, Screen, Segmented, SkeletonList, Text } from '@/ui';

export default function LeaveBalancesGrid() {
  const router = useRouter();
  const today = useTodayIst();
  const { allowed, pending } = useGridGate('balances');
  const { zoom, actions } = useZoom(1);
  const rules = useLeaveSettings(allowed);
  const startMonth = rules.data?.settings?.leaveYearStartMonth ?? 1;
  const [picked, setPicked] = useState<number | null>(null);
  const q = useCompanyBalances(picked, allowed);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<BalancePerson | null>(null);
  const header = <NavHeader title="Leave balances" subtitle="Days left by leave type" actions={allowed ? actions : undefined} />;
  if (!allowed) return <GridGateFallback pending={pending} header={header} />;

  const current = rules.data?.settings ? leaveYearOf(today, startMonth) : (q.data?.year ?? Number(today.slice(0, 4)));
  const year = picked ?? q.data?.year ?? current;
  const yearLabel = (y: number) => (startMonth === 1 ? String(y) : `${y}–${String(y + 1).slice(2)}`);
  const { first, columns, types } = balanceColumns(q.data);
  const people = Array.isArray(q.data?.people) ? q.data.people : [];
  const rows = filterBalances(people, query.trim().toLowerCase());

  const top = (
    <>
      <Segmented options={[current - 1, current, current + 1].map((y) => ({ key: String(y), label: yearLabel(y) }))} value={String(year)} onChange={(k) => setPicked(Number(k))} />
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or team" accessibilityLabel="Search people" autoCorrect={false} />
      {people.length ? (
        <Text variant="label" muted>
          {`${rows.length === people.length ? people.length : `${rows.length} of ${people.length}`} people · ${types.length} leave types · ${yearLabel(year)}. Each cell: days left, then used and waiting.`}
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
        lines={2}
        onRowPress={setOpen}
        top={top}
        onRefresh={() => Promise.all([q.refetch(), rules.refetch()])}
        empty={
          q.isPending ? (
            <SkeletonList rows={6} avatar tone="surface" />
          ) : q.error ? (
            <ErrorState message={q.error instanceof Error ? q.error.message : 'Couldn’t load the balances.'} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState icon={<Table2 color={moduleTone.leave.fg} strokeWidth={1.8} />} title={query ? 'Nobody matches' : 'No balances yet'} message={query ? 'Try another name.' : 'Add leave types in HR setup first.'} />
          )
        }
        bottom={<ShareCsvButton fileName={`leave-balances-${year}`} rows={rows} columns={gridCsvColumns(first, columns)} />}
      />
      <RowSheet row={open} title={open?.name ?? ''} subtitle={[open?.department || 'No team', yearLabel(year)].join(' · ')} columns={columns} onClose={() => setOpen(null)}>
        <Button
          title="Add or take away days"
          variant="accent"
          onPress={() => {
            setOpen(null);
            router.push('/admin/hr-time/balances');
          }}
        />
      </RowSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  bleed: { paddingHorizontal: 0 },
}));
