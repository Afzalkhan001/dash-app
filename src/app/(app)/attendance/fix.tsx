// Request a fix — the Fix attendance form (the web's RegularizationPanel form, dash.html ~L4746), in the
// Payno flow: NavHeader, the form, then "Review request" in the sticky bar opens a ConfirmSheet (what
// is on record → your fix, a SummaryCard of the request, SwipeToConfirm "Swipe to send request") and a
// sent request ends on a SuccessSheet. Opened from Fix attendance ("Request a fix") or from a calendar
// day (?date=YYYY-MM-DD starts on that day).
//
// What to fix is chosen with SelectTiles (Clock-in · Clock-out · Both). It only decides which time
// fields show and which times are sent: the request is the exact body the server takes (hr_time.js
// POST /hr/regularizations): { work_date, in_time|null, out_time|null, reason }. The choice starts on
// what the day needs (a day with a clock-in and no clock-out starts on Clock-out). As before the
// tiles, at least one time is needed; with "Both", a time left empty is sent as "no change" (null).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftRight, CalendarClock, LogIn, LogOut, PencilLine } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type AttendanceRow, createRegularization, useAttendanceSettings } from '@/api/attendance';
import { isApiError } from '@/api/client';
import { useAttendanceMonth } from '@/api/hr';
import { addDays, clockTime, plainServerText, prettyHm, shortDay } from '@/features/attendance/format';
import { useTodayIst } from '@/features/attendance/use-now';
import { useAccess } from '@/lib/use-access';
import { moduleTone, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  ActionBar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  DateField,
  EmptyState,
  FieldPair,
  haptic,
  NavHeader,
  Screen,
  SelectTiles,
  shouldStack,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  TimeField,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

type Form = { work_date: string; in_time: string; out_time: string; reason: string };
type What = 'in' | 'out' | 'both';
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// Keeps a short phrase ("In 9:42 AM") on one line, so a wrapping line breaks between phrases.
const NBSP = String.fromCharCode(0xa0);
const keep = (s: string) => s.replace(/\s/g, NBSP);
/** How long a sheet takes to fade out, so the next layer (or screen) only opens once it has gone. */
const SHEET_FADE_MS = 280;

export default function RequestFixScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const qc = useQueryClient();
  const access = useAccess();
  const today = useTodayIst();
  // The swipe's label is shortened where it would be cut (320 dp, large text), as on Apply leave.
  const shortSwipe = shouldStack(useLayout(), { below: 'narrow' });
  const thisYear = today.slice(0, 4);
  const on = access.sections.regularization;
  const settingsQ = useAttendanceSettings(on && access.sections.clock);
  const rawWindow = settingsQ.data?.regularizationWindowDays;
  const windowDays = typeof rawWindow === 'number' && Number.isFinite(rawWindow) ? rawWindow : 30;
  const [f, setF] = useState<Form>(() => ({ work_date: isYmd(params.date) ? params.date : '', in_time: '', out_time: '', reason: '' }));
  const [picked, setPicked] = useState<What | null>(null);
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  // What is on record for the chosen day, so the person fixes against it.
  const monthQ = useAttendanceMonth(f.work_date ? f.work_date.slice(0, 7) : today.slice(0, 7), on && !!f.work_date);
  const records = Array.isArray(monthQ.data?.records) ? (monthQ.data.records as AttendanceRow[]) : [];
  const rec = f.work_date ? records.find((r) => r?.work_date === f.work_date) : undefined;
  // Start on what the day needs; the person's own pick wins once made.
  const suggested: What = rec?.in_at && !rec.out_at ? 'out' : rec?.out_at && !rec.in_at ? 'in' : 'both';
  const what: What = picked ?? suggested;
  const inTime = what !== 'out' ? f.in_time : '';
  const outTime = what !== 'in' ? f.out_time : '';

  // Typing a time keeps the current choice, so the record loading late (and moving the suggestion)
  // never hides a time the person already entered.
  const setTime = (key: 'in_time' | 'out_time', v: string) => {
    if (!picked) setPicked(what);
    setF((x) => ({ ...x, [key]: v }));
  };

  const send = useMutation({
    mutationFn: async () => {
      const r = await createRegularization({ work_date: f.work_date, in_time: inTime || null, out_time: outTime || null, reason: f.reason });
      if (isApiError(r)) throw new Error(r.error);
      return r.request;
    },
    onMutate: () => setErr(''),
    onSuccess: () => {
      haptic.success();
      void qc.invalidateQueries({ queryKey: ['att-regs'] });
      // One layer at a time: the confirm sheet fades, then the success sheet opens.
      setConfirming(false);
      setTimeout(() => setSent(true), SHEET_FADE_MS);
    },
    onError: (e: Error) => {
      haptic.error();
      setConfirming(false);
      setErr(plainServerText(e.message) || 'Couldn’t send the request.');
    },
  });

  // Leaving after a sent request: Done goes back where the person came from (the list, or Me ›
  // Attendance); "View requests" goes to the list — back to it when it is under this screen.
  const leave = (toList: boolean) => {
    setSent(false);
    setTimeout(() => {
      if (!toList && router.canGoBack()) router.back();
      else router.dismissTo('/attendance/regularize');
    }, SHEET_FADE_MS);
  };

  const header = <NavHeader title="Request a fix" />;

  if (!on) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<PencilLine color={moduleTone.attendance.fg} strokeWidth={1.8} />}
          title="Fix attendance isn’t on"
          message="It isn’t switched on for your account."
        />
      </Screen>
    );
  }

  // The first unmet requirement, phrased as the server phrases it (web regMissing). A greyed-out
  // button that will not say why looks broken — so the bar's note names the missing piece.
  const missing = !f.work_date
    ? 'Pick the day to fix.'
    : what === 'in' && !f.in_time
      ? 'Add the clock-in time.'
      : what === 'out' && !f.out_time
        ? 'Add the clock-out time.'
        : what === 'both' && !f.in_time && !f.out_time
          ? 'Add the clock-in time, the clock-out time, or both.'
          : f.reason.trim().length < 5
            ? 'Add a reason (at least 5 characters).'
            : '';

  const recordedLine = rec ? `${keep(`In ${rec.in_at ? clockTime(rec.in_at) : '—'}`)} · ${keep(`Out ${rec.out_at ? clockTime(rec.out_at) : '—'}`)}` : 'Nothing recorded';
  const recorded = !f.work_date
    ? `Any day in the last ${windowDays} days.`
    : monthQ.isLoading
      ? 'Checking what was recorded…'
      : rec
        ? `Recorded: in ${rec.in_at ? clockTime(rec.in_at) : '—'} · out ${rec.out_at ? clockTime(rec.out_at) : '—'}`
        : 'Nothing recorded on this day, so add the clock-in time.';
  const fixLine = [inTime ? keep(`In ${prettyHm(inTime)}`) : null, outTime ? keep(`Out ${prettyHm(outTime)}`) : null].filter(Boolean).join(' · ');
  const dayText = isYmd(f.work_date) ? shortDay(f.work_date, thisYear) : '—';
  const summaryRows = [
    { key: 'day', label: 'Day', value: dayText },
    { key: 'in', label: 'Clock in', value: inTime ? prettyHm(inTime) : 'No change' },
    { key: 'out', label: 'Clock out', value: outTime ? prettyHm(outTime) : 'No change' },
  ];

  return (
    <>
      <Screen
        header={header}
        footer={
          <ActionBar note={missing || null}>
            <Button title="Review request" disabled={!!missing} onPress={() => setConfirming(true)} />
          </ActionBar>
        }>
        {err ? <Banner tone="danger" title="Couldn’t send the request" message={err} /> : null}
        {/* The same shape as Apply leave: the day in a card, the choice as tiles, then the times and the reason in one card. */}
        <Card style={styles.field}>
          <DateField
            label="Day"
            value={f.work_date || null}
            onChange={(v) => setF((x) => ({ ...x, work_date: v }))}
            maximumDate={today}
            minimumDate={addDays(today, -windowDays)}
          />
          <Text variant="caption" muted numberOfLines={2}>
            {recorded}
          </Text>
        </Card>
        <View style={styles.field}>
          {/* Labelled like the kit's fields. */}
          <Text variant="labelStrong" muted numberOfLines={2} style={FIELD_LABEL_INSET}>
            What needs fixing
          </Text>
          <SelectTiles<What>
            accessibilityLabel="What needs fixing"
            value={what}
            onChange={setPicked}
            options={[
              { value: 'in', label: 'Clock-in', icon: LogIn },
              { value: 'out', label: 'Clock-out', icon: LogOut },
              { value: 'both', label: 'Both', icon: ArrowLeftRight },
            ]}
          />
        </View>
        <Card style={styles.fields}>
          <View style={styles.field}>
            {what === 'both' ? (
              <FieldPair>
                <TimeField label="Clock in" value={f.in_time || null} placeholder="Clock in" onChange={(v) => setTime('in_time', v)} />
                <TimeField label="Clock out" value={f.out_time || null} placeholder="Clock out" onChange={(v) => setTime('out_time', v)} />
              </FieldPair>
            ) : what === 'in' ? (
              <TimeField label="Clock in" value={f.in_time || null} placeholder="Clock in" onChange={(v) => setTime('in_time', v)} />
            ) : (
              <TimeField label="Clock out" value={f.out_time || null} placeholder="Clock out" onChange={(v) => setTime('out_time', v)} />
            )}
            {inTime || outTime ? (
              <Button title="Clear times" variant="text" size="sm" onPress={() => setF((x) => ({ ...x, in_time: '', out_time: '' }))} style={styles.start} />
            ) : null}
          </View>
          <TextField
            label="Reason"
            value={f.reason}
            onChangeText={(t) => setF((x) => ({ ...x, reason: t }))}
            placeholder="e.g. Forgot to clock out after a client visit"
            maxLength={500}
            multiline
            counter
          />
        </Card>
      </Screen>

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Send this fix?"
        from={{ title: 'On record', subtitle: rec ? recordedLine : 'Nothing recorded', icon: CalendarClock, module: 'attendance' }}
        to={{ title: 'Your fix', subtitle: fixLine || '—', icon: PencilLine, module: 'attendance' }}
        detailsTitle="Request"
        confirmLabel={shortSwipe ? 'Swipe to send' : 'Swipe to send request'}
        onConfirm={() => send.mutate()}
        loading={send.isPending}
        disabled={!!missing}
        note="It needs approval. You can cancel it while it waits.">
        <SummaryCard rows={[...summaryRows, { key: 'reason', label: 'Reason', value: f.reason.trim() }]} />
      </ConfirmSheet>

      <SuccessSheet
        visible={sent}
        onClose={() => leave(false)}
        title="Request sent"
        subtitle="It’s waiting for approval. You’ll see the answer in Fix attendance."
        secondaryLabel="View requests"
        onSecondary={() => leave(true)}
        onPrimary={() => leave(false)}>
        <SummaryCard rows={[...summaryRows, { key: 'status', label: 'Status', value: 'Waiting', status: 'pending' }]} />
      </SuccessSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  field: { gap: space.xxs },
  fields: { gap: space.md },
  start: { alignSelf: 'flex-start' },
}));
