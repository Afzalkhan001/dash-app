// Device monitoring (web Tm360Hub, dash.html:10902) for the TM360 roles: IT Admin, Super Admin, CEO,
// COO and Master Admin see everyone and may link and pair; a manager or admin sees only the people
// whose reporting manager they are, read-only (the server decides: tm360.js visibilityFor).
//
// Same as the website: the live counts load separately from the roster (a TM360 without live status
// costs the counts, not the page) and refresh every 15 s while this screen is open; the default filter
// is "Linked in TM360" with a count on every option; a search the filter hides says so. "Link to TM360"
// creates an account in another system, so it is swiped. Pairing and unpairing are on the person's
// screen. Excel exports stay on the website (docs/port/PLAN.md §4). Screenshots are never shown.

import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { Activity, Check, Gauge, Link2, ListFilter, MonitorOff, MoonStar, Search, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { insightsKeys, linkToTm360, type Tm360Employee, useTm360Live, useTm360Roster } from '@/api/insights';
import { useWorkDepts } from '@/api/work';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeDevices, isTm360Admin } from '@/features/insights/access';
import { lastSeenOf, liveState, type RosterFilter, rosterMatches, rosterSearch, tmDept, tmSeen } from '@/features/insights/format';
import { InsightsGate, useInsightsAccess } from '@/features/insights/gate';
import { palette, radius, space } from '@/theme/tokens';
import {
  Avatar,
  Banner,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  NavHeader,
  Numeral,
  PillField,
  PillSelector,
  Screen,
  Sheet,
  Skeleton,
  SkeletonList,
  StatGrid,
  StatTile,
  StatusPill,
  SummaryCard,
  Text,
  toast,
} from '@/ui';

const PAGE = 150;

export default function DevicesRoute() {
  return (
    <InsightsGate title="Device monitoring" allow={canSeeDevices}>
      <DevicesScreen />
    </InsightsGate>
  );
}

function DevicesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { access } = useInsightsAccess();
  const user = access.user;
  const focused = useIsFocused();
  const today = useTodayIst();
  const roster = useTm360Roster(true);
  const live = useTm360Live(true, focused);
  const depts = useWorkDepts(true);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('linked');
  const [filterOpen, setFilterOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<Tm360Employee | null>(null);
  const [linking, setLinking] = useState(false);

  const d = roster.data;
  const canPair = d ? d.canPair : isTm360Admin(user);
  const liveData = live.data;
  const status = liveData?.status;
  const needle = q.trim().toLowerCase();
  const deptName = (v: string) => tmDept(v, depts.data);

  const sorted = useMemo(
    () =>
      (d?.employees ?? [])
        .slice()
        .sort((a, b) => (a.matched === b.matched ? String(a.name || a.email).localeCompare(String(b.name || b.email)) : a.matched ? -1 : 1)),
    [d],
  );
  const statusMap = status ?? {};
  const rows = sorted.filter((e) => rosterMatches(e, filter, statusMap) && rosterSearch(e, needle, deptName(e.dept)));
  const hiddenMatches = needle && filter !== 'all' ? Math.max(0, sorted.filter((e) => rosterSearch(e, needle, deptName(e.dept))).length - rows.length) : 0;

  const counts = {
    all: sorted.length,
    linked: sorted.filter((e) => e.matched).length,
    unlinked: sorted.filter((e) => !e.matched).length,
    paired: sorted.filter((e) => e.devices.some((x) => x.status === 'ACTIVE')).length,
  };
  const filters: { key: RosterFilter; label: string; count: number }[] = [
    { key: 'linked', label: 'Linked in TM360', count: counts.linked },
    ...(liveData
      ? [
          { key: 'tracked' as const, label: 'Tracked', count: liveData.tracked ?? 0 },
          { key: 'online' as const, label: 'Online now', count: liveData.online ?? 0 },
          { key: 'idle' as const, label: 'Idle right now', count: liveData.idle ?? 0 },
          ...(liveData.notPaired != null ? [{ key: 'unpaired' as const, label: 'Device not paired', count: liveData.notPaired }] : []),
        ]
      : []),
    { key: 'paired', label: 'With a paired device', count: counts.paired },
    { key: 'unlinked', label: 'Not linked', count: counts.unlinked },
    { key: 'all', label: 'Everyone', count: counts.all },
  ];
  const current = filters.find((f) => f.key === filter) ?? filters[0]!;

  // Tm360LiveCards onPick (11034): tapping the active card again goes back to Linked (Tracked stays).
  const pick = (f: RosterFilter) => setFilter((cur) => (cur === f && f !== 'tracked' ? 'linked' : f));
  const val = (v: number | null | undefined) => (live.isPending ? '…' : liveData ? (v == null ? '—' : v) : '—');

  async function doLink() {
    const e = linkFor;
    if (!e) return;
    if (!e.id) {
      toast.show('That row is missing its DASH user id. Pull to refresh and try again.', 'danger');
      return;
    }
    setLinking(true);
    try {
      const r = await linkToTm360(e.id);
      setLinkFor(null);
      toast.show(
        r.alreadyExisted
          ? `${e.name || e.email} already had a TM360 account on that address — now linked.`
          : `Created a TM360 account for ${e.name || e.email} as ${String(r.role || '').toLowerCase()}.`,
      );
      void qc.invalidateQueries({ queryKey: insightsKeys.tm360(user?.id) });
      void roster.refetch();
      void live.refetch();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not link that person to TM360.', 'danger');
    } finally {
      setLinking(false);
    }
  }

  const header = (
    <NavHeader
      title="Device monitoring"
      subtitle={(d ? d.scope === 'some' : !isTm360Admin(user)) ? 'People who report to you' : 'Everyone tracked by TM360'}
    />
  );

  return (
    <Screen header={header} onRefresh={() => Promise.all([roster.refetch(), live.refetch()])}>
      <View style={{ gap: space.sm }}>
        <StatGrid columns={2}>
          <StatTile variant="light" module="security" icon={Users} label="Tracked" value={val(liveData?.tracked)} caption={filter === 'tracked' ? 'Showing these' : 'Tap to show'} onPress={liveData ? () => pick('tracked') : undefined} />
          <StatTile variant="light" module="support" icon={Activity} label="Online now" value={val(liveData?.online)} caption={filter === 'online' ? 'Showing these' : 'Tap to show'} onPress={liveData ? () => pick('online') : undefined} />
          <StatTile variant="light" module="bounty" icon={MoonStar} label="Idle right now" value={val(liveData?.idle)} caption={filter === 'idle' ? 'Showing these' : 'Tap to show'} onPress={liveData ? () => pick('idle') : undefined} />
          <StatTile
            variant="light"
            module="policies"
            icon={MonitorOff}
            label="Device not paired"
            value={val(liveData?.notPaired)}
            caption={liveData && liveData.notPaired == null ? 'TM360 doesn’t report this yet' : filter === 'unpaired' ? 'Showing these' : 'Tap to show'}
            onPress={liveData && liveData.notPaired != null ? () => pick('unpaired') : undefined}
          />
        </StatGrid>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Gauge size={22} color={palette.textMuted} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Numeral
                value={liveData?.avgProductivity == null ? '—' : Math.round(liveData.avgProductivity)}
                unit={liveData?.avgProductivity == null ? undefined : '%'}
                size="md"
                caption={liveData && liveData.avgProductivity == null ? 'Average productivity: TM360 has not scored anyone yet' : 'Average productivity (TM360’s score)'}
              />
            </View>
          </View>
        </Card>
        {live.isError && !liveData ? <Banner tone="warning" title="Live status isn’t available" message={live.error?.message ?? 'Could not load live status.'} /> : null}
      </View>

      {roster.isPending ? (
        <>
          <Skeleton height={56} radius={radius.xl} />
          <SkeletonList rows={6} avatar />
        </>
      ) : roster.isError && !d ? (
        <ErrorState message={roster.error?.message || 'Could not load Device monitoring.'} onRetry={() => void roster.refetch()} />
      ) : d ? (
        <>
          {d.unmatchedCount > 0 ? (
            <Banner
              tone="warning"
              title={`${d.unmatchedCount} of ${d.employees.length} ${d.employees.length === 1 ? 'person has' : 'people have'} no TM360 account on their DASH email`}
              message={
                canPair
                  ? 'TM360 is matched to DASH by email only. Tap a person under “Not linked” to create their TM360 account, or correct the address on their TM360 record.'
                  : 'TM360 is matched to DASH by email only. Their address has to be corrected on their TM360 record.'
              }
            />
          ) : null}

          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <PillSelector icon={ListFilter} label={`${current.label} (${current.count})`} onPress={() => setFilterOpen(true)} accessibilityLabel={`Show: ${current.label}, ${current.count}`} />
              <Text variant="caption" muted style={{ marginLeft: 'auto' }}>
                {rows.length} shown
              </Text>
            </View>
            <PillField icon={Search} placeholder="Search name, email, department" value={q} onChangeText={setQ} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
          </View>

          {rows.length ? (
            <ListCard>
              {rows.slice(0, PAGE).map((e) => {
                const s = statusMap[e.email];
                const ls = s ? liveState(s.state) : null;
                const seen = tmSeen(lastSeenOf(e), today);
                const dept = deptName(e.dept);
                return (
                  <ListRow
                    key={e.email}
                    left={<Avatar name={e.name || e.email} size={40} ring={false} />}
                    title={e.name || e.email}
                    subtitle={[dept, e.jobTitle].filter(Boolean).join(' · ') || e.email}
                    subtitleLines={2}
                    meta={
                      !e.matched
                        ? e.pendingSignup
                          ? 'Not linked in TM360 · Pending signup'
                          : 'Not linked in TM360'
                        : [e.pendingSignup ? 'Pending signup' : '', e.devices.length ? (seen ? `Last seen ${seen}` : 'Not seen yet') : 'No device'].filter(Boolean).join(' · ')
                    }
                    below={ls ? <StatusPill label={ls.label} tone={ls.tone} /> : undefined}
                    chevron={e.matched || canPair}
                    onPress={
                      e.matched
                        ? () => router.push({ pathname: '/admin/insights/devices/[email]', params: { email: e.email } })
                        : canPair
                          ? () => setLinkFor(e)
                          : () => toast.show('Not linked in TM360: their address has to be corrected on their TM360 record.', 'info')
                    }
                    accessibilityHint={e.matched ? 'Opens what TM360 recorded' : canPair ? 'Creates their TM360 account' : undefined}
                  />
                );
              })}
            </ListCard>
          ) : null}
          {rows.length > PAGE ? (
            <Text variant="caption" muted align="center">
              Showing {PAGE} of {rows.length}. Search to find the rest.
            </Text>
          ) : null}
          {hiddenMatches > 0 ? (
            <Banner
              tone="info"
              message={`${hiddenMatches} more ${hiddenMatches === 1 ? 'person matches' : 'people match'} “${q.trim()}” but ${hiddenMatches === 1 ? 'is' : 'are'} hidden by this filter.`}
              action={{ label: 'Show everyone', onPress: () => setFilter('all') }}
            />
          ) : null}
          {!rows.length && !hiddenMatches ? (
            <EmptyState
              icon={<Users color={palette.textMuted} strokeWidth={1.8} />}
              title={d.employees.length === 0 ? 'No one to monitor' : 'No one matches'}
              message={
                d.employees.length === 0
                  ? 'Nobody reports to you in DASH, so there is nothing to monitor here. Ask HR to set your name as the reporting manager on your team’s records.'
                  : 'Nothing matches that search and filter.'
              }
            />
          ) : null}
        </>
      ) : null}

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Show">
        <ListCard>
          {filters.map((f) => (
            <ListRow
              key={f.key}
              title={f.label}
              value={String(f.count)}
              right={f.key === filter ? <Check size={20} color={palette.primaryText} strokeWidth={2} /> : undefined}
              onPress={() => {
                setFilter(f.key);
                setFilterOpen(false);
              }}
              accessibilityHint={f.key === filter ? 'Selected' : undefined}
            />
          ))}
        </ListCard>
      </Sheet>

      <ConfirmSheet
        visible={!!linkFor}
        onClose={() => setLinkFor(null)}
        title="Link to TM360"
        subtitle={linkFor ? `Create a TM360 account for ${linkFor.name || linkFor.email}?` : undefined}
        from={linkFor ? { title: linkFor.name || linkFor.email, subtitle: 'DASH', avatar: { name: linkFor.name || linkFor.email } } : undefined}
        to={{ title: 'TM360', subtitle: 'New account', icon: Link2, module: 'security' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to create"
        onConfirm={() => void doLink()}
        loading={linking}
        note="Recorded in the DASH audit log. DASH sends no email or WhatsApp.">
        <SummaryCard
          rows={[
            { label: 'Email', value: linkFor?.email ?? '' },
            { label: 'In TM360', value: 'Straight away, and in its billing headcount' },
            { label: 'Cost', value: 'No change: TM360 charges a flat monthly amount per organisation' },
          ]}
        />
      </ConfirmSheet>
    </Screen>
  );
}
