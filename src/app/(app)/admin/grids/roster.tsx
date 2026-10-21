// Employee details — the website's Employee Roster table (dash.html:5871 EmpRoster) with every column
// but the photo: employee number, work email, gender, mobile, location, team, job title, reporting
// manager, joining date, birthday, blood group, status and role. GET /users + GET /whitelist (api/people
// useRoster; slimmed, never persisted, no bank or photo). Gate: the roster page (people canSeeRoster).
// Read-only: a row opens the person in People, where edits live. Nobody is messaged.

import { useRouter } from 'expo-router';
import { Contact, Search } from 'lucide-react-native';
import { useState } from 'react';

import { type RosterRecord, useDepartments, useRoster } from '@/api/people';
import { useTodayIst } from '@/features/attendance/use-now';
import { GridView } from '@/features/grids/data-grid';
import { afterSheet, GridGateFallback, gridCsvColumns, RowSheet, ShareCsvButton, useGridGate, useZoom } from '@/features/grids/grid-ui';
import { deptOf, filterRoster, rosterColumns, type RosterFilter } from '@/features/grids/model';
import { themedStyles } from '@/theme/themed';
import { moduleTone } from '@/theme/tokens';
import { Button, Chip, ChipRow, EmptyState, ErrorState, NavHeader, PillField, Screen, SkeletonList, Text } from '@/ui';

export default function RosterGrid() {
  const router = useRouter();
  const today = useTodayIst();
  const { allowed, pending } = useGridGate('roster');
  const { zoom, actions } = useZoom(1);
  const roster = useRoster(allowed);
  const depts = useDepartments(allowed);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('active');
  const [open, setOpen] = useState<RosterRecord | null>(null);
  const header = <NavHeader title="Employee details" actions={allowed ? actions : undefined} />;
  if (!allowed) return <GridGateFallback pending={pending} header={header} />;

  const all = roster.data?.rows ?? [];
  const departments = depts.data;
  const rows = filterRoster(all, query.trim().toLowerCase(), filter, departments);
  const { first, columns } = rosterColumns(today, departments);
  const count = (f: RosterFilter) => filterRoster(all, '', f, departments).length;

  const top = (
    <>
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or email" accessibilityLabel="Search employees" autoCorrect={false} />
      <ChipRow>
        <Chip label="Active" count={count('active')} selected={filter === 'active'} onPress={() => setFilter('active')} />
        <Chip label="Not signed up" count={count('invited')} selected={filter === 'invited'} onPress={() => setFilter('invited')} />
        <Chip label="Resigned" count={count('resigned')} selected={filter === 'resigned'} onPress={() => setFilter('resigned')} />
        <Chip label="Everyone" count={all.length} selected={filter === 'all'} onPress={() => setFilter('all')} />
      </ChipRow>
      {all.length ? (
        <Text variant="label" muted>
          {`${rows.length} shown · ${columns.length + 1} columns`}
        </Text>
      ) : null}
    </>
  );

  return (
    <Screen scroll={false} header={header} animate={false} contentStyle={styles.bleed}>
      <GridView
        rows={rows}
        rowKey={(r) => r.key}
        first={first}
        columns={columns}
        zoom={zoom}
        onRowPress={setOpen}
        rowLabel={(r) => [r.name, r.jobTitle, deptOf(r.dept, departments)].filter(Boolean).join(', ')}
        top={top}
        onRefresh={() => Promise.all([roster.refetch(), depts.refetch()])}
        empty={
          roster.isPending ? (
            <SkeletonList rows={6} avatar tone="surface" />
          ) : roster.error ? (
            <ErrorState message={roster.error.message} onRetry={() => void roster.refetch()} />
          ) : (
            <EmptyState icon={<Contact color={moduleTone.people.fg} strokeWidth={1.8} />} title="Nobody matches" message="Try another search or filter." />
          )
        }
        bottom={<ShareCsvButton fileName={`employees-${today}`} rows={rows} columns={gridCsvColumns(first, columns)} sensitive what="Names, contact details and birthdays" />}
      />
      <RowSheet row={open} title={open?.name ?? ''} subtitle={open?.jobTitle || undefined} columns={columns} onClose={() => setOpen(null)}>
        <Button
          title="Open in People"
          variant="accent"
          onPress={() => {
            const key = open?.key;
            setOpen(null);
            if (key) afterSheet(() => router.push(`/admin/people/${encodeURIComponent(key)}`));
          }}
        />
      </RowSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  bleed: { paddingHorizontal: 0 },
}));
