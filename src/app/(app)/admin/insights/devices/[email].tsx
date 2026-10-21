// Device monitoring › one person (web Tm360EmployeePanel, dash.html:10658, plus the row's devices and
// Pair / Unpair from Tm360Hub). Each tab is asked for only when it is opened, for the chosen IST days
// (default the last 7). Summary · Activity (by hour, or every entry) · Flagged · Location.
// Pair and Unpair are for the people the server lets pair (`canPair`): each is swiped, and says what
// happens. Screenshots are never shown (the website does not either). Excel export stays on the web.

import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AppWindow, CalendarDays, ChevronDown, ChevronRight, Globe, Laptop, Layers, MapPin, Plus, ShieldAlert, Unlink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import {
  claimTm360Device,
  insightsKeys,
  type Tm360Device,
  type Tm360Employee,
  type Tm360Named,
  unpairTm360Device,
  useTm360Employee,
  useTm360Live,
  useTm360Roster,
} from '@/api/insights';
import { useWorkDepts } from '@/api/work';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeeDevices } from '@/features/insights/access';
import {
  deviceStatus,
  groupByHour,
  hourLabel,
  lastSeenOf,
  liveState,
  rangeLabel,
  shortDay,
  tmDefaultRange,
  tmDept,
  tmDur,
  tmSeen,
  tmWhen,
} from '@/features/insights/format';
import { InsightsGate, useInsightsAccess } from '@/features/insights/gate';
import { RangeSheet } from '@/features/insights/range-sheet';
import { addDaysYmd } from '@/lib/ist';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  ListCard,
  ListRow,
  NavHeader,
  Numeral,
  NumeralRow,
  PillBarChart,
  PillSelector,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
  Skeleton,
  SkeletonList,
  StatusPill,
  SummaryCard,
  SwipeToConfirm,
  Text,
  TextField,
  toast,
} from '@/ui';

type Tab = 'summary' | 'activity' | 'restrictions' | 'location';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'activity', label: 'Activity' },
  { key: 'restrictions', label: 'Flagged' },
  { key: 'location', label: 'Location' },
];

export default function DeviceEmployeeRoute() {
  return (
    <InsightsGate title="Device monitoring" allow={canSeeDevices}>
      <DeviceEmployeeScreen />
    </InsightsGate>
  );
}

function DeviceEmployeeScreen() {
  const { email: rawEmail } = useLocalSearchParams<{ email: string }>();
  const email = String(rawEmail ?? '');
  const qc = useQueryClient();
  const { access } = useInsightsAccess();
  const today = useTodayIst();
  const roster = useTm360Roster(true);
  const live = useTm360Live(true, false);
  const depts = useWorkDepts(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [range, setRange] = useState(() => ({ key: 'week' as 'today' | 'week' | 'month' | 'custom', ...tmDefaultRange(today) }));
  const [rangeOpen, setRangeOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [unpair, setUnpair] = useState<Tm360Device | null>(null);
  const [busy, setBusy] = useState(false);

  const emp = roster.data?.employees.find((e) => e.email === email) ?? null;
  const canPair = !!roster.data?.canPair;
  const s = live.data?.status[email];
  const ls = s ? liveState(s.state) : null;
  const on = !!emp && emp.matched;

  const refresh = () => qc.invalidateQueries({ queryKey: insightsKeys.tm360(access.user?.id) });

  async function doUnpair() {
    const dev = unpair;
    if (!dev || !emp) return;
    setBusy(true);
    try {
      await unpairTm360Device(dev.id);
      setUnpair(null);
      toast.show(`Unpaired ${dev.hostname || dev.id}.`);
      void refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not unpair that device.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  const header = <NavHeader title={emp?.name || email || 'Device monitoring'} subtitle={emp ? email : undefined} />;

  if (roster.isPending) {
    return (
      <Screen header={header}>
        <Skeleton height={120} radius={radius.xl} />
        <SkeletonList rows={4} />
      </Screen>
    );
  }
  if (roster.isError && !roster.data) {
    return (
      <Screen header={header}>
        <ErrorState message={roster.error?.message || 'Could not load Device monitoring.'} onRetry={() => void roster.refetch()} />
      </Screen>
    );
  }
  if (!emp) {
    return (
      <Screen header={header}>
        <EmptyState icon={<Laptop color={palette.textMuted} strokeWidth={1.8} />} title="Not in your list" message="This person is not one of the people you can see in Device monitoring." />
      </Screen>
    );
  }

  const dept = tmDept(emp.dept, depts.data);
  const seen = tmSeen(lastSeenOf(emp), today);
  const rangeOptions = [
    { key: 'today' as const, label: 'Today', from: today, to: today },
    { key: 'week' as const, label: 'Last 7 days', ...tmDefaultRange(today) },
    { key: 'month' as const, label: 'Last 30 days', from: addDaysYmd(today, -30), to: today },
  ];
  const shownRange = rangeOptions.find((o) => o.key === range.key)?.label ?? rangeLabel({ key: 'custom', from: range.from, to: range.to }, today);

  return (
    <Screen header={header} onRefresh={() => refresh()}>
      <SummaryCard
        rows={[
          { label: 'Department', value: dept || '—' },
          { label: 'Job title', value: emp.jobTitle || '—' },
          { label: 'Right now', value: ls ? ls.label : 'No live status' },
          { label: 'Last seen', value: seen || '—' },
          ...(emp.pendingSignup ? [{ label: 'DASH', value: 'Not signed up yet' }] : []),
        ]}
      />

      <View>
        <SectionHeader title="Devices" />
        {!emp.matched ? (
          <Banner tone="warning" title="Not linked in TM360" message="Nothing can be shown until this email has a TM360 account." />
        ) : emp.devices.length ? (
          <ListCard>
            {emp.devices.map((dev) => {
              const st = deviceStatus(dev.status);
              const devSeen = tmSeen(dev.lastSeenAt, today);
              return (
                <ListRow
                  key={dev.id}
                  left={<Laptop size={22} color={palette.textMuted} strokeWidth={1.8} />}
                  title={dev.hostname || dev.id}
                  subtitle={[dev.platform, devSeen ? `Last seen ${devSeen}` : ''].filter(Boolean).join(' · ') || undefined}
                  below={<StatusPill label={st.label} tone={st.tone} />}
                  right={
                    canPair && dev.status === 'ACTIVE' ? (
                      <Button title="Unpair" variant="ghost" size="sm" icon={<Unlink />} onPress={() => setUnpair(dev)} />
                    ) : undefined
                  }
                />
              );
            })}
          </ListCard>
        ) : (
          <Text variant="body" muted>
            No device paired yet.
          </Text>
        )}
        {canPair && emp.matched ? (
          <Button title="Pair a device" variant="ghost" icon={<Plus />} onPress={() => setPairOpen(true)} style={{ marginTop: space.sm }} />
        ) : null}
      </View>

      {on ? (
        <>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row' }}>
              <PillSelector icon={CalendarDays} label={shownRange} onPress={() => setRangeOpen(true)} accessibilityLabel={`Dates: ${shownRange}`} />
            </View>
            <Segmented options={TABS} value={tab} onChange={setTab} />
          </View>
          {tab === 'summary' ? <SummaryTab email={email} from={range.from} to={range.to} today={today} /> : null}
          {tab === 'activity' ? <ActivityTab key={`${range.from}:${range.to}`} email={email} from={range.from} to={range.to} today={today} /> : null}
          {tab === 'restrictions' ? <FlaggedTab email={email} from={range.from} to={range.to} today={today} /> : null}
          {tab === 'location' ? <LocationTab email={email} from={range.from} to={range.to} today={today} /> : null}
        </>
      ) : null}

      <RangeSheet
        visible={rangeOpen}
        onClose={() => setRangeOpen(false)}
        options={rangeOptions}
        value={range}
        maxDate={today}
        onPick={(r) => setRange({ key: r.key, from: r.from, to: r.to })}
      />

      <PairSheet visible={pairOpen} emp={emp} waiting={roster.data?.unassignedDevices ?? []} onClose={() => setPairOpen(false)} onDone={() => void refresh()} />

      <ConfirmSheet
        visible={!!unpair}
        onClose={() => setUnpair(null)}
        title="Unpair this device"
        from={{ title: unpair?.hostname || unpair?.id || '', subtitle: 'Paired', icon: Laptop, module: 'security' }}
        to={{ title: emp.name || emp.email, subtitle: 'Stops reporting', avatar: { name: emp.name || emp.email } }}
        detailsTitle="What happens"
        confirmLabel="Swipe to unpair"
        onConfirm={() => void doUnpair()}
        loading={busy}
        note="Recorded in the DASH audit log. No one is emailed or messaged.">
        <SummaryCard
          rows={[
            { label: 'The machine', value: 'The TM360 agent on it stops reporting' },
            { label: 'Until', value: 'It is paired again with a new code' },
          ]}
        />
      </ConfirmSheet>
    </Screen>
  );
}

// ── Pair a device (Tm360PairModal 10462) ─────────────────────────────────────
function PairSheet({ visible, emp, waiting, onClose, onDone }: { visible: boolean; emp: Tm360Employee; waiting: Tm360Device[]; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (busy) return;
    setCode('');
    setMsg('');
    onClose();
  };
  async function submit() {
    if (!code.trim()) {
      setMsg('Enter the code shown on the machine.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const r = await claimTm360Device(code.trim(), emp.email);
      toast.show(`Paired ${r.hostname || r.deviceId || 'the device'} to ${emp.name || emp.email}.`);
      setCode('');
      onClose();
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not pair that device.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Pair a device"
      subtitle={`To ${emp.name || emp.email}`}
      dirty={!!code && !busy}
      footer={
        <>
          <SwipeToConfirm label="Swipe to pair" onConfirm={() => void submit()} loading={busy} disabled={!code.trim()} />
          <Text variant="caption" muted align="center" numberOfLines={2}>
            TM360 starts recording this machine for them. No one is emailed or messaged.
          </Text>
        </>
      }>
      <Text variant="body" muted>
        Enter the code the TM360 agent is showing on their machine.
      </Text>
      <TextField
        label="Pairing code"
        placeholder="XXXX-XXXX"
        value={code}
        onChangeText={(v) => {
          setCode(v.toUpperCase());
          if (msg) setMsg('');
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        error={msg || null}
        hint={waiting.length ? `${plural(waiting.length, 'machine')} waiting to be paired: ${waiting.map((x) => x.hostname || x.id).join(', ')}` : null}
      />
    </Sheet>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TabProps = { email: string; from: string; to: string; today: string };

function TabLoading() {
  return <SkeletonList rows={5} />;
}

function NamedList({ title, icon, rows }: { title: string; icon: typeof AppWindow; rows: Tm360Named[] }) {
  return (
    <View>
      <SectionHeader title={title} />
      {rows.length ? (
        <ActivityList>
          {rows.map((x) => (
            <ActivityRow key={x.name} module="security" icon={icon} title={x.name || '—'} titleLines={1} value={tmDur(x.seconds)} />
          ))}
        </ActivityList>
      ) : (
        <Text variant="body" muted>
          Nothing recorded.
        </Text>
      )}
    </View>
  );
}

function SummaryTab({ email, from, to, today }: TabProps) {
  const q = useTm360Employee('summary', email, from, to, true);
  if (q.isPending) return <TabLoading />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message || 'Could not load that.'} onRetry={() => void q.refetch()} />;
  const sum = q.data!;
  const scores = sum.dailyScores;
  return (
    <>
      <Card>
        <NumeralRow>
          <Numeral value={tmDur(sum.activeSeconds)} size="md" caption="Active time" />
          <Numeral value={tmDur(sum.idleSeconds)} size="md" caption="Idle time" />
        </NumeralRow>
        <Text variant="caption" muted style={{ marginTop: space.xs }}>
          {plural(scores.length, 'day')} scored · {plural(sum.sampledRows, 'row')} sampled
        </Text>
      </Card>
      {sum.sampleCapped ? (
        <Banner
          tone="warning"
          title="Only the latest entries"
          message={`These dates hold more activity than one request returns. The totals and lists cover the most recent ${sum.sampledRows} entries only. Choose fewer days for an exact figure.`}
        />
      ) : null}
      <NamedList title="Top applications" icon={AppWindow} rows={sum.topApps} />
      <NamedList title="Top sites" icon={Globe} rows={sum.topDomains} />
      <NamedList title="By category" icon={Layers} rows={sum.byCategory} />
      {scores.length ? (
        <View>
          <SectionHeader title="Daily productivity" />
          <Text variant="caption" muted style={{ marginBottom: space.xs }}>
            TM360’s own score for each day.
          </Text>
          {scores.length <= 10 ? (
            <Card style={{ marginBottom: space.sm }}>
              <PillBarChart
                values={scores.map((d) => d.score ?? 0)}
                labels={scores.map((d) => String(Number(d.date.slice(8, 10)) || ''))}
                spokenLabels={scores.map((d) => shortDay(d.date.slice(0, 10), today))}
                formatValue={(v) => `${v}`}
                caption="Score"
                accessibilityLabel="Daily productivity score"
              />
            </Card>
          ) : null}
          <ActivityList>
            {scores.map((d) => (
              <ActivityRow
                key={d.date}
                title={shortDay(d.date.slice(0, 10), today)}
                subtitle={`Productive ${mins(d.productiveMinutes)} · Neutral ${mins(d.neutralMinutes)} · Unproductive ${mins(d.unproductiveMinutes)} · Idle ${mins(d.idleMinutes)}`}
                value={d.score == null ? '—' : String(d.score)}
                meta="Score"
              />
            ))}
          </ActivityList>
        </View>
      ) : null}
    </>
  );
}

const IDLE_NOTE =
  'Idle means five minutes with no keyboard or mouse: reading, watching a long task finish or being in a meeting all count. TM360 sets that threshold, not DASH. Times are India time.';

function ActivityTab({ email, from, to, today }: TabProps) {
  const q = useTm360Employee('activity', email, from, to, true);
  const [mode, setMode] = useState<'hourly' | 'raw'>('hourly');
  const [open, setOpen] = useState<Set<string> | null>(null);
  if (q.isPending) return <TabLoading />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message || 'Could not load that.'} onRetry={() => void q.refetch()} />;
  const rows = q.data!.activity;
  const hours = groupByHour(rows);
  // Newest hour open, the rest collapsed (a week can be a hundred hours).
  const openSet = open ?? new Set(hours.length ? [hours[0]!.key] : []);
  const toggle = (key: string) => {
    const n = new Set(openSet);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setOpen(n);
  };
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <Text variant="caption" muted style={{ flex: 1, minWidth: 140 }}>
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'} across {plural(hours.length, 'hour')}
        </Text>
        <ChipRow bleed="none">
          <Chip label="By hour" selected={mode === 'hourly'} onPress={() => setMode('hourly')} />
          <Chip label="All entries" selected={mode === 'raw'} onPress={() => setMode('raw')} />
        </ChipRow>
      </View>
      {!rows.length ? (
        <EmptyState icon={<AppWindow color={palette.textMuted} strokeWidth={1.8} />} title="No activity" message="Nothing was recorded on these days." />
      ) : mode === 'hourly' ? (
        <View style={{ gap: space.sm }}>
          {hours.slice(0, 200).map((h) => {
            const isOpen = openSet.has(h.key);
            const Icon = isOpen ? ChevronDown : ChevronRight;
            return (
              <Card key={h.key} padded={false}>
                <Pressable
                  onPress={() => toggle(h.key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${hourLabel(h.start, today)}, ${tmDur(h.active)} active, ${tmDur(h.idle)} idle`}
                  style={({ pressed }) => [styles.hourHead, pressed && styles.pressed]}>
                  <Icon size={18} color={palette.textMuted} strokeWidth={1.8} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" color={palette.ink}>
                      {hourLabel(h.start, today)}
                    </Text>
                    <Text variant="caption" muted>
                      {[h.active > 0 ? `${tmDur(h.active)} active` : '', h.idle > 0 ? `${tmDur(h.idle)} idle` : '', `${h.entries} ${h.entries === 1 ? 'entry' : 'entries'}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </Pressable>
                {isOpen ? (
                  <View style={styles.hourBody}>
                    {h.items.map((it, i) => (
                      <View key={i} style={styles.hourItem}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="body" color={it.idle ? palette.textMuted : palette.ink} numberOfLines={1}>
                            {it.app}
                          </Text>
                          {it.where ? (
                            <Text variant="caption" muted numberOfLines={1}>
                              {it.where}
                            </Text>
                          ) : null}
                        </View>
                        <Text variant="label" color={it.idle ? palette.textMuted : palette.ink} tabular>
                          {it.idle ? `idle ${tmDur(it.seconds)}` : tmDur(it.seconds)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      ) : (
        <ActivityList>
          {rows.slice(0, 300).map((r) => (
            <ActivityRow
              key={r.id}
              title={r.appName || '—'}
              subtitle={r.domain || r.windowTitle || undefined}
              note={[tmWhen(r.occurredAt, today), r.category].filter(Boolean).join(' · ')}
              value={r.isIdle ? `idle ${tmDur(r.durationSeconds)}` : tmDur(r.durationSeconds)}
              valueColor={r.isIdle ? palette.textMuted : undefined}
            />
          ))}
        </ActivityList>
      )}
      {mode === 'raw' && rows.length > 300 ? (
        <Text variant="caption" muted align="center">
          Showing 300 of {rows.length} entries. Choose fewer days to see the rest.
        </Text>
      ) : null}
      <Text variant="caption" muted>
        {IDLE_NOTE}
      </Text>
    </>
  );
}

function FlaggedTab({ email, from, to, today }: TabProps) {
  const q = useTm360Employee('restrictions', email, from, to, true);
  if (q.isPending) return <TabLoading />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message || 'Could not load that.'} onRetry={() => void q.refetch()} />;
  const events = q.data!.events;
  if (!events.length) return <EmptyState icon={<ShieldAlert color={palette.textMuted} strokeWidth={1.8} />} title="Nothing blocked or flagged" message="Nothing was blocked or flagged on these days." />;
  return (
    <ActivityList>
      {events.map((e) => (
        <ActivityRow
          key={e.id}
          module="security"
          icon={ShieldAlert}
          title={e.matched || '—'}
          subtitle={[e.kind, e.pattern ? `Rule: ${e.pattern}` : ''].filter(Boolean).join(' · ')}
          note={tmWhen(e.occurredAt, today)}
          status={e.outcome ? { label: e.outcome, tone: /block/i.test(e.outcome) ? 'failed' : 'pending' } : null}
        />
      ))}
    </ActivityList>
  );
}

function LocationTab({ email, from, to, today }: TabProps) {
  const q = useTm360Employee('location', email, from, to, true);
  if (q.isPending) return <TabLoading />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message || 'Could not load that.'} onRetry={() => void q.refetch()} />;
  const locs = q.data!.locations;
  if (!locs.length) return <EmptyState icon={<MapPin color={palette.textMuted} strokeWidth={1.8} />} title="No location" message="No device has reported a location for this person." />;
  return (
    <View style={{ gap: space.sm }}>
      {locs.map((l) => {
        const st = deviceStatus(l.status);
        const hasPoint = l.latitude != null && l.longitude != null;
        return (
          <Card key={l.deviceId || l.hostname}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap', marginBottom: space.xs }}>
              <Text variant="bodyStrong" color={palette.ink} style={{ flexShrink: 1 }}>
                {l.hostname || l.deviceId}
              </Text>
              <StatusPill label={st.label} tone={st.tone} />
              {l.platform ? (
                <Text variant="caption" muted>
                  {l.platform}
                </Text>
              ) : null}
            </View>
            <Text variant="body" color={palette.text}>
              {l.address || 'No address found'}
            </Text>
            <Text variant="caption" muted style={{ marginTop: 2 }}>
              {[`Reported ${tmWhen(l.reportedAt, today)}`, l.accuracyMetres ? `±${Math.round(l.accuracyMetres)} m` : '', l.source].filter(Boolean).join(' · ')}
            </Text>
            {hasPoint ? (
              <Button
                title="Open in Maps"
                variant="ghost"
                size="sm"
                icon={<MapPin />}
                style={{ marginTop: space.sm, alignSelf: 'flex-start' }}
                onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${l.latitude},${l.longitude}`).catch(() => toast.show('Maps could not be opened.', 'danger'))}
              />
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  hourHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, padding: space.md, minHeight: 56 },
  pressed: { opacity: 0.7 },
  hourBody: { borderTopWidth: 1, borderTopColor: palette.hairline, paddingHorizontal: space.md, paddingVertical: space.xs },
  hourItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingVertical: space.xs },
}));

/** TM360 minutes in the app's duration format (DESIGN §0C): 192 → "3h 12m"; '—' when missing. */
function mins(m: number | null | undefined) {
  return m == null ? '—' : tmDur(m * 60);
}
