// Start / Pause / Resume / End for My Tasks — the web's act → OTP gate → doAct, actBk → doActBk,
// requestOtp / verifyAndProceed and the Complete Task modal (dash.html ~L26594–26878), with the
// same request bodies in the same order.
//
// The code gate: Start and End need a 6-digit code when someone else is waiting on the work — the
// ticket's raiser (requesterName), the booking's requester (requestedBy) or the task's creator — and
// that person has a DASH account. The code appears on THEIR Home screen ("Needs you"); the assignee
// types it into the kit's OtpBoxes, which check it as soon as the sixth digit is in. Nobody to ask,
// asking yourself, or being in the IT & Admin department skips the gate, exactly as on the web. The
// account list is loaded before deciding, so a slow network never silently skips a code that should
// have been asked for.
//
// Ending a task is the Payno confirm flow: a sheet with a floating ×, the task as its subtitle, You →
// who approves it (FromToCards), an optional note and "Swipe to end task"; then (after the code, when
// one is needed) a SuccessSheet says where it went. One sheet at a time: when one gives way to the
// next, the next opens once the first has closed (iOS can't present a Modal while another is closing).
//
// Rows change optimistically (as the web's do) and are put back if the server refuses the write.
// Usage: const flow = useTaskFlow(); … flow.act(id, 'pause'); flow.openComplete(task); {flow.ui}

import { useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, KeyRound, RotateCw, UserRound } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { isApiError } from '@/api/client';
import { type Project, reimbursementKeys } from '@/api/reimbursements';
import { departmentsQuery, directoryUsersQuery } from '@/api/support';
import {
  type Booking,
  fetchMyTasks,
  myTasksKey,
  type OtpMode,
  postTask,
  putBooking,
  putTask,
  reclaimRemaining,
  releaseRemaining,
  requestOtp,
  resolveTicket,
  setAvailability,
  type Task,
  taskKeys,
  verifyOtp,
} from '@/api/tasks';
import { useSession } from '@/auth/session';
import { elapsedOf, isItAdminDept, isRunning, workedLabel, workedSeconds } from '@/features/tasks/model';
import { space } from '@/theme/tokens';
import {
  Button,
  FieldMessage,
  FromToCards,
  type FromToItem,
  haptic,
  ModuleBadge,
  OtpBoxes,
  Sheet,
  SuccessSheet,
  type SummaryItem,
  SummaryCard,
  SwipeToConfirm,
  Text,
  TextField,
  toast,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

type Action = 'start' | 'pause' | 'resume' | 'submit';
type OtpState = { mode: OtpMode; refId: string; otpType: 'start' | 'submit'; title: string; requesterName: string; onConfirm: () => Promise<void> };
type DoneState = { title: string; subtitle: string; rows: SummaryItem[] };
type SheetKind = 'end' | 'otp' | 'done';

/** Wait for one sheet's close before the next opens (iOS can't present a Modal while one is closing). */
const SHEET_SWAP_MS = 380;

const ok = () => haptic.success();
const bad = () => haptic.error();
const str = (v: unknown) => (v == null ? '' : String(v).trim());

/** Who signs off ended work: the booking's requester, nobody for an IT ticket, else the manager. */
function approverOf(task: Task): { to: FromToItem; note: string; sentTo: string } {
  if (task.source === 'ticket' && task.ticketId) {
    return { to: { title: 'Done', subtitle: 'Closes the IT ticket', icon: CircleCheck }, note: 'Ending it also closes the IT ticket.', sentTo: '' };
  }
  if (task.source === 'booking' && task.bookingId) {
    const who = str(task.requestedBy) || str(task.requesterName);
    return {
      to: who ? { title: who, subtitle: 'Approves it', avatar: { name: who } } : { title: 'The requester', subtitle: 'Approves it', icon: UserRound },
      note: `${who || 'The requester'} sees your note.`,
      sentTo: who || 'the requester',
    };
  }
  return { to: { title: 'Your manager', subtitle: 'Approves it', icon: UserRound }, note: 'Your manager sees your note.', sentTo: 'your manager' };
}

export function useTaskFlow() {
  const qc = useQueryClient();
  const myName = useSession((s) => s.user?.name) || '';
  // Which sheet is up, and each sheet's content (kept while it closes, so it never blanks mid-fade).
  const [open, setOpen] = useState<SheetKind | null>(null);
  const openRef = useRef<SheetKind | null>(null);
  const closedAt = useRef(0);
  const [endFor, setEndFor] = useState<Task | null>(null);
  const [otp, setOtp] = useState<OtpState | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [ending, setEnding] = useState(false);

  // ── one sheet at a time ─────────────────────────────────────────────────────────────────────
  const dismiss = () => {
    if (openRef.current) closedAt.current = Date.now();
    openRef.current = null;
    setOpen(null);
  };
  const present = (kind: SheetKind) => {
    const cur = openRef.current;
    if (cur === kind) return;
    if (cur) dismiss();
    openRef.current = kind;
    const wait = SHEET_SWAP_MS - (Date.now() - closedAt.current);
    if (wait > 0) {
      setTimeout(() => {
        if (openRef.current === kind) setOpen(kind);
      }, wait);
    } else {
      setOpen(kind);
    }
  };

  const me = () => useSession.getState().user;
  const key = () => myTasksKey(me()?.id, me()?.name || '');
  // The cached list is persisted to disk, so check it is really an array before using it.
  const listOf = (x: unknown): Task[] => (Array.isArray(x) ? (x as Task[]).filter((t) => t && typeof t === 'object') : []);
  const getTasks = () => listOf(qc.getQueryData<Task[]>(key()));
  const patch = (id: string, p: Partial<Task>) => qc.setQueryData<Task[]>(key(), (list) => listOf(list).map((t) => (t.id === id ? { ...t, ...p } : t)));
  const setAvail = (status: 'busy' | 'available') => {
    const id = me()?.id;
    if (id) void setAvailability(id, status);
  };

  // Serialise actions: a second tap while a request is in flight is ignored.
  const run = async (id: string, fn: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    try {
      await fn();
    } catch (e: any) {
      bad();
      Alert.alert('Something went wrong', e?.message || 'Try again.');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  // ── the OTP gate ────────────────────────────────────────────────────────────────────────────
  const itAdminExempt = async () => {
    const u = me();
    if (u?.role === 'it_admin') return true;
    try {
      const depts = await qc.ensureQueryData(departmentsQuery(u?.id));
      return isItAdminDept((Array.isArray(depts) ? depts : []).find((d) => d?.id === u?.dept)?.name || '', u?.role);
    } catch {
      return false; // when unsure, ask for the code
    }
  };

  // The name of the person who must read out a code, or null when no code is needed.
  const requesterFor = async (name: string): Promise<string | null> => {
    const u = me();
    if (!u || (await itAdminExempt()) || !name) return null;
    const users = await qc.ensureQueryData(directoryUsersQuery(u.id)).catch(() => {
      throw new Error('Couldn’t check who has to give you the code. Check your connection and try again.');
    });
    const req = (Array.isArray(users) ? users : []).find((x) => x?.name === name);
    if (!req || req.name === u.name) return null;
    return req.name;
  };

  const openOtp = async (s: OtpState) => {
    const r = await requestOtp(s.mode, s.refId, s.otpType);
    if (isApiError(r)) {
      bad();
      Alert.alert('Couldn’t get a code', r.error);
      return false;
    }
    setCode('');
    setOtpError('');
    setVerifying(false);
    setOtp(s);
    present('otp');
    return true;
  };

  // ── ended: where it went ─────────────────────────────────────────────────────────────────────
  const showDone = (task: Task, worked: number, closed: boolean) => {
    const sentTo = approverOf(task).sentTo;
    setDone({
      title: closed ? 'Task done' : 'Task ended',
      subtitle: closed ? 'The IT ticket is closed too.' : `Sent to ${sentTo} for approval.`,
      rows: [
        { key: 'task', label: 'Task', value: str(task.title) || 'Task' },
        { key: 'time', label: 'Time worked', value: workedLabel(worked) },
        closed ? { key: 'status', label: 'Status', value: 'Done', status: 'done' } : { key: 'status', label: 'Status', value: 'Waiting for approval', status: 'pending' },
      ],
    });
    present('done');
  };

  // ── the writes (web: doAct) ───────────────────────────────────────────────────────────────────
  const syncAfterEnd = async (id: string, check: boolean) => {
    const u = me();
    if (!u?.name) return;
    try {
      const fresh = await fetchMyTasks(u.name);
      qc.setQueryData(myTasksKey(u.id, u.name), fresh);
      const saved = listOf(fresh).find((t) => t.id === id);
      if (check && saved && !['submitted', 'completed', 'reviewed'].includes(saved.status || '')) {
        Alert.alert('Task not ended', 'It didn’t save as ended. Please try ending it again.');
      }
    } catch {
      // Keep what is on screen; the next refresh corrects it.
    }
    void qc.invalidateQueries({ queryKey: taskKeys.bookings(u.id) });
  };

  const doAct = async (id: string, a: Action, otpVerified: boolean, remarksText?: string) => {
    const u = me();
    if (!u) return;
    await qc.cancelQueries({ queryKey: taskKeys.mine(u.id) });
    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const tasks = getTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const cur = elapsedOf(task, now);
    const prev: Partial<Task> = {
      status: task.status,
      startedAt: task.startedAt ?? null,
      firstStartedAt: task.firstStartedAt ?? null,
      lastEndedAt: task.lastEndedAt ?? null,
      elapsedSeconds: task.elapsedSeconds,
    };
    const fail = (verb: string, msg: string) => {
      patch(id, prev);
      bad();
      Alert.alert(`Couldn’t ${verb} this task`, msg);
    };
    const verified = otpVerified ? { otpVerifiedAt: nowISO } : {};

    if (a === 'start') {
      const body = { status: 'in_progress', startedAt: nowISO, firstStartedAt: nowISO, lastEndedAt: null, elapsedSeconds: 0 };
      patch(id, body);
      const r = await putTask(id, { ...body, ...verified });
      if (isApiError(r)) return fail('start', r.error);
      ok();
      toast.show('Task started');
      setAvail('busy');
      return;
    }

    if (a === 'pause') {
      const body = { startedAt: null, elapsedSeconds: cur, lastEndedAt: nowISO };
      patch(id, body);
      const r = await putTask(id, body);
      if (isApiError(r)) return fail('pause', r.error);
      ok();
      const stillActive = tasks.some((t) => t.id !== id && isRunning(t));
      if (!stillActive) setAvail('available');
      // Pausing with nothing else running frees the rest of this booking's blocked time.
      if (task.bookingId && !stillActive) void releaseRemaining(task.bookingId, id);
      return;
    }

    if (a === 'resume') {
      patch(id, { startedAt: nowISO });
      const r = await putTask(id, { startedAt: nowISO });
      if (isApiError(r)) return fail('resume', r.error);
      ok();
      setAvail('busy');
      if (task.bookingId) void reclaimRemaining(task.bookingId);
      return;
    }

    // ── End (submit) ──
    // Who finished it, when, and their own account of it. actorId lets the server check this person
    // may complete the task; it is never stored.
    const stamp = { completionRemarks: (remarksText || '').trim(), completedBy: u.name || '', completedAt: nowISO };
    const doneBody = { ...stamp, actorId: u.id };
    const stillActive = tasks.some((t) => t.id !== id && t.status === 'in_progress');
    patch(id, { status: 'submitted', startedAt: null, elapsedSeconds: cur });

    if (task.source === 'ticket' && task.ticketId) {
      // IT ticket task: no approval step — complete it and resolve the ticket behind it.
      const r = await putTask(id, { status: 'completed', lastEndedAt: nowISO, elapsedSeconds: cur, ...verified, ...doneBody });
      if (isApiError(r)) return fail('complete', r.error);
      patch(id, { status: 'completed', ...stamp });
      const tr = await resolveTicket(task.ticketId, u.name || '');
      if (isApiError(tr)) {
        Alert.alert('Ticket still open', `Your task is done, but the ticket couldn’t be closed (${tr.error}). Please tell IT Admin.`);
      } else {
        showDone(task, cur, true);
      }
      ok();
      if (!stillActive) setAvail('available');
      void syncAfterEnd(id, false);
      return;
    }

    if (task.source === 'booking' && task.bookingId) {
      // Booking work goes to the requester for review.
      const r = await putTask(id, { status: 'submitted', startedAt: null, lastEndedAt: nowISO, elapsedSeconds: cur, submitNote: '', ...verified, ...doneBody });
      if (isApiError(r)) return fail('end', r.error);
      // Release any unused booked time BEFORE the booking leaves its active state.
      await releaseRemaining(task.bookingId, id);
      await putBooking(task.bookingId, { status: 'pending_review', markedDoneBy: u.name || '', markedDoneAt: new Date().toISOString() });
      patch(id, { status: 'submitted', ...stamp });
    } else {
      const r = await putTask(id, { status: 'submitted', startedAt: null, lastEndedAt: nowISO, elapsedSeconds: cur, ...verified, ...doneBody });
      if (isApiError(r)) return fail('end', r.error);
      patch(id, stamp);
      // (The web also PUTs /resource_requests/:id here; that route no longer exists on the server.)
    }
    ok();
    showDone(task, cur, false);
    if (!stillActive) setAvail('available');
    void syncAfterEnd(id, true);
  };

  // A booking with no task yet: its first Start creates the task (same deterministic id the
  // server's approval auto-create uses, so the two can never produce two rows).
  const doActBk = async (bk: Booking, otpVerified: boolean) => {
    const u = me();
    if (!u) return;
    const nowISO = new Date().toISOString();
    const cachedProjects = qc.getQueryData<Project[]>(reimbursementKeys.projects(u.id));
    const projects = Array.isArray(cachedProjects) ? cachedProjects.filter(Boolean) : [];
    const keka = bk.kekaCode || projects.find((p) => p.name === bk.project)?.kekaCode || bk.project || '';
    const timeLabel = bk.startTime && bk.endTime ? ` (${bk.startTime}–${bk.endTime})` : '';
    const newTask: Task = {
      id: `atk_bk_${bk.id}`,
      title: `Assigned: ${bk.requestedBy || ''} — ${keka || 'Booking'}${timeLabel}`,
      assignee: u.name || '',
      assigneeId: u.id,
      project: keka,
      kekaCode: keka,
      status: 'in_progress',
      dept: bk.profDept || null,
      bookingId: bk.id,
      bookingDate: bk.date || '',
      startTime: bk.startTime || '',
      endTime: bk.endTime || '',
      requestedBy: bk.requestedBy || '',
      comments: bk.comments || '',
      shootingLocation: bk.shootingLocation || '',
      source: 'booking',
      timestamps: {},
      elapsedSeconds: 0,
      startedAt: nowISO,
      ...(otpVerified ? { otpVerifiedAt: nowISO } : {}),
    };
    const r = await postTask(newTask);
    if (isApiError(r)) {
      bad();
      Alert.alert('Couldn’t start this work', r.error);
      return;
    }
    const saved: Task = { ...newTask, ...(r.task || {}) };
    qc.setQueryData<Task[]>(key(), (list) => {
      const l = listOf(list);
      return l.some((t) => t.id === saved.id) ? l.map((t) => (t.id === saved.id ? saved : t)) : [...l, saved];
    });
    ok();
    toast.show('Task started');
  };

  // ── public actions ────────────────────────────────────────────────────────────────────────────
  const gateThenDo = async (task: Task, a: 'start' | 'submit', remarksText?: string) => {
    const reqName = await requesterFor(task.requesterName || task.requestedBy || task.creator || '');
    if (!reqName) {
      await doAct(task.id, a, false, remarksText);
      return 'done' as const;
    }
    const opened = await openOtp({
      mode: 'task',
      refId: task.id,
      otpType: a,
      title: task.title || 'Task',
      requesterName: reqName,
      onConfirm: () => doAct(task.id, a, true, remarksText),
    });
    return opened ? ('otp' as const) : ('done' as const);
  };

  const act = (id: string, a: 'start' | 'pause' | 'resume') =>
    run(id, async () => {
      const tasks = getTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      if (a === 'start') {
        // One task at a time: pause (or end) the running one first.
        if (tasks.some(isRunning)) return;
        await gateThenDo(task, 'start');
        return;
      }
      await doAct(id, a, false);
    });

  const startBooking = (bk: Booking) =>
    run(`bk_${bk.id}`, async () => {
      const tasks = getTasks();
      if (tasks.some(isRunning)) return;
      const existing = tasks.find((t) => t.bookingId === bk.id || (t.source === 'booking' && t.requestedBy === bk.requestedBy && t.bookingDate === bk.date));
      if (existing) {
        await gateThenDo(existing, 'start');
        return;
      }
      const reqName = await requesterFor(bk.requestedBy || '');
      if (!reqName) {
        await doActBk(bk, false);
        return;
      }
      // No task row exists yet, so the code is generated against the booking itself.
      await openOtp({
        mode: 'booking',
        refId: bk.id,
        otpType: 'start',
        title: `${bk.resource || ''} — ${bk.kekaCode || bk.project || 'Booking'}`,
        requesterName: reqName,
        onConfirm: () => doActBk(bk, true),
      });
    });

  const openComplete = (task: Task) => {
    if (busyRef.current) return;
    setRemarks('');
    setEnding(false);
    setEndFor(task);
    present('end');
  };

  const confirmComplete = async () => {
    if (!endFor || openRef.current !== 'end' || busyRef.current) return;
    const task = endFor;
    const text = remarks;
    busyRef.current = true;
    setBusyId(task.id);
    setEnding(true);
    try {
      await gateThenDo(task, 'submit', text);
      // Ended (the success sheet took over), refused, or no code could be had: the end sheet goes.
      // When a code is needed the code sheet has already taken its place.
      if (openRef.current === 'end') dismiss();
    } catch (e: any) {
      bad();
      if (openRef.current === 'end') dismiss();
      Alert.alert('Something went wrong', e?.message || 'Try again.');
    } finally {
      busyRef.current = false;
      setBusyId(null);
      setEnding(false);
    }
  };

  // `typed` is the code just entered: the boxes check it as soon as the sixth digit lands.
  const verify = async (typed?: string) => {
    const value = typed ?? code;
    if (!otp || openRef.current !== 'otp' || verifying) return;
    if (value.length !== 6) return setOtpError('Enter the 6-digit code');
    setVerifying(true);
    setOtpError('');
    const r = await verifyOtp(otp.mode, otp.refId, otp.otpType, value);
    if (isApiError(r)) {
      setVerifying(false);
      setOtpError(r.error);
      bad();
      return;
    }
    const s = otp;
    dismiss();
    setVerifying(false);
    await run(s.mode === 'booking' ? `bk_${s.refId}` : s.refId, s.onConfirm);
  };

  const resend = async () => {
    if (!otp || openRef.current !== 'otp' || resending) return;
    setResending(true);
    setCode('');
    setOtpError('');
    const r = await requestOtp(otp.mode, otp.refId, otp.otpType);
    setResending(false);
    if (isApiError(r)) Alert.alert('Couldn’t get a code', r.error);
  };

  const closeEnd = () => {
    if (ending) return;
    dismiss();
  };
  const closeOtp = () => {
    if (verifying) return;
    dismiss();
  };

  const endTask = endFor;
  const approver = endTask ? approverOf(endTask) : null;
  const endWorked = endTask && !isRunning(endTask) ? workedSeconds(endTask) : null;

  const ui = (
    <>
      {/* End task: the task → who approves it, an optional note, and the swipe. */}
      <Sheet
        visible={open === 'end'}
        onClose={closeEnd}
        floatingClose
        dirty={!!remarks.trim() && !ending}
        title="End this task?"
        subtitle={endTask?.title || 'Task'}
        footer={
          <>
            <SwipeToConfirm label="Swipe to end task" onConfirm={() => void confirmComplete()} loading={ending} />
            {approver ? (
              <Text variant="caption" muted align="center" numberOfLines={2}>
                {approver.note}
              </Text>
            ) : null}
          </>
        }>
        {endTask && approver ? (
          <>
            <FromToCards
              from={{ title: 'You', subtitle: endWorked != null ? `${workedLabel(endWorked)} worked` : 'Timer running', avatar: { name: myName || 'You' } }}
              to={approver.to}
            />
            <TextField
              label="What did you do? (optional)"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              placeholder="A short note about the work"
              editable={!ending}
            />
          </>
        ) : null}
      </Sheet>

      {/* The requester's code. */}
      <Sheet
        visible={open === 'otp'}
        onClose={closeOtp}
        title={otp ? `${otp.otpType === 'start' ? 'Start' : 'End'} code` : undefined}
        subtitle={otp?.title}
        footer={<Button title="Confirm" variant="primary" icon={<Check />} loading={verifying} disabled={code.length !== 6} onPress={() => void verify()} />}>
        {otp ? (
          <>
            <View style={styles.otpHead}>
              <ModuleBadge module="tasks" icon={KeyRound} size={48} />
              <Text variant="body" style={styles.otpText}>
                Ask <Text variant="bodyStrong">{otp.requesterName || 'the requester'}</Text> for the code on their DASH Home.
              </Text>
            </View>
            <OtpBoxes
              value={code}
              onChange={(v) => {
                setCode(v);
                setOtpError('');
              }}
              onComplete={(v) => void verify(v)}
              error={!!otpError}
              disabled={verifying}
              accessibilityLabel={`${otp.otpType === 'start' ? 'Start' : 'End'} code`}
            />
            {otpError ? <FieldMessage error={otpError} /> : null}
            <Button
              title="Send a new code"
              variant="text"
              size="md"
              icon={<RotateCw />}
              loading={resending}
              disabled={verifying}
              onPress={resend}
              style={styles.resend}
            />
          </>
        ) : null}
      </Sheet>

      {/* Ended: where it went. */}
      <SuccessSheet visible={open === 'done'} onClose={dismiss} title={done?.title ?? 'Task ended'} subtitle={done?.subtitle}>
        {done ? <SummaryCard rows={done.rows} /> : null}
      </SuccessSheet>
    </>
  );

  return { act, startBooking, openComplete, busyId, ui };
}

const styles = themedStyles(() => ({
  otpHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  otpText: { flex: 1, minWidth: 0 },
  resend: { alignSelf: 'center' },
}));
