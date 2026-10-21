// Apply leave / work from home / claim comp-off: the web's LeaveRequestForm (dash.html:4841) on a
// phone, as a Payno flow (docs/REFERENCE-COMPONENTS.md §3 "Apply leave flow"): fill the form, then a
// ConfirmSheet to check and swipe, then a SuccessSheet. Same kinds (one per enabled HR module), same
// request bodies, same half-day rule (only for a leave type that allows it; a half day is a single
// date). The live summary and the one warning mirror the server's rules (hr_leave.js POST /requests);
// the server still checks and counts when the request is sent, and its error is shown as it comes.
//
// Optional param: /leave/apply?kind=leave|wfh|comp_off opens the form for that kind. The form is always
// for one kind (fixed title, no switch): without the param it is the first kind this person can
// request (leave, when they have it). The other kinds are separate links in Me › Leave.
//
// Layout, top to bottom (NavHeader: round back button, centred title):
//   1. for Work from home and Comp-off, one line saying what it is (the only place that is said),
//   2. Leave type: SelectTiles, one tile per type with "N days left" (or "Unpaid"); with a single type
//      it is picked for the person and still shown, chosen,
//   3. one card of fields: From / To (or the day worked) → Full day | 1st half | 2nd half (only for one
//      day of a type that allows it) → reason,
//   4. at most one notice (the send error, else the most important rule warning; none while the leave
//      types failed to load or there are none, since that part already shows its own notice),
//   sticky bar: the live summary ("3 days · 4 left after"), what is still missing (else what to do about
//   a balance shortfall), and "Continue".
// Continue opens the ConfirmSheet: FromToCards (the type → the dates; for comp-off the day worked → the
// day off), a SummaryCard (what is left after, or unpaid; the reason; the day count as the total), the
// same one notice, and SwipeToConfirm (a plain button with a screen reader or Reduce Motion). Once the
// server accepts, the SuccessSheet says so with the request's facts: "View request" opens it in the
// full list, "Done" goes back to where the person came from.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Briefcase, CalendarDays, CalendarPlus, CalendarX } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useAttendanceMonth, useLeaveBalances } from '@/api/hr';
import {
  type HalfDay,
  type LeaveBalances,
  type LeaveKind,
  type LeaveRequest,
  type LeaveType,
  type NewLeaveRequest,
  useLeaveBalancesForYear,
  useLeaveSettings,
  useLeaveTypes,
  useMyLeaveRequests,
} from '@/api/leave';
import { useTodayIst } from '@/features/attendance/use-now';
import { ApplySummary, LeaveTypeTiles, type SummaryLine, TypeTilesSkeleton } from '@/features/leave/apply-parts';
import { KindBadge, kindLook, typeIcon } from '@/features/leave/request-row';
import { requestFacts, requestTotal } from '@/features/leave/request-sheet';
import {
  addDays,
  APPLY_TITLE,
  countsBalance,
  countWorkingDays,
  dayCount,
  eachDate,
  fmtNum,
  HALF_LABEL,
  isYmd,
  leaveYearOf,
  overlaps,
  rangeLabel,
  requestDays,
  requestTitle,
  shortDate,
  weekdayOf,
} from '@/features/leave/rules';
import { useLeaveAccess } from '@/features/leave/use-leave-access';
import { useSubmitLeave } from '@/features/leave/use-leave-actions';
import { useOffDays } from '@/features/leave/use-off-days';
import { meHref } from '@/features/me/tabs';
import { hrHas } from '@/lib/access';
import { dayLabel } from '@/lib/dates';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  ActionBar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  DateField,
  EmptyState,
  ErrorState,
  type FromToItem,
  NavHeader,
  Screen,
  Segmented,
  type SelectTileOption,
  shouldStack,
  Skeleton,
  SuccessSheet,
  SummaryCard,
  type SummaryItem,
  Text,
  TextField,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

// The words of each kind's confirm and success sheets.
// The swipe label is one line inside the track, so a narrow phone (< 360 dp) or large text gets the short one.
const FLOW: Record<LeaveKind, { confirm: string; swipe: string; swipeShort: string; done: string; doneSub: string; cancelNote: string }> = {
  leave: {
    confirm: 'Confirm leave',
    swipe: 'Swipe to apply leave',
    swipeShort: 'Swipe to apply',
    done: 'Leave applied',
    doneSub: 'Your department admin or HR will review it.',
    cancelNote: 'You can cancel it while it waits, or later before it starts.',
  },
  wfh: {
    confirm: 'Confirm work from home',
    swipe: 'Swipe to send request',
    swipeShort: 'Swipe to send',
    done: 'Request sent',
    doneSub: 'Your department admin or HR will review it.',
    cancelNote: 'You can cancel it while it waits, or later before it starts.',
  },
  comp_off: {
    confirm: 'Confirm comp-off claim',
    swipe: 'Swipe to claim comp-off',
    swipeShort: 'Swipe to claim',
    done: 'Comp-off claimed',
    doneSub: 'Once it’s approved, the day off is added to your balance.',
    cancelNote: 'You can cancel it while it waits for approval.',
  },
};
// One plain line at the top, for the kinds whose name alone doesn't say what they are.
const KIND_NOTE: Partial<Record<LeaveKind, string>> = {
  wfh: 'Work from home on these days and clock in from there.',
  comp_off: 'Earn a day off for working on a holiday or weekend.',
};
const REASON_HINT: Record<LeaveKind, string> = {
  leave: 'Let your approver know why',
  wfh: 'Why do you need to work from home?',
  comp_off: 'What did you work on?',
};
const HALF_OPTIONS: { key: HalfDay; label: string }[] = [
  { key: 'none', label: 'Full day' },
  { key: 'first', label: '1st half' },
  { key: 'second', label: '2nd half' },
];
const REASON_MAX = 500; // hr_leave.js cleanText(b.reason, 500)
const REASON_MIN = 3;
const SHEET_SWAP_MS = 360; // one sheet at a time: the next opens once the last has slid away
const LEAVE_MS = 280; // let the success sheet fade before leaving the screen
const isKind = (v: unknown): v is LeaveKind => v === 'leave' || v === 'wfh' || v === 'comp_off';
const asArray = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v.filter(Boolean) : []);
const round2 = (n: number) => Math.round(n * 100) / 100;
const finite = (v: unknown) => Number.isFinite(Number(v));
const daysLeft = (n: number) => `${fmtNum(n)} ${Number(n) === 1 ? 'day' : 'days'} left`;
const weekday = (ymd: string) => dayLabel(ymd, { weekday: 'short' });

export default function ApplyLeaveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const access = useLeaveAccess();
  const today = useTodayIst();
  const shortSwipe = shouldStack(useLayout(), { below: 'narrow' });

  // Form state, one field per field of the web form.
  const [pickedType, setPickedType] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [half, setHalf] = useState<HalfDay>('none');
  const [worked, setWorked] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // The flow: confirm sheet → success sheet (with the request the server sent back).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sent, setSent] = useState<LeaveRequest | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const kinds = asArray(access.kinds);
  const asked = isKind(params.kind) ? params.kind : null;
  const kind = asked && kinds.includes(asked) ? asked : (kinds[0] ?? null);
  const isLeave = kind === 'leave';
  const isComp = kind === 'comp_off';

  const leaveOn = access.enabled && access.hasLeave;
  const typesQ = useLeaveTypes(leaveOn);
  const settingsQ = useLeaveSettings(leaveOn);
  const balQ = useLeaveBalances(leaveOn);
  const reqQ = useMyLeaveRequests(access.enabled);
  const submit = useSubmitLeave();

  const settings = settingsQ.data?.settings ?? null;
  const current = balQ.data as LeaveBalances | undefined;
  // A request is checked against the balance of the leave year it starts in (which may be next year's).
  const periodFrom = current?.period?.from;
  const startMonth = settings?.leaveYearStartMonth ?? (isYmd(periodFrom) ? Number(periodFrom.slice(5, 7)) : null);
  const reqYear = from && startMonth ? leaveYearOf(from, startMonth) : (current?.year ?? null);
  const otherYear = isLeave && reqYear != null && current != null && reqYear !== current.year;
  const yearQ = useLeaveBalancesForYear(otherYear ? reqYear : null, leaveOn && otherYear);
  const balances = asArray(otherYear ? yearQ.data?.balances : current?.balances);

  // The comp-off leave type is offered only with the comp_off module (dash.html:4846). With a single
  // leave type there is nothing to choose, so it is picked for the person.
  const types = asArray(typesQ.data?.types).filter((t) => !t.is_comp_off || access.hasCompOff);
  const typeId = pickedType ?? (types.length === 1 ? (types[0]?.id ?? null) : null);
  const type = types.find((t) => t.id === typeId) ?? null;
  const typesFailed = typesQ.isError && !typesQ.data;
  const noTypes = isLeave && !!typesQ.data && !types.length; // HR has set up none this person can pick
  // The leave-type part shows its own notice for these, so nothing else repeats it.
  const typesProblem = isLeave && (typesFailed || noTypes);
  const bal = balances.find((b) => b.id === typeId) ?? null;

  // A half day is one date, so the Full / 1st half / 2nd half choice shows only for a single day.
  const singleDay = !!from && (!to || to === from);
  const showHalf = isLeave && !!type?.allow_half_day && singleDay;
  const halfDay: HalfDay = showHalf ? half : 'none';
  const end = halfDay !== 'none' ? from : (to ?? from); // web: a half day is sent with to_date = from_date

  const off = useOffDays(isComp ? worked : from, isComp ? worked : end);
  const attOn = hrHas(access.hr, 'attendance');
  const attQ = useAttendanceMonth((worked ?? today).slice(0, 7), access.enabled && isComp && attOn && !!worked);
  const requests = asArray(reqQ.data?.requests);

  // ── Live day count (leave / WFH) ──
  const range = !isComp && from && end ? { from, end } : null;
  const calendarDays = range ? eachDate(range.from, range.end).length : 0;
  const est = range ? countWorkingDays(range.from, range.end, off.weeklyOff, off.holidays, halfDay) : null;
  const estLabel = est != null ? (off.exact ? requestDays(est) : `About ${requestDays(est).toLowerCase()}`) : null;
  // What is left of the chosen type after this request (paid types with a known balance).
  const leftAfter = isLeave && type?.paid && bal && finite(bal.available) && est != null ? round2(Number(bal.available) - est) : null;

  // ── Comp-off credit, from the attendance record exactly as the server reads it ──
  const rec = isComp && worked ? asArray(attQ.data?.records).find((r) => r.work_date === worked) : undefined;
  const credit = rec?.out_at ? (rec.status === 'present' ? 1 : rec.status === 'half_day' ? 0.5 : 0) : 0;
  const creditKnown = isComp && attOn && !!worked && attQ.isSuccess;
  const expiryDays = settings?.compOffExpiryDays;

  // ── The live summary in the sticky bar ──
  let summary: SummaryLine | null = null;
  // A known shortfall is still sent (the server decides), but the bar says what to do about it.
  let shortfall: string | null = null;
  if (range && est != null && estLabel) {
    summary = { main: estLabel };
    if (isLeave && type && !countsBalance(type)) {
      summary.extra = 'unpaid';
    } else if (leftAfter != null && type) {
      // A shortfall is stated only as far as the count is known: with holidays or weekly offs unknown
      // the count is an estimate, so it "may be" more; red only once the weekly offs are known.
      if (leftAfter >= 0) summary.extra = `${fmtNum(leftAfter)} left after`;
      else if (off.exact) summary.extra = `${fmtNum(-leftAfter)} more than you have`;
      else summary.extra = 'may be more than you have';
      summary.danger = leftAfter < 0 && (off.exact || off.weeklyOffKnown);
      if (leftAfter < 0 && off.exact) {
        const name = type.name || type.code || 'leave';
        shortfall = types.some((t) => !countsBalance(t))
          ? `Not enough ${name} left. Pick an unpaid leave type.`
          : `Not enough ${name} left, so this will be refused.`;
      }
    }
  } else if (isComp && worked && creditKnown && credit > 0) {
    // The server counts the expiry from the day worked, not from the approval.
    summary = {
      main: credit === 0.5 ? 'Earns half a day off' : `Earns ${dayCount(credit)} off`,
      extra: expiryDays ? `use within ${expiryDays} days of that day` : null,
    };
  }

  // ── Rule warnings, worded like the server's errors. They never block sending: the server decides.
  // Only the first is shown (one notice at a time); a balance shortfall is already in the summary. None
  // while the leave-type part shows its own notice (types failed to load, or there are none). ──
  // Once the request is sent the refreshed list holds it, so the form under the success sheet would
  // start warning about its own dates; it says nothing more by then.
  const warnings: string[] = [];
  if (range && !typesProblem && !sent) {
    if (overlaps(requests, range.from, range.end).length) warnings.push('You already have a leave or work-from-home request on some of those dates.');
    if (settings && calendarDays > settings.maxSpanDays) warnings.push(`One request can cover at most ${settings.maxSpanDays} days.`);
    if (isLeave && type && !type.is_comp_off && startMonth && leaveYearOf(range.from, startMonth) !== leaveYearOf(range.end, startMonth)) {
      warnings.push('A request cannot cross into the next leave year. Send two requests.');
    }
    if (off.exact && est === 0) warnings.push('Those dates are all weekly offs or holidays.');
  }
  if (isComp && worked && !sent) {
    if (requests.some((r) => r.kind === 'comp_off' && r.from_date === worked && (r.status === 'pending' || r.status === 'approved'))) {
      warnings.push('You have already claimed comp-off for that day.');
    }
    if (off.exact && !off.weeklyOff.includes(weekdayOf(worked)) && !off.holidays.has(worked)) {
      warnings.push('Comp-off is only for work on a weekly off or a company holiday.');
    }
    if (creditKnown && credit === 0) warnings.push('No attendance (half a day or more) is recorded for that day.');
  }

  // The first thing still missing, in the order the form is filled (the web's `ready`, explained).
  const trimmed = reason.trim();
  const missing = noTypes ? 'No leave types yet' : isLeave && !typeId ? 'Choose a leave type' : isComp ? (worked ? null : 'Pick the day you worked') : from ? null : 'Pick your dates';
  const blocker = missing ?? (trimmed.length >= REASON_MIN ? null : trimmed.length ? 'The reason is too short' : 'Add a reason');

  // Any edit clears a previous server error, so it never describes a form that has changed.
  const touch = () => {
    if (submit.isError) submit.reset();
  };
  const chooseType = (id: string) => {
    setPickedType(id);
    setHalf('none'); // as the web: a new type starts from full days
    touch();
  };
  const chooseFrom = (d: string) => {
    const nextTo = !to || to < d ? d : to;
    setFrom(d);
    setTo(nextTo);
    if (nextTo !== d) setHalf('none');
    touch();
  };
  const chooseTo = (d: string) => {
    setTo(d);
    if (d !== from) setHalf('none');
    touch();
  };
  const chooseHalf = (h: HalfDay) => {
    setHalf(h);
    touch();
  };

  // Accepted: the confirm sheet slides away, then the success sheet comes up with the server's request.
  const accepted = (r?: LeaveRequest) => {
    setSent(r ?? null);
    setConfirmOpen(false);
    setTimeout(() => setSuccessOpen(true), SHEET_SWAP_MS);
  };

  // Exactly the bodies LeaveRequestForm sends (dash.html:4849).
  const send = () => {
    if (!kind || blocker) return;
    let body: NewLeaveRequest;
    if (kind === 'comp_off') {
      if (!worked) return;
      body = { kind, worked_date: worked, reason: trimmed };
    } else {
      if (!from) return;
      body = {
        kind,
        leave_type_id: kind === 'leave' ? (typeId ?? undefined) : undefined,
        from_date: from,
        to_date: halfDay !== 'none' ? from : (to ?? from),
        half_day: kind === 'leave' ? halfDay : 'none',
        reason: trimmed,
      };
    }
    submit.mutate(body, { onSuccess: accepted });
  };

  // Done: back to where the person came from. View request: the full list, with this request open.
  const leaveScreen = (viewId?: string) => {
    setSuccessOpen(false);
    setTimeout(() => {
      if (viewId) router.replace(`/leave/requests?open=${encodeURIComponent(viewId)}`);
      else if (router.canGoBack()) router.back();
      else router.replace(meHref('leave'));
    }, LEAVE_MS);
  };

  const refresh = () =>
    Promise.all([
      access.refetch(),
      leaveOn ? typesQ.refetch() : null,
      leaveOn ? settingsQ.refetch() : null,
      leaveOn ? balQ.refetch() : null,
      access.enabled ? reqQ.refetch() : null,
    ]);

  const header = <NavHeader title={APPLY_TITLE[kind ?? asked ?? 'leave']} />;

  if (access.loading) {
    return (
      <Screen header={header}>
        <Skeleton height={360} radius={radius.xl} />
      </Screen>
    );
  }
  if (access.error) {
    return (
      <Screen header={header}>
        <ErrorState message={access.error.message} onRetry={() => void access.refetch()} />
      </Screen>
    );
  }
  if (!access.enabled || !kind) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<CalendarX color={moduleTone.leave.fg} />}
          title="Leave isn’t on for you"
          message={access.managesOnly ? 'You set up leave for the company under More › HR setup.' : 'Ask HR to switch it on.'}
          action={<Button title="Go back" variant="accent" size="md" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
        />
      </Screen>
    );
  }

  // Hard limits as picker bounds: how far back (leave settings, when readable) and at most a year ahead.
  const minFrom = settings ? addDays(today, -settings.backdateDays) : undefined;
  const maxDate = addDays(today, 366);

  // Each type as a tile with what is left of it.
  const tileSub = (t: LeaveType) => {
    if (!countsBalance(t)) return 'Unpaid';
    const b = balances.find((x) => x.id === t.id);
    return b && finite(b.available) ? daysLeft(Number(b.available)) : null;
  };
  const typeOptions: SelectTileOption[] = types.map((t) => ({
    value: t.id,
    label: t.name || t.code || 'Leave',
    icon: typeIcon(t),
    sub: tileSub(t),
  }));
  // One muted line under the tiles, only when the chosen type needs a word of its own: the dates fall
  // in another leave year, or a comp-off balance runs out.
  const typeHint =
    type && otherYear
      ? yearQ.isLoading
        ? 'Checking your balance…'
        : `Balance for the ${reqYear} leave year`
      : type?.is_comp_off && bal && isYmd(bal.expiring)
        ? `Use your comp-off by ${shortDate(bal.expiring, today)}`
        : null;

  // The one place a kind's meaning is said (the links that open this form only name it).
  const note = KIND_NOTE[kind];
  const sendError = submit.isError ? <Banner tone="danger" title="Couldn’t send this request" message={submit.error.message} /> : null;
  const notice = sendError ?? (warnings[0] ? <Banner tone="warning" message={warnings[0]} /> : null);
  // In the confirm sheet a known shortfall is a notice too: it is the last look before sending.
  const confirmNotice = notice ?? (shortfall ? <Banner tone="warning" message={shortfall} /> : null);

  // ── The confirm sheet: what → when, then the details ──
  const look = kindLook(kind);
  let fromCard: FromToItem;
  let toCard: FromToItem;
  if (isComp) {
    fromCard = { title: 'Day you worked', subtitle: worked ? shortDate(worked, today) : undefined, icon: Briefcase, module: look.module };
    toCard = {
      title: 'Day off',
      subtitle: creditKnown && credit > 0 ? (credit === 0.5 ? 'Half a day' : dayCount(credit)) : 'Counted from your attendance',
      icon: CalendarPlus,
      module: look.module,
    };
  } else {
    fromCard = isLeave
      ? {
          title: type ? type.name || type.code || 'Leave' : 'Leave',
          subtitle: type ? (tileSub(type) ?? undefined) : undefined,
          icon: type ? typeIcon(type) : look.Icon,
          module: 'leave',
        }
      : { title: 'Work from home', subtitle: 'Clock in from home', icon: look.Icon, module: look.module };
    toCard = {
      title: range ? (singleDay ? shortDate(range.from, today) : rangeLabel(range.from, range.end, today)) : '—',
      subtitle: range ? (singleDay ? HALF_LABEL[halfDay] : `${weekday(range.from)} – ${weekday(range.end)}`) : undefined,
      icon: CalendarDays,
      module: isLeave ? 'leave' : look.module,
    };
  }
  const details: SummaryItem[] = [];
  if (isLeave && type && !countsBalance(type)) {
    details.push({ key: 'pay', label: 'Pay', value: 'Unpaid (loss of pay)' });
  } else if (leftAfter != null) {
    details.push({
      key: 'left',
      label: 'Left after',
      value: dayCount(leftAfter),
      valueColor: leftAfter < 0 ? palette.dangerInk : undefined,
      hint: otherYear ? `In the ${reqYear} leave year` : null,
    });
  }
  if (isComp && creditKnown && credit > 0 && expiryDays) details.push({ key: 'expiry', label: 'Use within', value: `${expiryDays} days of that day` });
  if (trimmed) details.push({ key: 'reason', label: 'Reason', value: trimmed });
  const total = !isComp && estLabel ? { label: 'Days', value: estLabel, hint: off.exact ? null : 'Weekly offs and holidays may change this' } : null;

  const flow = FLOW[kind];
  const footer = (
    <ActionBar>
      <ApplySummary summary={summary} blocker={typesProblem ? null : (blocker ?? shortfall)} />
      <Button variant="primary" title="Continue" disabled={!!blocker} onPress={() => setConfirmOpen(true)} />
    </ActionBar>
  );

  return (
    <Screen header={header} footer={footer} onRefresh={refresh} automaticallyAdjustKeyboardInsets>
      {note ? (
        <View style={styles.noteRow}>
          <KindBadge kind={kind} size={36} />
          <Text variant="label" muted numberOfLines={2} style={styles.flex}>
            {note}
          </Text>
        </View>
      ) : null}

      {isLeave ? (
        <View style={styles.part}>
          <Text variant="labelStrong" muted accessibilityRole="header" style={FIELD_LABEL_INSET}>
            Leave type
          </Text>
          {typesQ.isLoading ? (
            <TypeTilesSkeleton />
          ) : typesFailed ? (
            <Banner
              tone="danger"
              title="Couldn’t load leave types"
              message={typesQ.error.message}
              action={{ label: 'Try again', onPress: () => void typesQ.refetch() }}
            />
          ) : types.length ? (
            <LeaveTypeTiles options={typeOptions} value={typeId} onChange={chooseType} />
          ) : (
            <Banner message="HR hasn’t set up leave types yet." />
          )}
          {typeHint ? (
            <Text variant="caption" muted numberOfLines={2}>
              {typeHint}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Card style={styles.fields}>
        {isComp ? (
          <DateField
            label="Day you worked"
            value={worked}
            onChange={(d) => {
              setWorked(d);
              touch();
            }}
            minimumDate={settings ? addDays(today, -settings.compOffClaimWindowDays) : undefined}
            maximumDate={today}
            hint={settings ? `Within the last ${settings.compOffClaimWindowDays} days` : null}
          />
        ) : (
          <>
            <DateField label="From" value={from} onChange={chooseFrom} minimumDate={minFrom} maximumDate={maxDate} />
            <DateField label="To" value={to} onChange={chooseTo} minimumDate={from ?? minFrom} maximumDate={maxDate} />
          </>
        )}

        {showHalf ? (
          <View style={styles.part}>
            <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
              Duration
            </Text>
            <Segmented options={HALF_OPTIONS} value={halfDay} onChange={chooseHalf} />
          </View>
        ) : null}

        <TextField
          label="Reason"
          value={reason}
          onChangeText={(t) => {
            setReason(t);
            touch();
          }}
          placeholder={REASON_HINT[kind]}
          multiline
          maxLength={REASON_MAX}
        />
      </Card>

      {notice}

      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={flow.confirm}
        from={fromCard}
        to={toCard}
        detailsTitle={details.length || total ? 'Details' : undefined}
        confirmLabel={shortSwipe ? flow.swipeShort : flow.swipe}
        onConfirm={send}
        loading={submit.isPending}
        disabled={!!blocker}
        note={flow.cancelNote}>
        {details.length || total ? <SummaryCard rows={details} total={total} /> : null}
        {confirmNotice}
      </ConfirmSheet>

      <SuccessSheet
        visible={successOpen}
        onClose={() => leaveScreen()}
        title={flow.done}
        subtitle={flow.doneSub}
        primaryLabel="Done"
        onPrimary={() => leaveScreen()}
        secondaryLabel={sent?.id ? 'View request' : undefined}
        onSecondary={sent?.id ? () => leaveScreen(sent.id) : undefined}>
        {sent ? (
          <SummaryCard
            rows={[{ key: 'type', label: 'Type', value: requestTitle(sent, type?.name) }, ...requestFacts(sent, today, { applied: false, reason: false })]}
            total={requestTotal(sent)}
          />
        ) : null}
      </SuccessSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  part: { gap: space.xs },
  fields: { gap: space.md },
}));
