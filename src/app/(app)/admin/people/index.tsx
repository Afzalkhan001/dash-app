// Employees — the website's Employee Roster (EmpRoster, dash.html:5491) for the phone. Who: navForRaw
// `roster` (super_admin, ceo, coo, admin, hr, it_admin, app_manager + the company switch); anyone else
// is sent home.
//   NavHeader "Employees" with Departments (for the roles that have them);
//   a search PillField (name, email, employee no.) and a department PillSelector;
//   a light SummaryHero (everyone in the search scope, "N not signed up yet"), then status Chips that
//   double as the filter (All · Active · Not signed up · Resigned — the web's four KPI cards);
//   everyone as RosterRows in one card (FlashList), each opening /admin/people/<key>;
//   a footer Banner: bulk upload / update and the roster download stay on the website (docs/port/
//   hr-people.md §4.2).
// GET /users + GET /whitelist (api/people useRoster): slimmed, never persisted.

import { FlashList } from '@shopify/flash-list';
import { Redirect, useRouter } from 'expo-router';
import { Building2, Check, Search, UserPlus, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdminDepartments, useRoster } from '@/api/people';
import { canSeeDepartments, canSeeRoster } from '@/features/people/access';
import { byStatus, rosterCounts, scopeRoster, type StatusFilter } from '@/features/people/roster';
import { RosterRow } from '@/features/people/roster-ui';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  GroupedRow,
  hitSlopFor,
  ListCard,
  ListRow,
  NavHeader,
  PillField,
  PillSelector,
  Screen,
  Sheet,
  SkeletonList,
  SummaryHero,
} from '@/ui';

function DeptSheet({
  visible,
  onClose,
  options,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const pick = (id: string) => {
    onChange(id);
    onClose();
  };
  const tick = <Check size={20} color={palette.primaryText} strokeWidth={2} />;
  return (
    <Sheet visible={visible} onClose={onClose} title="Show a department">
      <ListCard>
        <ListRow title="All departments" right={!value ? tick : undefined} onPress={() => pick('')} accessibilityHint={!value ? 'Selected' : undefined} />
        {options.map((d) => (
          <ListRow
            key={d.id}
            title={d.name}
            numberOfLines={2}
            right={value === d.id ? tick : undefined}
            onPress={() => pick(d.id)}
            accessibilityHint={value === d.id ? 'Selected' : undefined}
          />
        ))}
      </ListCard>
    </Sheet>
  );
}

export default function RosterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const access = useAccess();
  const allowed = canSeeRoster(access.user, access.tenant);
  const roster = useRoster(allowed);
  const depts = useAdminDepartments(allowed);
  const deptList = Array.isArray(depts.data) ? depts.data : undefined;
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [deptOpen, setDeptOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!allowed) return <Redirect href="/" />;

  const rows = Array.isArray(roster.data?.rows) ? roster.data.rows : [];
  const scope = scopeRoster(rows, q, dept, deptList);
  const counts = rosterCounts(scope);
  const list = byStatus(scope, status);
  const filtering = !!q.trim() || !!dept || !!status;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([roster.refetch(), depts.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  const clear = () => {
    setQ('');
    setDept('');
    setStatus('');
  };

  const deptName = dept ? deptList?.find((d) => d.id === dept)?.name || 'Department' : 'All departments';
  const actions = [
    ...(canSeeDepartments(access.user, access.tenant)
      ? [{ key: 'depts', icon: Building2, label: 'Departments', onPress: () => router.push('/admin/people/departments') }]
      : []),
  ];

  const chips: { key: StatusFilter; label: string; count: number }[] = [
    { key: '', label: 'All', count: counts.total },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'invited', label: 'Not signed up', count: counts.invited },
    { key: 'resigned', label: 'Resigned', count: counts.resigned },
  ];

  const head = (
    <View style={styles.head}>
      <SummaryHero
        icon={Users}
        module="people"
        label={dept || q.trim() ? 'In this search' : 'On the roster'}
        value={counts.total}
        unit={counts.total === 1 ? 'person' : 'people'}
        sub={counts.invited ? `${counts.invited} not signed up yet` : 'Everyone has signed up'}
        action={{ title: 'Add employee', icon: <UserPlus />, onPress: () => router.push('/admin/people/edit') }}
      />
      <ChipRow>
        {chips.map((c) => (
          <Chip key={c.key || 'all'} label={c.label} count={c.count} selected={status === c.key} onPress={() => setStatus(c.key)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <>
      <Screen scroll={false} header={<NavHeader title="Employees" actions={actions} />}>
        <View style={styles.tools}>
          <PillField
            icon={Search}
            value={q}
            onChangeText={setQ}
            placeholder="Name, email or employee no."
            accessibilityLabel="Search the roster"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            trailing={
              q ? (
                <Pressable onPress={() => setQ('')} hitSlop={hitSlopFor(32)} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear search">
                  <X size={18} color={palette.textMuted} />
                </Pressable>
              ) : null
            }
          />
          {deptList && deptList.length > 1 ? (
            <View style={styles.filters}>
              <PillSelector icon={Building2} label={deptName} onPress={() => setDeptOpen(true)} accessibilityLabel={`Department: ${deptName}`} accessibilityHint="Choose a department" />
              {dept ? <Button title="All departments" variant="text" size="sm" onPress={() => setDept('')} /> : null}
            </View>
          ) : null}
        </View>

        {roster.isPending ? (
          <SkeletonList rows={7} avatar tone="surface" />
        ) : roster.isError && !roster.data ? (
          <ErrorState message={roster.error?.message ?? 'The roster could not be loaded.'} onRetry={() => void roster.refetch()} />
        ) : (
          <View style={styles.fill}>
            <FlashList
              data={list}
              keyExtractor={(r) => r.key}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: space.xl + insets.bottom }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={palette.primaryText}
                  colors={[palette.primaryText]}
                  progressBackgroundColor={palette.surface}
                />
              }
              ListHeaderComponent={head}
              ListEmptyComponent={
                rows.length ? (
                  <EmptyState
                    icon={<Search color={palette.textMuted} strokeWidth={1.8} />}
                    title="No one matches"
                    message={filtering ? 'Try another search, or clear the filters.' : undefined}
                    action={<Button title="Show everyone" variant="accent" size="md" onPress={clear} />}
                  />
                ) : (
                  <EmptyState icon={<Users color={palette.textMuted} strokeWidth={1.8} />} title="No one on the roster yet" message="Add the first employee to invite them to DASH." />
                )
              }
              ListFooterComponent={
                <Banner
                  style={styles.footer}
                  tone="info"
                  title="Spreadsheets"
                  message="Bulk upload, bulk update and the roster download are under Import & export."
                  action={{ label: 'Open', onPress: () => router.push('/admin/import') }}
                />
              }
              renderItem={({ item, index }) => (
                <GroupedRow tone="surface" hairline first={index === 0} last={index === list.length - 1}>
                  <RosterRow row={item} depts={deptList} onPress={() => router.push(`/admin/people/${encodeURIComponent(item.key)}`)} />
                </GroupedRow>
              )}
            />
          </View>
        )}
      </Screen>
      <DeptSheet visible={deptOpen} onClose={() => setDeptOpen(false)} options={deptList ?? []} value={dept} onChange={setDept} />
    </>
  );
}

const styles = themedStyles(() => ({
  fill: { flex: 1 },
  tools: { gap: space.sm, paddingBottom: space.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  head: { gap: space.md, paddingBottom: space.md },
  clear: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  footer: { marginTop: space.md },
}));
