// Service desk (web: ServiceDesk, dash.html:21036–21410) — the company's IT help, equipment, office
// requests and complaints, as this person's role sees them (features/servicedesk/access baseItems):
// IT Admin tickets + equipment, Admin / App Manager equipment, HR Behaviour & work complaints, Super
// Admin everything, CEO/COO read-only.
//
// NavHeader (filters; "Raise for someone" for the IT Admin) → SummaryHero (open now, what waits on me as
// a chip that narrows the list, in progress · resolved this month) → the role's tabs → search →
// active filters as chips → day-grouped ActivityLists, newest first, 30 at a time. A row opens the
// request, where the actions are. The filter sheet holds the web's Category, Department, Status and
// Date. Export stays on the website.

import { Redirect, useRouter } from 'expo-router';
import { Headset, ListFilter, Search, SearchX, UserPlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { DeskTicket } from '@/api/servicedesk';
import { useTodayIst } from '@/features/attendance/use-now';
import { groupByDay } from '@/features/inbox/format';
import { canRaiseForSomeone, type DeskTab, deskTabs, inTab, needsMe, rowAction } from '@/features/servicedesk/access';
import { categoryLabelFor, dayOf, deptOf, matchesSearch, refOf, statusWords, uniqueOptions, whenOf } from '@/features/servicedesk/format';
import { DeskRow } from '@/features/servicedesk/desk-row';
import { useDesk } from '@/features/servicedesk/use-desk';
import { dateLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  Button,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  ErrorState,
  IconButton,
  NavHeader,
  Screen,
  Segmented,
  SelectField,
  Sheet,
  Skeleton,
  SkeletonList,
  SummaryHero,
  TextField,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const PAGE = 30;
const OPEN = ['open', 'pending_approval', 'in_progress'];

type Filters = { category: string; dept: string; status: string; date: string };
const NO_FILTERS: Filters = { category: '', dept: '', status: '', date: '' };

/** dash.html:21187–21194: the four filters, exactly as the website applies them. */
function inFilters(t: DeskTicket, f: Filters) {
  if (f.category && categoryLabelFor(t).toLowerCase() !== f.category.toLowerCase()) return false;
  if (f.dept && deptOf(t) !== f.dept) return false;
  if (f.status && t.status !== f.status) return false;
  if (f.date && dayOf(t) !== f.date) return false;
  return true;
}

const ANY = { value: '', label: 'Any' };

export default function ServiceDeskScreen() {
  const router = useRouter();
  const access = useAccess();
  const user = access.user;
  const allowed = !!user && access.web('servicedesk');
  const desk = useDesk({ enabled: allowed });
  const today = useTodayIst();
  const [tab, setTab] = useState<DeskTab>('all');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  if (user && !allowed) return <Redirect href="/" />;

  const role = desk.role;
  const items = desk.items;
  const tabs = deskTabs(desk.slice);
  const raise = canRaiseForSomeone(role, access.web('tasks'));
  const waiting = items.filter((t) => needsMe(t, role, desk.approver));
  // The chip that turns this on disappears once nothing waits, so it can't stay on by itself.
  const onlyMine = mineOnly && waiting.length > 0;
  const openNow = items.filter((t) => OPEN.includes(String(t.status))).length;
  const inProgress = items.filter((t) => t.status === 'in_progress').length;
  const month = today.slice(0, 7);
  const resolvedMonth = items.filter((t) => t.status === 'resolved' && String(t.resolvedAt || dayOf(t)).slice(0, 7) === month).length;

  const visible = items.filter(
    (t) => inTab(t, desk.slice, tab) && matchesSearch(t, q) && inFilters(t, filters) && (!onlyMine || needsMe(t, role, desk.approver)),
  );
  const groups = groupByDay(visible.slice(0, shown), whenOf, today);
  const filterCount = Object.values(filters).filter(Boolean).length;

  // The filter choices come from what this person can see.
  const categoryOptions = [ANY, ...uniqueOptions(items.map(categoryLabelFor)).map((c) => ({ value: c, label: c }))];
  const deptOptions = [ANY, ...[...new Set(items.map(deptOf).filter(Boolean))].sort().map((d) => ({ value: d, label: d }))];
  const statusOptions = [ANY, ...[...new Set(items.map((t) => String(t.status || '')).filter(Boolean))].map((st) => ({ value: st, label: statusWords(st) }))];

  const reset = () => setShown(PAGE);
  const chips: { key: keyof Filters; label: string }[] = [
    ...(filters.category ? [{ key: 'category' as const, label: filters.category }] : []),
    ...(filters.dept ? [{ key: 'dept' as const, label: filters.dept }] : []),
    ...(filters.status ? [{ key: 'status' as const, label: statusWords(filters.status) }] : []),
    ...(filters.date ? [{ key: 'date' as const, label: dateLabel(filters.date, today) }] : []),
  ];

  const nextFor = (t: DeskTicket) => {
    const a = rowAction(t, role, desk.approver);
    if (a === 'accept') return 'Waiting to be assigned';
    if (a === 'approve') return 'Waiting for your approval';
    if (a === 'awaiting') return desk.approverName ? `Waiting for ${desk.approverName}` : 'Waiting for Admin approval';
    if (t.assignedTo && t.status === 'in_progress') return `With ${t.assignedTo}`;
    return null;
  };

  const headerActions = [
    {
      key: 'filter',
      icon: ListFilter,
      label: filterCount ? `Filters, ${filterCount} on` : 'Filters',
      dot: filterCount > 0,
      onPress: () => {
        setDraft(filters);
        setFilterOpen(true);
      },
    },
    ...(raise ? [{ key: 'raise', icon: UserPlus, label: 'Raise for someone', onPress: () => router.push('/admin/service-desk/raise') }] : []),
  ];

  const filtered = !!q.trim() || filterCount > 0 || onlyMine || tab !== 'all';

  return (
    <Screen header={<NavHeader title="Service desk" actions={headerActions} />} onRefresh={() => desk.refetch()}>
      {desk.tickets.data ? (
        <SummaryHero
          icon={Headset}
          module="support"
          label="Open now"
          value={openNow}
          info={
            waiting.length
              ? {
                  label: onlyMine ? 'Showing what waits on you' : 'Waiting on you',
                  value: onlyMine ? 'Show all' : String(waiting.length),
                  onPress: () => {
                    setMineOnly(!onlyMine);
                    reset();
                  },
                  accessibilityLabel: onlyMine ? 'Show every request' : `${waiting.length} waiting on you. Show only these`,
                }
              : undefined
          }
          sub={`${inProgress} in progress · ${resolvedMonth} resolved this month`}
        />
      ) : (
        <Skeleton height={176} radius={radius.xxl} />
      )}

      {tabs.length > 1 ? (
        <Segmented
          options={tabs.map((x) => ({ key: x.key, label: x.label }))}
          value={tab}
          onChange={(k) => {
            setTab(k);
            reset();
          }}
        />
      ) : null}

      <TextField
        value={q}
        onChangeText={(v) => {
          setQ(v);
          reset();
        }}
        placeholder="Search reference, subject, person or team"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search requests"
        left={<Search size={18} color={palette.textMuted} />}
        right={
          q ? (
            <IconButton accessibilityLabel="Clear search" size={32} tone="surface" onPress={() => setQ('')}>
              <X size={16} color={palette.textMuted} />
            </IconButton>
          ) : undefined
        }
      />

      {chips.length ? (
        <ChipRow>
          {chips.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected
              icon={<X />}
              onPress={() => {
                setFilters((f) => ({ ...f, [c.key]: '' }));
                reset();
              }}
            />
          ))}
          <Chip
            label="Clear all"
            onPress={() => {
              setFilters(NO_FILTERS);
              reset();
            }}
          />
        </ChipRow>
      ) : null}

      <View style={styles.list}>
        {groups.length ? (
          groups.map((g) => (
            <ActivityList key={g.key} title={g.label}>
              {g.items.map((t) => (
                <DeskRow
                  key={t.id}
                  t={t}
                  note={nextFor(t) ?? `${refOf(t)} · ${categoryLabelFor(t)}`}
                  onPress={() => router.push(`/admin/service-desk/${encodeURIComponent(t.id)}`)}
                />
              ))}
            </ActivityList>
          ))
        ) : (!desk.tickets.data && !desk.tickets.isError) || desk.approverLoading ? (
          <SkeletonList rows={6} avatar />
        ) : desk.tickets.isError && !desk.tickets.data ? (
          <ErrorState message={desk.tickets.error?.message ?? ''} onRetry={() => void desk.refetch()} />
        ) : filtered ? (
          <EmptyState
            icon={<SearchX color={palette.textMuted} />}
            title="Nothing matches"
            message="Try another search or clear the filters."
            action={
              <Button
                title="Show everything"
                variant="accent"
                size="md"
                onPress={() => {
                  setQ('');
                  setFilters(NO_FILTERS);
                  setMineOnly(false);
                  setTab('all');
                }}
              />
            }
          />
        ) : (
          <EmptyState icon={<Headset color={palette.textMuted} />} title="No requests yet" message="New IT help and equipment requests show up here." />
        )}
        {visible.length > shown ? <Button title={`Show ${Math.min(PAGE, visible.length - shown)} more`} variant="ghost" size="md" onPress={() => setShown((n) => n + PAGE)} /> : null}
      </View>

      <Sheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filters"
        subtitle={`${visible.length} ${visible.length === 1 ? 'request' : 'requests'} shown now`}
        footer={
          <View style={styles.sheetButtons}>
            <Button
              title="Show requests"
              onPress={() => {
                setFilters(draft);
                reset();
                setFilterOpen(false);
              }}
            />
            <Button title="Clear filters" variant="text" size="md" onPress={() => setDraft(NO_FILTERS)} />
          </View>
        }>
        <View style={styles.fields}>
          <SelectField label="Category" value={draft.category} options={categoryOptions} onChange={(v) => setDraft((d) => ({ ...d, category: v }))} />
          <SelectField label="Department" value={draft.dept} options={deptOptions} onChange={(v) => setDraft((d) => ({ ...d, dept: v }))} />
          <SelectField label="Status" value={draft.status} options={statusOptions} onChange={(v) => setDraft((d) => ({ ...d, status: v }))} />
          <DateField label="Raised on" value={draft.date || null} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} placeholder="Any day" maximumDate={today} />
          {draft.date ? <Button title="Any day" variant="text" size="sm" onPress={() => setDraft((d) => ({ ...d, date: '' }))} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { gap: space.lg },
  fields: { gap: space.md },
  sheetButtons: { gap: space.xs },
}));
