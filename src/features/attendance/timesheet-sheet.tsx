// The day's timesheet as a bottom sheet — the app's ClockOutTimesheetModal (dash.html ~L3913).
//
// mode 'clockout' (opened by Clock out) is ONE step: the sheet opens on a summary of the day
// ("You worked 8h 12m · 6h 40m logged · 1h 32m unlogged"), the entries the task timers already wrote
// (each only needs a line saying what was done) and one "Clock out" (two taps from the clock card).
// Changing times or projects, adding or removing entries sits behind "Edit entries". "Stay clocked in"
// (a text button, never the white "go" pill) or closing the sheet leaves the person clocked in.
//
// "Clock out" runs, in this order, stopping at the first thing that fails and saying what happened:
//   1. the entries are checked (nothing has changed yet);
//   2. the position is taken and checked (`locate`) — BEFORE anything is saved, so a phone that can't
//      get a good fix never leaves a saved timesheet with the person still clocked in;
//   3. running task timers are paused (the web makes you press Pause or End first; here Clock out
//      pauses them — the same PUT — and reloads the day so their time is on the sheet);
//   4. the day is saved;
//   5. the clock-out is sent with the position from step 2 (`punchOut`). If only this fails, the sheet
//      says the timesheet IS saved and the person is still clocked in; "Clock out" then only retries
//      the clock-out.
//
// The web's rules are kept exactly:
//   - every entry needs a project code, a start, an end after the start and a 3+ character note;
//   - unlogged time (the server's "buffer") is never saved silently: for a daily person the line
//     right above Clock out says how much will be saved as unlogged time (no second dialog);
//   - a weekly person's timesheet is due before Monday, so the same one "Clock out" saves the day only
//     when they wrote something; otherwise it just clocks out (fill in later from Timesheets);
//   - after the server has refused a save, "Clock out without a timesheet" appears — a timesheet that
//     cannot be saved must never be the reason someone cannot end their day.
//
// mode 'entry': the same sheet opened mid-day or for an earlier day (Timesheets screen); it opens
// straight into editing, saves and closes. Only the clock-out path punches.
// Everything read from the server is shape-checked first (a non-array `entries` once crashed this).

import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Search, X } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import {
  type Project,
  type RunningTask,
  stopTask,
  submitTimesheet,
  type TimesheetDay,
  type TimesheetEntry,
  useProjects,
  useTimesheetDay,
} from '@/api/attendance';
import { isApiError } from '@/api/client';
import { useSession } from '@/auth/session';
import { minutesBetween, plainServerText, prettyHm, shortDay, tsFmt } from '@/features/attendance/format';
import { ClockError, type Fix, getPosition } from '@/features/attendance/use-clock';
import { useTodayIst } from '@/features/attendance/use-now';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import { Banner, Button, FieldPair, haptic, IconButton, ProgressBar, Sheet, Skeleton, Text, TextField, TimeField, toast } from '@/ui';

import { themedStyles } from '@/theme/themed';
// fixedProject: a task timer's line that came with its project — re-pointing it would make the task
// link a lie. A task line with no project yet may be given one (nothing is re-pointed).
type Row = TimesheetEntry & { key: string; fixedProject?: boolean };
type Problem = { key: string; field: 'project' | 'start' | 'end' | 'comment'; message: string };

let rowSeq = 0;
const nextKey = () => `ts${++rowSeq}`;
const HHMM = /^\d{2}:\d{2}$/;

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x != null) : []);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isDay = (v: unknown): v is TimesheetDay => !!v && typeof v === 'object' && !Array.isArray(v);
const filledOf = (rows: Row[]) => rows.reduce((n, r) => n + Math.max(0, minutesBetween(r.startTime, r.endTime)), 0);

// First load seeds the rows; later ones (after a timer was paused) keep what is on screen — notes
// already typed — and append only stretches that are not there yet (web load()). Server lines are
// kept exactly as sent (they go back in the save body); only non-objects are dropped.
// `ended` names the rows (taskId|startTime) that were running timers: their end was "now" when the
// sheet loaded, so it is taken from the fresh, paused line instead (their times could not be edited).
const idOf = (r: { taskId: string | null; startTime: string }) => `${r.taskId}|${r.startTime}`;
function mergeRows(prev: Row[], entries: unknown, ended?: Set<string>): Row[] {
  const before = Array.isArray(prev) ? prev : [];
  const seeded: Row[] = list<TimesheetEntry>(entries)
    .filter((e) => typeof e === 'object')
    .map((e) => ({ ...e, key: nextKey(), fixedProject: e.source === 'task' && !!(e.kekaCode || e.projectName) }));
  if (!before.length) return seeded;
  const fresh = new Map(seeded.map((x) => [idOf(x), x]));
  const kept = before.map((p) => {
    const f = ended?.has(idOf(p)) ? fresh.get(idOf(p)) : undefined;
    return f && HHMM.test(f.endTime || '') ? { ...p, endTime: f.endTime } : p;
  });
  const have = new Set(before.map(idOf));
  return kept.concat(seeded.filter((x) => !have.has(idOf(x))));
}

// The first unmet requirement (the server's own checks, in plain words).
function firstProblem(rows: Row[]): Problem | null {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const w = `Entry ${i + 1}: `;
    if (!r.kekaCode && !r.projectName) return { key: r.key, field: 'project', message: `${w}pick a project code.` };
    if (!HHMM.test(r.startTime || '')) return { key: r.key, field: 'start', message: `${w}add a start time.` };
    if (!HHMM.test(r.endTime || '')) return { key: r.key, field: 'end', message: `${w}add an end time.` };
    if (minutesBetween(r.startTime, r.endTime) <= 0) return { key: r.key, field: 'end', message: `${w}the end must be after the start.` };
    if (String(r.comment || '').trim().length < 3) return { key: r.key, field: 'comment', message: `${w}say what you worked on.` };
  }
  // No entry at all is not an error: the whole day is then unlogged, which is confirmed first.
  return null;
}

type Stage = 'locating' | 'pausing' | 'saving' | 'clocking';
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? plainServerText(e.message) : fallback);

// Exactly the body the server takes (hr_timesheet.js POST /hr/timesheet).
const toBody = (x: Row) => ({
  projectId: x.projectId,
  kekaCode: x.kekaCode,
  projectName: x.projectName,
  taskId: x.taskId,
  taskTitle: x.taskTitle,
  startTime: x.startTime,
  endTime: x.endTime,
  comment: x.comment,
  source: x.source,
});

export function TimesheetSheet({
  mode,
  date,
  onCancel,
  onSubmitted,
  locate,
  punchOut,
}: {
  mode: 'clockout' | 'entry';
  date?: string | null; // entry mode: which day (defaults to today)
  onCancel: () => void;
  onSubmitted: () => void;
  /** Clock-out: takes and checks the position. Runs first, before anything is paused or saved. */
  locate?: () => Promise<Fix>;
  /** Clock-out: sends the clock-out with that position; rejects with the server's message. */
  punchOut?: (fix: Fix) => Promise<void>;
}) {
  const entryMode = mode === 'entry';
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const todayYmd = useTodayIst();
  const thisYear = todayYmd.slice(0, 4);
  const dayQ = useTimesheetDay(date ?? null);
  const projectsQ = useProjects();
  const d: TimesheetDay | undefined = isDay(dayQ.data) ? dayQ.data : undefined;

  const [rows, setRows] = useState<Row[]>([]);
  const [mergedFrom, setMergedFrom] = useState<TimesheetDay | null>(null);
  const [editing, setEditing] = useState(entryMode);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [err, setErr] = useState('');
  const [needsSettings, setNeedsSettings] = useState(false); // location is off for DASH
  const [serverFailed, setServerFailed] = useState(false);
  const [picking, setPicking] = useState<string | null>(null); // row key choosing a project
  const [stage, setStage] = useState<Stage | null>(null);
  // Timers this sheet already paused — never paused twice, even if the reload after it failed.
  const [paused, setPaused] = useState<string[]>([]);
  // This clock-out's timesheet is saved already (the clock-out itself failed): a retry only clocks out.
  const [saved, setSaved] = useState(false);
  // The person changed something here (a weekly person's Clock out then saves the day).
  const [touched, setTouched] = useState(false);

  // Merge each new response into the rows during render, so the list never flashes empty.
  if (d && d !== mergedFrom) {
    setMergedFrom(d);
    setRows((prev) => mergeRows(prev, d.entries));
  }

  const changed = () => {
    setTouched(true);
    setSaved(false);
  };
  const clearProblem = (key: string) => {
    if (problem?.key === key) {
      setProblem(null);
      setErr('');
    }
  };
  const setRow = (key: string, patch: Partial<Row>) => {
    clearProblem(key);
    changed();
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    setEditing(true);
    changed();
    setRows((rs) =>
      rs.concat({
        key: nextKey(),
        source: 'manual',
        taskId: null,
        taskTitle: '',
        projectId: null,
        kekaCode: '',
        projectName: '',
        startTime: '',
        endTime: '',
        comment: '',
      }),
    );
  };

  const filled = filledOf(rows);
  const logged = num(d?.loggedMinutes);
  const unlogged = Math.max(0, logged - filled);
  const over = Math.max(0, filled - logged);
  const weekly = d?.cadence === 'weekly';
  const lastWeek = d?.lastWeek && typeof d.lastWeek === 'object' ? d.lastWeek : null;
  const owed = lastWeek && !lastWeek.complete ? lastWeek : null;
  const owedDays = list<string>(owed?.missing).filter((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x));
  const running = list<RunningTask>(d?.runningTasks).filter((t) => typeof t === 'object' && !paused.includes(t.id));
  const isLive = (r: Row) => r.source === 'task' && running.some((t) => t.id === r.taskId && t.startedTime === r.startTime);
  const busy = stage !== null;
  // A weekly person who wrote nothing tonight just clocks out (their week is due before Monday).
  const weeklyLater = weekly && !touched && !rows.some((r) => String(r.comment ?? '').trim());

  // POST /hr/timesheet with the same body as always; the week views reload after it.
  const saveDay = async (workDate: string, entries: Row[]) => {
    const r = await submitTimesheet(workDate, entries.map(toBody));
    if (isApiError(r)) throw new Error(r.error);
    void qc.invalidateQueries({ queryKey: ['att-ts-week'] });
    void qc.invalidateQueries({ queryKey: ['att-ts-owed'] });
  };

  // Stop every running timer (pause — the web's step 1, done for you), then reload the day so the
  // time just recorded is on the sheet. Returns the fresh day and rows, or null when it failed.
  const pauseRunning = async (): Promise<{ day: TimesheetDay; entries: Row[] } | null> => {
    if (!d) return null;
    if (!running.length) return { day: d, entries: rows };
    if (!user) {
      setErr('Sign in again to continue.');
      return null;
    }
    // Rows that are running timers now: their end comes from the pause (see mergeRows).
    const ended = new Set(rows.filter(isLive).map(idOf));
    try {
      for (const t of running) {
        const r = await stopTask(t, false, user);
        if (isApiError(r)) throw new Error(r.error);
        setPaused((ids) => ids.concat(t.id));
      }
      const fresh = await dayQ.refetch();
      if (fresh.error || !isDay(fresh.data)) throw new Error('Your timer is paused, but the day didn’t reload. Try again.');
      const entries = mergeRows(rows, fresh.data.entries, ended);
      setMergedFrom(fresh.data);
      setRows(entries);
      return { day: fresh.data, entries };
    } catch (e) {
      haptic.error();
      setErr(errText(e, 'Couldn’t pause your timer. Try again.'));
      return null;
    }
  };

  const block = (p: Problem) => {
    haptic.warning();
    setProblem(p);
    setErr(p.message);
    if (p.field !== 'comment') setEditing(true); // only the note is editable in the summary
  };

  const startRun = () => {
    setErr('');
    setNeedsSettings(false);
    setProblem(null);
  };

  // Entry mode: check, save, close.
  const saveEntries = async () => {
    if (!d || busy) return;
    startRun();
    const p = firstProblem(rows);
    if (p) return block(p);
    const workDate = typeof d.workDate === 'string' ? d.workDate : '';
    if (!workDate) {
      setErr('Couldn’t read which day this is. Close and try again.');
      return;
    }
    setStage('saving');
    try {
      await saveDay(workDate, rows);
    } catch (e) {
      haptic.error();
      setErr(errText(e, 'Couldn’t save your timesheet.'));
      setStage(null);
      return;
    }
    haptic.success();
    toast.show('Timesheet saved');
    setStage(null);
    onSubmitted();
  };

  // Clock-out: steps 1–5 in the header. skipSave: a weekly person who wrote nothing, or "Clock out
  // without a timesheet" after the server refused a save (or the day couldn't load).
  const clockOut = async (skipSave: boolean) => {
    if (busy || (!d && !skipSave)) return;
    startRun();
    const writing = !skipSave && !saved;
    // 1. Mistakes in the form first: nothing has changed yet.
    if (writing) {
      const p = firstProblem(rows);
      if (p) return block(p);
    }
    // 2. Where you are, before anything is paused or saved.
    let fix: Fix | null = null;
    if (punchOut) {
      setStage('locating');
      try {
        fix = await (locate ?? getPosition)();
      } catch (e) {
        haptic.error();
        setErr(errText(e, 'Couldn’t find your location. Try again.'));
        setNeedsSettings(e instanceof ClockError && e.code === 'permission');
        setStage(null);
        return;
      }
    }
    // 3. Running task timers (pausing can add the last stretch as a new entry, so check again).
    let day = d;
    let entries = rows;
    if (d && running.length) {
      setStage('pausing');
      const fresh = await pauseRunning();
      if (!fresh) {
        setStage(null);
        return;
      }
      day = fresh.day;
      entries = fresh.entries;
      const p2 = writing ? firstProblem(entries) : null;
      if (p2) {
        setStage(null);
        return block(p2);
      }
    }
    // 4. Save the day.
    let savedNow = false;
    if (writing && day) {
      const workDate = typeof day.workDate === 'string' ? day.workDate : '';
      if (!workDate) {
        setErr('Couldn’t read which day this is. Close and try again.');
        setStage(null);
        return;
      }
      setStage('saving');
      try {
        await saveDay(workDate, entries);
        savedNow = true;
        setSaved(true);
      } catch (e) {
        haptic.error();
        setErr(errText(e, 'Couldn’t save your timesheet.'));
        setServerFailed(true);
        setStage(null);
        return;
      }
    }
    // 5. Clock out with the position from step 2.
    if (punchOut && fix) {
      setStage('clocking');
      try {
        await punchOut(fix);
      } catch (e) {
        const why = errText(e, 'Couldn’t clock you out. Try again.');
        setErr(savedNow || saved ? `Your timesheet is saved, but you’re still clocked in. ${why}` : why);
        setStage(null);
        return;
      }
    }
    setStage(null);
    onSubmitted();
  };

  // ── body + footer for whichever view is showing ──
  const workDate = d && typeof d.workDate === 'string' ? d.workDate : date || null;
  const isToday = !workDate || workDate === todayYmd;
  const pickingRow = picking ? rows.find((r) => r.key === picking) : undefined;
  // Leaving is always the quiet text button under the one primary (never a white pill).
  const cancelBtn = <Button title={entryMode ? 'Cancel' : 'Stay clocked in'} variant="text" disabled={busy} onPress={onCancel} style={styles.center} />;
  const stageText: Record<Stage, string> = {
    locating: 'Getting your location…',
    pausing: running.length === 1 ? 'Pausing your task timer…' : 'Pausing your task timers…',
    saving: 'Saving your timesheet…',
    clocking: 'Clocking you out…',
  };
  // One line above the buttons: what is happening, else what went wrong.
  const statusLine = stage ? (
    <Text variant="label" muted align="center" accessibilityLiveRegion="polite">
      {stageText[stage]}
    </Text>
  ) : err ? (
    <Text variant="label" color={palette.dangerInk} align="center" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {err}
    </Text>
  ) : null;
  const settingsBtn = needsSettings ? (
    <Button title="Open settings" variant="text" onPress={() => void Linking.openSettings().catch(() => {})} style={styles.center} />
  ) : null;
  let body: ReactNode;
  let footer: ReactNode;

  if (!d) {
    const loadErr = dayQ.error as (Error & { status?: number }) | null;
    // A load the server failed (not a validation problem) gets the same way out as a failed save.
    const outage = !!loadErr && (!loadErr.status || loadErr.status >= 500);
    body = loadErr ? (
      <Banner tone="danger" title="Couldn’t load your timesheet" message={loadErr.message || 'Check your connection and try again.'} />
    ) : (
      <View style={styles.stack} accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Skeleton height={112} radius={radius.md} />
        <Skeleton height={20} width="40%" />
        <Skeleton height={120} radius={radius.md} />
      </View>
    );
    footer = loadErr ? (
      <>
        {statusLine}
        <Button title="Try again" variant="primary" onPress={() => void dayQ.refetch()} loading={dayQ.isFetching} disabled={busy} />
        {outage && !entryMode ? (
          <Button title="Clock out without a timesheet" variant="danger" size="md" loading={busy} onPress={() => void clockOut(true)} />
        ) : null}
        {settingsBtn}
        {cancelBtn}
      </>
    ) : (
      cancelBtn
    );
  } else if (pickingRow) {
    body = (
      <ProjectPicker
        projects={list<Project>(projectsQ.data)}
        loading={projectsQ.isLoading}
        error={projectsQ.error ? (projectsQ.error as Error).message : null}
        onRetry={() => void projectsQ.refetch()}
        current={pickingRow.kekaCode ? `${pickingRow.kekaCode} · ${pickingRow.projectName}` : pickingRow.projectName}
        onPick={(p) => {
          setRow(pickingRow.key, p ? { projectId: p.id, kekaCode: p.kekaCode || '', projectName: p.name || '' } : { projectId: null, kekaCode: '', projectName: '' });
          setPicking(null);
        }}
      />
    );
    footer = <Button title="Back" variant="text" onPress={() => setPicking(null)} style={styles.center} />;
  } else {
    body = (
      <>
        <DaySummary worked={logged} logged={filled} unlogged={unlogged} over={over} today={isToday} note={!entryMode && weekly ? 'Weekly timesheet · due before Monday' : null} />

        {/* The one notice: last week still owes days (it will stop Monday's clock-in). */}
        {owed && !entryMode ? (
          <Banner
            tone="warning"
            title="Last week isn’t filled in"
            message={`${owedDays.length || 'Some'} day${owedDays.length === 1 ? '' : 's'} left${owedDays.length ? ` (${owedDays.map((x) => shortDay(x, thisYear)).join(' · ')})` : ''}. You can’t clock in until they’re done.`}
          />
        ) : null}

        <View style={styles.listHead}>
          <Text variant="labelStrong" muted numberOfLines={1} style={styles.flexText} accessibilityRole="header">
            {rows.length ? `Entries · ${rows.length}` : 'Entries'}
          </Text>
          {!entryMode && rows.length ? (
            <Button title={editing ? 'Done' : 'Edit entries'} variant="text" size="sm" disabled={busy} onPress={() => setEditing((v) => !v)} />
          ) : null}
        </View>

        {rows.map((r, i) => (
          <EntryCard
            key={r.key}
            r={r}
            index={i}
            editing={editing}
            live={!entryMode && isLive(r)}
            problem={problem?.key === r.key ? problem : null}
            onChange={(patch) => setRow(r.key, patch)}
            onRemove={() => {
              clearProblem(r.key);
              changed();
              setRows((rs) => rs.filter((x) => x.key !== r.key));
            }}
            onPick={() => setPicking(r.key)}
          />
        ))}

        {!rows.length ? (
          <Text variant="label" muted align="center" numberOfLines={2} style={styles.emptyText}>
            {!entryMode ? 'Nothing added yet. Add what you worked on, or just clock out.' : isToday ? 'Nothing added yet.' : 'Nothing added for this day yet.'}
          </Text>
        ) : null}
        {!entryMode && running.length ? (
          <Text variant="caption" muted align="center" numberOfLines={2}>
            {running.length === 1 ? 'Clocking out pauses your running task timer.' : `Clocking out pauses your ${running.length} running task timers.`}
          </Text>
        ) : null}
        {editing || !rows.length ? (
          <Button
            title={rows.length ? 'Add more work' : 'Add what you worked on'}
            variant="text"
            icon={<Plus />}
            disabled={busy}
            onPress={addRow}
            style={styles.center}
          />
        ) : null}
      </>
    );
    footer = (
      <>
        {statusLine ??
          (!entryMode && !weekly && unlogged > 0 ? (
            // Said in place, right above the one button that does it (the day summary shows it too).
            <Text variant="label" color={palette.warningInk} align="center" numberOfLines={2} accessibilityLiveRegion="polite">
              {`${tsFmt(unlogged)} will be saved as unlogged time.`}
            </Text>
          ) : null)}
        <Button
          title={entryMode ? 'Save' : 'Clock out'}
          variant="primary"
          loading={busy}
          onPress={entryMode ? () => void saveEntries() : () => void clockOut(weeklyLater)}
        />
        {settingsBtn}
        {/* Only after the server actually refused a save — never for a fixable mistake. */}
        {!entryMode && serverFailed && !saved && !needsSettings ? (
          <Button title="Clock out without a timesheet" variant="danger" size="md" disabled={busy} onPress={() => void clockOut(true)} />
        ) : null}
        {cancelBtn}
      </>
    );
  }

  const subtitle = workDate
    ? entryMode
      ? shortDay(workDate, thisYear)
      : `${shortDay(workDate, thisYear)}${d?.inTime ? ` · clocked in at ${prettyHm(d.inTime)}` : ''}`
    : undefined;

  return (
    <Sheet
      visible
      onClose={busy ? () => {} : picking ? () => setPicking(null) : onCancel}
      title={pickingRow ? 'Project code' : entryMode ? 'Timesheet' : 'Clock out'}
      subtitle={pickingRow ? undefined : subtitle}
      footer={footer}>
      {body}
    </Sheet>
  );
}

// "You worked 8h 12m" over "6h 40m logged · 1h 32m unlogged" — the day's state, first.
function DaySummary({
  worked,
  logged,
  unlogged,
  over,
  today,
  note,
}: {
  worked: number;
  logged: number;
  unlogged: number;
  over: number;
  today: boolean;
  note?: string | null;
}) {
  const tail = over ? `${tsFmt(over)} more than you worked` : unlogged ? `${tsFmt(unlogged)} unlogged` : 'nothing unlogged';
  const tailColor = over ? palette.dangerInk : unlogged ? palette.warningInk : palette.successInk;
  // How much of the time worked is logged: the timesheet colour, green once it is all logged, red over.
  const share = worked > 0 ? logged / worked : logged > 0 ? 1 : 0;
  const barColor = over ? palette.danger : !unlogged && logged > 0 ? palette.success : moduleTone.timesheets.fg;
  return (
    <View style={styles.summary} accessible accessibilityLabel={`You worked ${tsFmt(worked)}${today ? ' today' : ''}. ${tsFmt(logged)} logged, ${tail}.`}>
      <Text variant="label" muted numberOfLines={1}>
        {today ? 'You worked today' : 'You worked'}
      </Text>
      <Text variant="title" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} color={moduleTone.timesheets.fg}>
        {tsFmt(worked)}
      </Text>
      <ProgressBar value={share} color={barColor} trackColor={palette.surface} style={styles.summaryBar} />
      <Text variant="label" numberOfLines={2}>
        <Text variant="labelStrong">{tsFmt(logged)}</Text> logged · <Text variant="labelStrong" color={tailColor}>{tail}</Text>
      </Text>
      {note ? (
        <Text variant="caption" muted numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

// One entry. In the summary only the note is editable (it is the one thing a timer cannot know);
// "Edit entries" adds the project, the times and Remove. A running timer's row keeps its times and
// stays on the sheet until Clock out pauses it (its end is set then).
function EntryCard({
  r,
  index,
  editing,
  live,
  problem,
  onChange,
  onRemove,
  onPick,
}: {
  r: Row;
  index: number;
  editing: boolean;
  live: boolean;
  problem: Problem | null;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  onPick: () => void;
}) {
  const mins = minutesBetween(r.startTime, r.endTime);
  const project = r.kekaCode ? `${r.kekaCode} · ${r.projectName || ''}`.replace(/ · $/, '') : r.projectName;
  // A task timer's line keeps the project it came with; one that came without may be given one.
  const showPicker = editing && !r.fixedProject;
  const title = showPicker ? `Entry ${index + 1}` : project || 'No project yet';
  const times =
    HHMM.test(r.startTime || '') || HHMM.test(r.endTime || '')
      ? `${prettyHm(r.startTime)} – ${live ? 'now' : prettyHm(r.endTime)}`
      : 'No times yet';
  const line2 = [times, r.taskTitle || null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.entry, !!problem && styles.entryProblem]}>
      <View style={styles.entryHead}>
        <View style={styles.flexText}>
          <Text variant="bodyStrong" numberOfLines={1} color={project || showPicker ? palette.text : palette.textMuted}>
            {title}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {line2}
          </Text>
        </View>
        <Text variant="labelStrong" tabular color={mins > 0 ? palette.text : palette.textMuted} style={styles.fixed}>
          {mins > 0 ? tsFmt(mins) : '—'}
        </Text>
        {editing && !live ? (
          <IconButton size={36} tone="surface" accessibilityLabel={`Remove entry ${index + 1}`} onPress={onRemove}>
            <X size={18} color={palette.dangerInk} strokeWidth={2} />
          </IconButton>
        ) : null}
      </View>
      {showPicker ? (
        <Pressable
          onPress={onPick}
          style={({ pressed }) => [styles.pickField, problem?.field === 'project' && styles.fieldError, pressed && styles.pickPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Project code: ${project || 'not chosen'}`}>
          <Search size={18} color={palette.textMuted} />
          <Text variant="body" color={project ? palette.text : palette.textFaint} numberOfLines={1} style={styles.flexText}>
            {project || 'Pick a project code'}
          </Text>
          <ChevronDown size={18} color={palette.textMuted} />
        </Pressable>
      ) : null}
      {editing && live ? (
        <Text variant="caption" muted numberOfLines={2}>
          Running timer: its times are set when you clock out.
        </Text>
      ) : editing ? (
        <FieldPair>
          <TimeField label="Start" value={r.startTime || null} placeholder="Start" onChange={(v) => onChange({ startTime: v })} />
          <TimeField label="End" value={r.endTime || null} placeholder="End" onChange={(v) => onChange({ endTime: v })} />
        </FieldPair>
      ) : null}
      <TextField
        value={r.comment ?? ''}
        onChangeText={(t) => onChange({ comment: t })}
        placeholder="What did you work on?"
        accessibilityLabel={`Entry ${index + 1}: what did you work on`}
        error={problem?.field === 'comment' ? 'Required' : null}
        maxLength={500}
        multiline
      />
    </View>
  );
}

// Search-as-you-type over active project codes. An empty query lists nothing (hundreds of codes is
// noise), and an empty result says why — nothing matched vs nothing loaded — like the web's search.
function ProjectPicker({
  projects,
  loading,
  error,
  onRetry,
  current,
  onPick,
}: {
  projects: Project[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  current: string;
  onPick: (p: Project | null) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const all = Array.isArray(projects) ? projects.filter((p) => p && typeof p === 'object') : [];
  const matches = needle
    ? all
        .filter((p) => str(p.kekaCode).toLowerCase().includes(needle) || str(p.name).toLowerCase().includes(needle))
        .sort((a, b) => str(a.name).localeCompare(str(b.name)))
        .slice(0, 60)
    : [];
  return (
    <>
      <TextField
        autoFocus
        value={q}
        onChangeText={setQ}
        placeholder="Search project code or name"
        accessibilityLabel="Search project code or name"
        autoCapitalize="none"
        autoCorrect={false}
        left={<Search size={18} color={palette.textMuted} />}
      />
      {current ? (
        <View style={styles.clearRow}>
          <Text variant="label" muted numberOfLines={2} style={styles.flexText}>
            Picked: <Text variant="labelStrong">{current}</Text>
          </Text>
          <Button title="Clear" variant="danger" size="sm" onPress={() => onPick(null)} style={styles.fixed} />
        </View>
      ) : null}
      {error ? (
        <Banner tone="danger" title="Couldn’t load project codes" message={error} action={{ label: 'Try again', onPress: onRetry }} />
      ) : loading ? (
        <View style={styles.stack} accessibilityLabel="Loading" accessibilityRole="progressbar">
          <Skeleton height={48} radius={radius.md} />
          <Skeleton height={48} radius={radius.md} />
          <Skeleton height={48} radius={radius.md} />
        </View>
      ) : !needle ? (
        <Text variant="label" muted>
          Type a project code or name. Not sure? Ask your manager.
        </Text>
      ) : !matches.length ? (
        <Text variant="label" muted>
          {all.length ? `Nothing matches “${q.trim()}”.` : 'No project codes have loaded. Close and open this again.'}
        </Text>
      ) : (
        <View style={styles.options}>
          {matches.map((p, i) => (
            <Pressable
              key={p.id ?? i}
              onPress={() => onPick(p)}
              accessibilityRole="button"
              accessibilityLabel={[p.kekaCode, p.name].filter(Boolean).join(' ')}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: palette.surfaceMuted }]}>
              <View style={styles.flexText}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {p.name || '—'}
                </Text>
                {p.kekaCode ? (
                  <Text variant="caption" color={palette.primaryText} numberOfLines={1}>
                    {p.kekaCode}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

// A solid panel inside the sheet, read inside the factory so it follows light / dark.
const panel = () =>
  ({
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassLine,
  }) as const;

const styles = themedStyles(() => ({
  stack: { gap: space.sm },
  flexText: { flex: 1, minWidth: 0 },
  fixed: { flexShrink: 0 },
  center: { alignSelf: 'center' },
  summary: { borderRadius: radius.md, backgroundColor: moduleTone.timesheets.bg, padding: space.md, gap: 2 },
  summaryBar: { marginVertical: space.xxs },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, marginBottom: -space.xs },
  entry: { ...panel(), padding: space.md, gap: space.sm },
  entryProblem: { borderColor: palette.danger },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  pickField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
  fieldError: { borderColor: palette.danger },
  pickPressed: { backgroundColor: palette.surface },
  emptyText: { paddingVertical: space.sm },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  options: { gap: space.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.glassLine,
  },
}));
