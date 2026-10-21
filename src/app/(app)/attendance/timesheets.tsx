// Timesheets — the web's TimesheetsView (dash.html ~L3711), in the Payno × Lendora layout. One
// Monday–Sunday week at a time, from GET /hr/timesheet/week: NavHeader, the week under a SectionHeader
// with its switcher, then state first — a light SummaryHero of the hours logged with a striped bar of
// logged against worked — then the days as Lendora MetricRows ("6.5/8 h" with a status pill), then the
// hours by project code in a frosted list. Adding or changing time is done on a day: every listed day
// (up to today) opens the same editor the clock-out uses — no separate "+" to find. The one primary is
// "Submit week" in the sticky bar: a ConfirmSheet lists the days and, with SwipeToConfirm, sends
// POST /hr/timesheet/week — every finished, unsubmitted day gets a sheet, and a day with nothing logged
// against it is saved as unlogged time (said in the sheet before it happens) — then a SuccessSheet.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardList, Send } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { submitTimesheetWeek, type TimesheetEntry, type TimesheetWeekDay, type WeekStatus, useTimesheetOwed, useTimesheetWeek } from '@/api/attendance';
import { isApiError } from '@/api/client';
import { addDays, dayMonth, mondayOf, plainServerText, shortDay, tsFmt, WEEKDAYS, weekdayOf } from '@/features/attendance/format';
import { TimesheetSheet } from '@/features/attendance/timesheet-sheet';
import { useTodayIst } from '@/features/attendance/use-now';
import { useAccess } from '@/lib/use-access';
import { moduleTone, palette, radius, space, type StatusTone } from '@/theme/tokens';
import {
  ActionBar,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  haptic,
  IconButton,
  MetricRow,
  NavHeader,
  Screen,
  SectionHeader,
  shouldStack,
  Skeleton,
  SkeletonList,
  StripedProgress,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  Text,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const entriesOf = (day: TimesheetWeekDay) => (Array.isArray(day?.entries) ? day.entries.filter((e): e is TimesheetEntry => !!e && typeof e === 'object') : []);
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// Keeps a short phrase ("Worked 6h 30m") on one line, so a wrapping line breaks between phrases.
const NBSP = String.fromCharCode(0xa0);
const keep = (s: string) => s.replace(/\s/g, NBSP);
/** Hours to one decimal, for the Lendora figures ("6.5/8 h"). */
const hours1 = (min: number) => Math.round(num(min) / 6) / 10;
/** How long a sheet takes to fade out, so the next one only opens once it has gone. */
const SHEET_FADE_MS = 280;

type Submitted = { range: string; days: number; logged: number };

// '13 – 19 Oct' inside one month, '29 Sep – 5 Oct' across two. The year goes in the overline, so the
// one-line heading fits beside the week switcher at 360 dp and font scale 1.3.
function rangeLabel(a: string, b: string) {
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8, 10))} – ${dayMonth(b)}`;
  return `${dayMonth(a)} – ${dayMonth(b)}`;
}
// '2026', or '2025–26' for the week that crosses into a new year.
function yearLabel(a: string, b: string) {
  const from = a.slice(0, 4);
  const to = b.slice(0, 4);
  return from === to ? to : `${from}–${to.slice(2)}`;
}

// One row per project code (or project where no code was recorded) — the axis a week is read along.
function byCode(days: TimesheetWeekDay[]) {
  const by = new Map<string, { label: string; perDay: Record<string, number>; total: number }>();
  for (const day of days) {
    for (const e of entriesOf(day)) {
      const label = e.kekaCode || e.projectName || 'No project';
      if (!by.has(label)) by.set(label, { label, perDay: {}, total: 0 });
      const r = by.get(label)!;
      const mins = num(e.minutes);
      r.perDay[day.date] = (r.perDay[day.date] || 0) + mins;
      r.total += mins;
    }
  }
  return [...by.values()].sort((x, y) => y.total - x.total || x.label.localeCompare(y.label));
}

export default function TimesheetsScreen() {
  const qc = useQueryClient();
  const access = useAccess();
  const l = useLayout();
  const { gap } = l;
  // The swipe's label is shortened where it would be cut (320 dp, large text), as on Apply leave.
  const shortSwipe = shouldStack(l, { below: 'narrow' });
  const on = access.sections.timesheets;
  const today = useTodayIst();
  const thisYear = today.slice(0, 4);
  const thisMonday = mondayOf(today);
  const [start, setStart] = useState(thisMonday);
  const q = useTimesheetWeek(start, on);
  const d = q.data && typeof q.data === 'object' ? q.data : undefined;
  const weekly = d?.cadence === 'weekly';
  const owedQ = useTimesheetOwed(addDays(thisMonday, -7), today, on && weekly);
  const [edit, setEdit] = useState<string | null>(null); // which day the editor is on
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  // What was sent, kept for the success sheet (the week reloads under it, and it fades out with it).
  const [done, setDone] = useState<Submitted | null>(null);
  const [lastDone, setLastDone] = useState<Submitted | null>(null);
  if (done && done !== lastDone) setLastDone(done);
  const shownDone = done ?? lastDone;

  const days = (Array.isArray(d?.days) ? d.days : []).filter((x): x is TimesheetWeekDay => !!x && isYmd(x.date));
  const rows = byCode(days);
  const sum = (f: (x: TimesheetWeekDay) => number) => days.reduce((n, x) => n + num(f(x)), 0);
  const worked = sum((x) => x.attendanceMinutes);
  const logged = sum((x) => x.filledMinutes);
  const unlogged = sum((x) => x.bufferMinutes);
  const pct = worked > 0 ? Math.min(100, Math.round((logged / worked) * 100)) : 0;
  const serverToday = isYmd(d?.today) ? d.today : today;
  // Worked, finished and not written up — exactly the days the Monday gate counts.
  const openDays = days.filter((x) => x.finished && !x.submitted && x.date <= serverToday);
  // Days worth listing: anything worked or submitted, and the days up to today. Future days are noise.
  const shownDays = days.filter((x) => x.worked || x.submitted || x.date <= serverToday);
  const unfinished = days.filter((x) => x.worked && !x.finished && !x.submitted);
  const anyWorked = days.some((x) => x.worked || x.submitted);
  // When nothing is open, the bar says why — and only claims "all submitted" when something was.
  const idleNote = unfinished.some((x) => x.date === serverToday)
    ? 'Today can be submitted once you clock out.'
    : unfinished.length
      ? 'A day without a clock-out can’t be submitted.'
      : !anyWorked
        ? start === thisMonday
          ? 'Nothing to submit yet this week.'
          : 'No days were worked this week.'
        : 'Every day you worked is submitted.';
  const weeks = Array.isArray(owedQ.data?.weeks) ? owedQ.data.weeks : [];
  const lastWeek = weeks.find((w: WeekStatus) => w?.weekStart === addDays(thisMonday, -7));
  const owed = lastWeek && !lastWeek.complete ? lastWeek : null;
  const owedDays = Array.isArray(owed?.missing) ? owed.missing.filter(isYmd) : [];
  const range = rangeLabel(start, addDays(start, 6));

  // Closing the week writes a sheet for every unsubmitted day; an empty one is saved as unlogged in
  // full — the confirm sheet says so before it happens.
  const openLogged = openDays.reduce((n, x) => n + num(x.filledMinutes), 0);
  const emptyDays = openDays.filter((x) => !num(x.filledMinutes));
  const emptyMins = emptyDays.reduce((n, x) => n + num(x.attendanceMinutes), 0);

  const submitWeek = useMutation({
    mutationFn: async (weekStart: string) => {
      const r = await submitTimesheetWeek(weekStart);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onMutate: () => setErr(''),
    onSuccess: () => {
      haptic.success();
      void qc.invalidateQueries({ queryKey: ['att-ts-week'] });
      void qc.invalidateQueries({ queryKey: ['att-ts-owed'] });
      // One layer at a time: the confirm sheet fades, then the success sheet opens.
      const sent: Submitted = { range, days: openDays.length, logged: openLogged };
      setConfirming(false);
      setTimeout(() => setDone(sent), SHEET_FADE_MS);
    },
    onError: (e: Error) => {
      haptic.error();
      setConfirming(false);
      setErr(plainServerText(e.message) || 'Couldn’t submit the week.');
    },
  });

  const header = <NavHeader title="Timesheets" />;

  if (!on) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<ClipboardList color={moduleTone.timesheets.fg} strokeWidth={1.8} />}
          title="Timesheets aren’t on"
          message="Your account doesn’t fill in timesheets."
        />
      </Screen>
    );
  }

  const footer = d ? (
    <ActionBar
      note={
        openDays.length
          ? `${plural(openDays.length, 'day')} to submit${weekly ? ' · due before Monday’s clock-in' : ''}`
          : idleNote
      }>
      <Button title="Submit week" icon={<Send />} loading={submitWeek.isPending} disabled={!openDays.length} onPress={() => setConfirming(true)} />
    </ActionBar>
  ) : undefined;

  const atLatest = start >= thisMonday;
  const switcher = (
    <View style={styles.switcher}>
      <IconButton accessibilityLabel="Previous week" onPress={() => setStart(addDays(start, -7))}>
        <ChevronLeft size={20} color={palette.text} strokeWidth={1.8} />
      </IconButton>
      {/* Like the month switcher: nothing lies ahead of this week (future days aren't listed). */}
      <IconButton accessibilityLabel="Next week" disabled={atLatest} onPress={() => setStart(addDays(start, 7))}>
        <ChevronRight size={20} color={atLatest ? palette.textFaint : palette.text} strokeWidth={1.8} />
      </IconButton>
    </View>
  );

  // The hero is state only (what was logged against what was worked, what was saved as unlogged and
  // what is still to log); what is left to submit is said once, in the bar's note under it.
  const toLog = Math.max(0, worked - logged - unlogged);
  const gaps = [unlogged ? `${tsFmt(unlogged)} unlogged` : null, toLog ? `${tsFmt(toLog)} still to log` : null].filter(Boolean).join(' · ');
  const summaryLine =
    worked > 0 || logged > 0
      ? gaps || 'Everything you worked is logged'
      : start < thisMonday
        ? 'Nothing worked this week'
        : 'Nothing worked yet';
  const loggedHours = hours1(logged);

  // The confirm and success sheets sit beside the Screen, not in it, so they never add an empty
  // animated gap to the list.
  return (
    <>
      <Screen header={header} footer={footer} onRefresh={() => Promise.all([q.refetch(), weekly ? owedQ.refetch() : null])}>
        {/* At most one notice: a failed submit, else last week still owing days. */}
        {err ? (
          <Banner tone="danger" title="Couldn’t submit the week" message={err} />
        ) : owed ? (
          <Banner
            tone="warning"
            title="Last week isn’t filled in"
            message={`${owedDays.length || 'Some'} day${owedDays.length === 1 ? '' : 's'} left${owedDays.length ? ` (${owedDays.map((x) => shortDay(x, thisYear)).join(' · ')})` : ''}. You can’t clock in until they’re done.`}
            action={start !== owed.weekStart ? { label: 'Open last week', onPress: () => setStart(owed.weekStart) } : undefined}
          />
        ) : null}

        <View style={styles.week}>
          <SectionHeader overline={`${start === thisMonday ? 'This week' : 'Past week'} · ${yearLabel(start, addDays(start, 6))}`} title={range} right={switcher} />
          {start !== thisMonday ? (
            <Button title="Back to this week" variant="text" size="sm" onPress={() => setStart(thisMonday)} style={styles.start} />
          ) : null}
        </View>

        {q.isLoading ? (
          <View style={{ gap }} accessibilityLabel="Loading" accessibilityRole="progressbar">
            <Skeleton height={190} radius={radius.xxl} />
            <SkeletonList rows={5} tone="surface" />
          </View>
        ) : q.error && !d ? (
          <ErrorState message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />
        ) : d ? (
          <View style={styles.sections}>
            {/* State: how much of the time worked is logged (the same thing "unlogged" is measured against). */}
            <SummaryHero
              icon={ClipboardList}
              module="timesheets"
              label="Logged this week"
              value={loggedHours}
              decimals={Number.isInteger(loggedHours) ? 0 : 1}
              unit="h"
              sub={summaryLine}>
              {worked > 0 ? (
                <StripedProgress
                  label="Of the time you worked"
                  used={logged}
                  total={worked}
                  formatValue={tsFmt}
                  accessibilityLabel={`${pct}% of the time worked is logged: ${tsFmt(logged)} of ${tsFmt(worked)}`}
                />
              ) : null}
            </SummaryHero>

            <View style={styles.block}>
              <SectionHeader title="Days" />
              <Text variant="caption" muted numberOfLines={2} style={styles.hint}>
                Tap a day to add or change its time.
              </Text>
              {shownDays.length ? (
                <View style={styles.rows}>
                  {shownDays.map((x) => {
                    const owes = !x.submitted && x.finished && x.date <= serverToday;
                    const isToday = x.date === serverToday;
                    // One status, as a pill; only days that need nothing have none.
                    const status: { label: string; tone: StatusTone } | null = x.submitted
                      ? { label: 'Submitted', tone: 'done' }
                      : owes
                        ? { label: 'To fill in', tone: 'pending' }
                        : x.worked && !x.finished
                          ? { label: 'Clocked in', tone: 'info' }
                          : null;
                    const att = num(x.attendanceMinutes);
                    const filled = num(x.filledMinutes);
                    const buffer = num(x.bufferMinutes);
                    const day = `${shortDay(x.date, thisYear)}${isToday ? ' · today' : ''}`;
                    // Lendora "6.5/8 h": logged over worked; the exact durations go in the line under it.
                    const sub = x.worked
                      ? `${keep(`Worked ${tsFmt(att)}`)}${buffer ? ` · ${keep(`${tsFmt(buffer)} unlogged`)}` : ''}`
                      : x.submitted
                        ? `Logged ${tsFmt(filled)}`
                        : 'Not worked';
                    return (
                      <MetricRow
                        key={x.date}
                        label={day}
                        value={hours1(filled)}
                        total={x.worked ? hours1(att) : null}
                        unit="h"
                        sub={sub}
                        module="timesheets"
                        // Today's dot is the brand; the rest carry the timesheets colour.
                        dotColor={isToday ? palette.primaryText : undefined}
                        status={status}
                        onPress={() => setEdit(x.date)}
                        hint="Opens this day’s timesheet"
                        accessibilityLabel={[
                          day,
                          `logged ${tsFmt(filled)}`,
                          x.worked ? `of ${tsFmt(att)} worked` : 'not worked',
                          buffer ? `${tsFmt(buffer)} unlogged` : null,
                          status?.label,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      />
                    );
                  })}
                </View>
              ) : (
                <Card tone="frost">
                  <Text variant="label" muted>
                    Nothing to show for this week yet.
                  </Text>
                </Card>
              )}
            </View>

            {rows.length ? (
              <ActivityList title="By project code" separatorInset={space.md}>
                {rows.map((r) => (
                  <ActivityRow
                    key={r.label}
                    title={r.label}
                    subtitle={days
                      .filter((x) => r.perDay[x.date])
                      .map((x) => `${WEEKDAYS[weekdayOf(x.date)]} ${tsFmt(r.perDay[x.date] ?? 0)}`)
                      .join(' · ')}
                    value={tsFmt(r.total)}
                  />
                ))}
              </ActivityList>
            ) : null}
          </View>
        ) : null}

        {edit ? (
          <TimesheetSheet
            mode="entry"
            date={edit}
            onCancel={() => setEdit(null)}
            onSubmitted={() => {
              setEdit(null);
              void q.refetch();
            }}
          />
        ) : null}
      </Screen>

      {/* Submitting the week: the days it covers, then a swipe. */}
      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Submit this week?"
        subtitle={range}
        detailsTitle={plural(openDays.length, 'day')}
        confirmLabel={shortSwipe ? 'Swipe to submit' : 'Swipe to submit week'}
        onConfirm={() => {
          if (d) submitWeek.mutate(d.weekStart);
        }}
        loading={submitWeek.isPending}
        disabled={!d || !openDays.length}>
        <SummaryCard
          rows={openDays.map((x) => ({
            key: x.date,
            label: shortDay(x.date, thisYear),
            value: num(x.filledMinutes) ? `Logged ${tsFmt(num(x.filledMinutes))}` : 'No entries',
          }))}
          total={{ label: 'Total', value: tsFmt(openLogged) }}
        />
        {emptyDays.length ? (
          <Banner
            tone="warning"
            message={`${emptyDays.length === 1 ? '1 day has' : `${emptyDays.length} days have`} no entries, so ${tsFmt(emptyMins)} will be saved as unlogged time.`}
          />
        ) : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={!!done}
        onClose={() => setDone(null)}
        title="Week submitted"
        subtitle={shownDone ? `Your timesheet for ${shownDone.range} is in.` : undefined}>
        {shownDone ? (
          <SummaryCard
            rows={[
              { key: 'days', label: 'Days', value: plural(shownDone.days, 'day') },
              { key: 'logged', label: 'Logged', value: tsFmt(shownDone.logged) },
              { key: 'status', label: 'Status', value: 'Submitted', status: 'done' },
            ]}
          />
        ) : null}
      </SuccessSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  switcher: { flexDirection: 'row', gap: space.xs },
  start: { alignSelf: 'flex-start' },
  week: { gap: space.xxs },
  // The hero and each list are their own sections, with room between them.
  sections: { gap: space.lg },
  block: { gap: space.xs },
  hint: { paddingHorizontal: space.xxs, marginTop: -space.xs },
  rows: { gap: space.xs },
}));
