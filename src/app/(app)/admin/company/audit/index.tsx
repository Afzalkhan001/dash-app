// Activity audit (UserActivityAudit, dash.html:15020): what people did in DASH, newest first, grouped
// by day. Super Admin always; anyone else through a Config grant (tenant.auditAccess) with its own four
// permissions — see the list, find a person, open an activity, share the list.
//   Counts       GET /audit_log/summary (same filters): total, today, people active, and four types
//   Find a person GET /audit_log/user-search (the answer is an array spread into an object — rebuilt by
//                unwrapSpreadArray) → GET /audit_log/user/:id → their card, and the list narrows to them
//   Type chips   AUDIT_TABS; Date pill: Today / Yesterday / 7 days / 30 days / any; Filters: action,
//                department, role, result, words
//   List         GET /audit_log, 30 a page, loads more on scroll (the server's total is an estimate)
//   Detail       a sheet: who, whom, area, action, when, network address, result, and what changed
//   Share        POST /audit_log/export → CSV with the website's 16 columns. The server records the
//                download in the audit itself. Excel, PDF and "Backfill" stay on the website.

import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { CalendarRange, ChevronDown, ChevronUp, History, Search, Share2, SlidersHorizontal, X } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type AuditFilters,
  type AuditRow,
  companyKeys,
  exportAudit,
  useAuditLog,
  useAuditPeopleSearch,
  useAuditPerson,
  useAuditSummary,
  useCompanyDepartments,
} from '@/api/company';
import { useTodayIst } from '@/features/attendance/use-now';
import { auditPermission, canSeeAudit } from '@/features/company/access';
import { AUDIT_ACTIONS, AUDIT_TABS, actionLabel, actionTone, auditChanges, auditPreset, auditTypeLabel, roleLabel } from '@/features/company/format';
import { useCompanyAccess } from '@/features/company/gate';
import { shareCsv } from '@/lib/csv';
import { dateLabel, istDateOf, stampLabel, timeOf } from '@/lib/dates';
import { ROLE_LABEL } from '@/lib/access';
import { plural } from '@/lib/format';
import { palette, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  ErrorState,
  GroupedRow,
  KeyValueList,
  MenuSheet,
  NavHeader,
  PillField,
  PillSelector,
  Row,
  Screen,
  SectionHeader,
  SelectField,
  Sheet,
  SkeletonList,
  StatGrid,
  StatTile,
  SummaryCard,
  SummaryHero,
  Text,
  TextField,
  toast,
  useLayout,
} from '@/ui';

type Preset = 'any' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'any', label: 'Any date' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Pick dates' },
];

type Extra = { action: string; dept: string; role: string; status: string; search: string };
const NO_EXTRA: Extra = { action: '', dept: '', role: '', status: '', search: '' };

type Item = { kind: 'day'; key: string; label: string } | { kind: 'row'; key: string; row: AuditRow; first: boolean; last: boolean };

export default function ActivityAuditScreen() {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { gap } = useLayout();
  const today = useTodayIst();
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canSeeAudit(user, tenant);
  const can = {
    view: auditPermission(user, tenant, 'viewLogs'),
    search: auditPermission(user, tenant, 'searchUsers'),
    detail: auditPermission(user, tenant, 'viewDetail'),
    share: auditPermission(user, tenant, 'downloadReports'),
  };

  const [tab, setTab] = useState('all');
  const [preset, setPreset] = useState<Preset>('any');
  const [range, setRange] = useState({ dateFrom: '', dateTo: '' });
  const [extra, setExtra] = useState<Extra>(NO_EXTRA);
  const [draft, setDraft] = useState<Extra>(NO_EXTRA);
  const [personId, setPersonId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [datesOpen, setDatesOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState({ dateFrom: '', dateTo: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [sharing, setSharing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const activityType = AUDIT_TABS.find((t) => t.key === tab)?.type ?? '';
  const filters: AuditFilters = {
    ...(range.dateFrom ? { dateFrom: range.dateFrom } : null),
    ...(range.dateTo ? { dateTo: range.dateTo } : null),
    ...(activityType ? { activityType } : null),
    ...(extra.action ? { action: extra.action } : null),
    ...(extra.dept ? { dept: extra.dept } : null),
    ...(extra.role ? { role: extra.role } : null),
    ...(extra.status ? { status: extra.status } : null),
    ...(extra.search.trim() ? { search: extra.search.trim() } : null),
    ...(personId ? { userId: personId } : null),
  };
  const on = allowed && can.view;
  const summary = useAuditSummary(filters, on);
  const log = useAuditLog(filters, on);
  const people = useAuditPeopleSearch(q, on && can.search && !personId);
  const person = useAuditPerson(on ? personId : null);
  const depts = useCompanyDepartments(on);

  if (ready && !allowed) return <Redirect href="/" />;

  const rows = (log.data?.pages ?? []).flatMap((p) => p.rows);
  const items: Item[] = [];
  let lastDay = '';
  rows.forEach((r, i) => {
    const day = istDateOf(r.createdAt) || 'undated';
    if (day !== lastDay) {
      items.push({ kind: 'day', key: `d-${day}-${i}`, label: day === 'undated' ? 'No date' : day === today ? 'Today' : dateLabel(day, today) });
      lastDay = day;
    }
    const next = rows[i + 1];
    const nextDay = next ? istDateOf(next.createdAt) || 'undated' : '';
    const prevDay = i > 0 ? istDateOf(rows[i - 1]!.createdAt) || 'undated' : '';
    items.push({ kind: 'row', key: `r-${r.id}-${i}`, row: r, first: prevDay !== day, last: nextDay !== day });
  });

  const extraCount = Object.values(extra).filter((v) => !!String(v).trim()).length;
  const presetLabel = preset === 'custom' && range.dateFrom ? `${dateLabel(range.dateFrom, today)} – ${dateLabel(range.dateTo || range.dateFrom, today)}` : (PRESETS.find((p) => p.key === preset)?.label ?? 'Any date');
  const s = summary.data;
  const deptOptions = [{ value: '', label: 'Any department' }, ...(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))];
  const roleOptions = [{ value: '', label: 'Any role' }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))];
  const actionOptions = [{ value: '', label: 'Any action' }, ...AUDIT_ACTIONS.map((a) => ({ value: a, label: actionLabel(a) }))];
  const statusOptions = [
    { value: '', label: 'Any result' },
    { value: 'success', label: 'Went through' },
    { value: 'failed', label: 'Failed' },
  ];

  const choosePreset = (p: Preset) => {
    if (p === 'custom') {
      setCustomDraft(range);
      setCustomOpen(true);
      return;
    }
    setPreset(p);
    setRange(p === 'any' ? { dateFrom: '', dateTo: '' } : auditPreset(p, today));
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: companyKeys.audit(user?.id ?? '') });
    } finally {
      setRefreshing(false);
    }
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const all = await exportAudit(user?.id ?? '', filters);
      if (!all.length) {
        toast.show('Nothing to share with these filters.', 'info');
        return;
      }
      const val = (v: unknown) => (v && typeof v === 'object' ? JSON.stringify(v) : (v ?? ''));
      await shareCsv(`activity-audit-${today}`, all, [
        { label: 'Date', value: (r) => istDateOf(r.createdAt) },
        { label: 'Time', value: (r) => timeOf(r.createdAt) },
        { label: 'Actor Name', value: (r) => r.actorName },
        { label: 'Actor Role', value: (r) => (r.actorRole ? (ROLE_LABEL[r.actorRole] ?? r.actorRole) : '') },
        { label: 'Affected User', value: (r) => r.affectedUserName },
        { label: 'Employee ID', value: (r) => r.affectedUserEmpId },
        { label: 'Module', value: (r) => r.module },
        { label: 'Action', value: (r) => r.action },
        { label: 'Description', value: (r) => r.description },
        { label: 'Entity Type', value: (r) => r.entityType },
        { label: 'Entity ID', value: (r) => r.entityId },
        { label: 'Previous Value', value: (r) => val(r.previousData) },
        { label: 'New Value', value: (r) => val(r.newData) },
        { label: 'Status', value: (r) => r.status },
        { label: 'IP Address', value: (r) => r.ipAddress },
        { label: 'User Agent', value: (r) => r.userAgent },
      ], 'Share the activity audit');
      toast.show(`Shared ${plural(all.length, 'activity', 'activities')}. The download is recorded in the audit.`, 'success');
      void qc.invalidateQueries({ queryKey: companyKeys.audit(user?.id ?? '') });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The list could not be shared.', 'danger');
    } finally {
      setSharing(false);
    }
  };

  const header = (
    <View style={{ gap, paddingBottom: space.sm }}>
      <SummaryHero
        icon={History}
        module="security"
        label={personId ? 'Their activity' : 'Activity'}
        value={s?.totalActivities ?? 0}
        info={s ? { label: `${s.activitiesToday} today`, value: plural(s.activeUsers, 'person', 'people') + ' active' } : undefined}
        sub={s ? undefined : 'Loading…'}>
        {s ? (
          <Button
            variant="text"
            size="sm"
            title={showMore ? 'Fewer numbers' : 'More numbers'}
            icon={showMore ? <ChevronUp /> : <ChevronDown />}
            onPress={() => setShowMore((v) => !v)}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
      </SummaryHero>
      {s && showMore ? (
        <StatGrid columns={2}>
          <StatTile variant="light" label="Bookings" value={s.bookingsActivity} />
          <StatTile variant="light" label="Service requests" value={s.serviceRequestActivity} />
          <StatTile variant="light" label="Profile changes" value={s.profileChanges} />
          <StatTile variant="light" label="Downloads" value={s.reportDownloads} />
        </StatGrid>
      ) : null}

      {personId ? (
        <Card padded style={{ gap: 12 }}>
          <Row style={{ gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="heading" numberOfLines={2}>
                {person.data?.user.name ?? '…'}
              </Text>
              <Text variant="caption" muted numberOfLines={1}>
                {[roleLabel(person.data?.user.role), person.data?.user.email].filter((v) => v && v !== '—').join(' · ')}
              </Text>
            </View>
            <Button variant="ghost" size="sm" title="Clear" icon={<X />} onPress={() => setPersonId(null)} />
          </Row>
          <KeyValueList
            rows={[
              { key: 'emp', label: 'Employee ID', value: person.data?.user.employeeNumber },
              { key: 'dept', label: 'Department', value: depts.data?.find((d) => d.id === person.data?.user.dept)?.name ?? person.data?.user.dept },
              { key: 'title', label: 'Job title', value: person.data?.user.jobTitle },
              { key: 'total', label: 'Activities about them', value: person.data ? String(person.data.totalActivities) : '' },
            ]}
          />
        </Card>
      ) : can.search ? (
        <View style={{ gap: space.xs }}>
          <PillField icon={Search} placeholder="Find a person: name, email or ID" value={q} onChangeText={setQ} autoCorrect={false} autoCapitalize="none" />
          {q.trim() ? (
            people.isPending ? (
              <SkeletonList rows={2} avatar />
            ) : people.data?.length ? (
              <ActivityList>
                {people.data.slice(0, 6).map((p) => (
                  <ActivityRow
                    key={p.id}
                    person={{ name: p.name }}
                    title={p.name}
                    subtitle={[p.email, roleLabel(p.role)].filter(Boolean).join(' · ')}
                    onPress={() => {
                      setPersonId(p.id);
                      setQ('');
                    }}
                    accessibilityHint="Shows only their activity"
                  />
                ))}
              </ActivityList>
            ) : people.isError ? (
              <Banner tone="danger" message={people.error?.message ?? 'Search failed.'} />
            ) : (
              <Text variant="caption" muted>
                No one matches.
              </Text>
            )
          ) : null}
        </View>
      ) : null}

      <ChipRow>
        {AUDIT_TABS.map((t) => (
          <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </ChipRow>
      <Row style={{ gap: space.xs, flexWrap: 'wrap' }}>
        <PillSelector icon={CalendarRange} label={presetLabel} onPress={() => setDatesOpen(true)} accessibilityLabel={`Dates: ${presetLabel}`} />
        <PillSelector
          icon={SlidersHorizontal}
          label={extraCount ? `Filters · ${extraCount}` : 'Filters'}
          onPress={() => {
            setDraft(extra);
            setFiltersOpen(true);
          }}
        />
        {extraCount || preset !== 'any' || tab !== 'all' ? (
          <Button
            variant="text"
            size="sm"
            title="Clear all"
            onPress={() => {
              setExtra(NO_EXTRA);
              setPreset('any');
              setRange({ dateFrom: '', dateTo: '' });
              setTab('all');
            }}
          />
        ) : null}
      </Row>
    </View>
  );

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'day') return <SectionHeader title={item.label} style={{ paddingTop: space.xs }} />;
    const r = item.row;
    return (
      <GroupedRow tone="surface" hairline first={item.first} last={item.last}>
        <ActivityRow
          person={{ name: r.actorName || '?' }}
          title={r.actorName || 'Someone'}
          subtitle={r.description || actionLabel(r.action)}
          note={r.status === 'failed' ? 'Failed' : timeOf(r.createdAt)}
          status={{ label: actionLabel(r.action), tone: actionTone(r.action) }}
          onPress={can.detail ? () => setDetail(r) : undefined}
          chevron={can.detail}
        />
      </GroupedRow>
    );
  };

  const changes = detail ? auditChanges(detail.previousData, detail.newData) : [];

  return (
    <Screen
      scroll={false}
      header={
        <NavHeader
          title="Activity audit"
          actions={can.share && can.view ? [{ icon: Share2, label: sharing ? 'Sharing…' : 'Share as CSV', onPress: () => void share(), disabled: sharing }] : []}
        />
      }>
      {!ready ? (
        <SkeletonList rows={6} avatar />
      ) : !can.view ? (
        <EmptyState icon={<History color={palette.textMuted} />} title="You can’t see the activity list" message="Ask your Super Admin to give you that in Company settings." />
      ) : (
        <View style={{ flex: 1 }}>
          <FlashList
            data={log.isError && !log.data ? [] : items}
            keyExtractor={(it) => it.key}
            getItemType={(it) => it.kind}
            renderItem={renderItem}
            ListHeaderComponent={header}
            ListEmptyComponent={
              log.isPending ? (
                <SkeletonList rows={6} avatar />
              ) : log.isError ? (
                <ErrorState message={log.error?.message ?? 'The activity could not be loaded.'} onRetry={() => void log.refetch()} />
              ) : (
                <EmptyState title="No activity matches these filters" message="Try another type or a wider date range." />
              )
            }
            ListFooterComponent={log.isFetchingNextPage ? <SkeletonList rows={2} avatar style={{ marginTop: space.sm }} /> : <View style={{ height: space.xl + insets.bottom }} />}
            onEndReached={() => {
              if (log.hasNextPage && !log.isFetchingNextPage) void log.fetchNextPage();
            }}
            onEndReachedThreshold={0.6}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primaryText} colors={[palette.primaryText]} progressBackgroundColor={palette.surface} />}
          />
        </View>
      )}

      <MenuSheet
        visible={datesOpen}
        onClose={() => setDatesOpen(false)}
        title="Show activity from"
        items={PRESETS.map((p) => ({ key: p.key, label: p.label, icon: CalendarRange, hint: p.key === preset ? 'Showing now' : undefined, onPress: () => choosePreset(p.key) }))}
      />

      <Sheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Pick dates"
        footer={
          <Button
            title="Show"
            disabled={!customDraft.dateFrom || (!!customDraft.dateTo && customDraft.dateTo < customDraft.dateFrom)}
            onPress={() => {
              setRange(customDraft);
              setPreset('custom');
              setCustomOpen(false);
            }}
          />
        }>
        <DateField label="From" value={customDraft.dateFrom} onChange={(v) => setCustomDraft((r) => ({ ...r, dateFrom: v }))} maximumDate={today} />
        <DateField label="To" value={customDraft.dateTo} onChange={(v) => setCustomDraft((r) => ({ ...r, dateTo: v }))} maximumDate={today} />
      </Sheet>

      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <Row style={{ gap: space.sm }}>
            <Button variant="ghost" title="Clear" style={{ flex: 1 }} onPress={() => setDraft(NO_EXTRA)} />
            <Button
              title="Show"
              style={{ flex: 1 }}
              onPress={() => {
                setExtra(draft);
                setFiltersOpen(false);
              }}
            />
          </Row>
        }>
        <SelectField label="Action" value={draft.action} options={actionOptions} onChange={(v) => setDraft((d) => ({ ...d, action: v }))} />
        <SelectField label="Department" value={draft.dept} options={deptOptions} onChange={(v) => setDraft((d) => ({ ...d, dept: v }))} />
        <SelectField label="Role" value={draft.role} options={roleOptions} onChange={(v) => setDraft((d) => ({ ...d, role: v }))} />
        <SelectField label="Result" value={draft.status} options={statusOptions} onChange={(v) => setDraft((d) => ({ ...d, status: v }))} />
        <TextField label="Words in the activity" value={draft.search} onChangeText={(v) => setDraft((d) => ({ ...d, search: v }))} placeholder="A name, an ID or a word" autoCorrect={false} />
      </Sheet>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title="Activity" subtitle={detail ? stampLabel(detail.createdAt, today) : undefined}>
        {detail ? (
          <>
            <SummaryCard
              rows={[
                { key: 'who', label: 'Who', value: detail.actorName || '—', hint: [detail.actorRole ? roleLabel(detail.actorRole) : '', detail.actorEmail].filter(Boolean).join(' · ') || null },
                ...(detail.affectedUserName ? [{ key: 'whom', label: 'About', value: detail.affectedUserName, hint: detail.affectedUserEmpId ? `Employee ID ${detail.affectedUserEmpId}` : null }] : []),
                { key: 'what', label: 'What happened', value: detail.description || '—' },
                { key: 'action', label: 'Action', value: actionLabel(detail.action), status: actionTone(detail.action) },
                { key: 'area', label: 'Area', value: [detail.module, auditTypeLabel(detail.activityType)].filter((v) => v && v !== '—').join(' · ') || '—' },
                ...(detail.entityType ? [{ key: 'record', label: 'Record', value: `${detail.entityType}${detail.entityId ? ` #${detail.entityId}` : ''}` }] : []),
                { key: 'when', label: 'When', value: stampLabel(detail.createdAt, today) },
                { key: 'ip', label: 'Network address', value: detail.ipAddress || '—' },
                { key: 'result', label: 'Result', value: detail.status === 'failed' ? 'Failed' : 'Went through', status: detail.status === 'failed' ? 'failed' : 'done' },
              ]}
            />
            {changes.length ? (
              <View style={{ gap: space.xs }}>
                <SectionHeader title="What changed" />
                <SummaryCard rows={changes.map((c) => ({ key: c.key, label: c.label, value: c.after, hint: `Before: ${c.before}` }))} />
              </View>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
