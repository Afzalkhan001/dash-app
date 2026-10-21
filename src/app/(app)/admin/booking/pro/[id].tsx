// Book a professional, step 2 (web: BookProfessional detail + form, dash.html:27588–27725; submit :27531).
//   - who they are: type, department, city, rating, skills, portfolio links; recent reviews for the
//     roles that may read them (canSeeReviews);
//   - their day: confirmed and waiting bookings on the chosen date;
//   - the form: start and end (07:00–22:00; not in the past today; never over another booking; not
//     while someone else holds it; within an hour of a neighbour is only a warning), the project code
//     (required), the shooting location (cinematographers only, required), channel and comments;
//   - the picked time is held for you (5 minutes, renewed while the form is open) with a countdown.
// Then a ConfirmSheet that says who is asked (their Reporting and Additional Manager, by email and
// WhatsApp) and "Swipe to request". POST /bookings; a 409 means the time went — say so and pick again.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Link2, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { type BookingRecord, postBooking, useAllBookings, useBookingDepartments, useBookingFeed, useBookingUsers } from '@/api/booking';
import { type Project, useProjects } from '@/api/reimbursements';
import { useNow } from '@/features/attendance/use-now';
import { canBook, canReadReviews } from '@/features/booking/access';
import { refreshBookings } from '@/features/booking/actions';
import {
  approversOf,
  CINEMATOGRAPHER,
  holdRanges,
  proBookingsOn,
  proGapWarning,
  profTypeLabel,
  proTimeError,
  ratingOf,
  sortBookingsNewestFirst,
  toMin,
} from '@/features/booking/model';
import { andList, DayStrip, HoldNotice, StackedRow, timeOptions, timeRange, useMe, useProfTypes } from '@/features/booking/ui';
import { useSlotHold } from '@/features/booking/use-slot-hold';
import { ProjectPicker } from '@/features/shared/project-picker';
import { dateLabel, istParts } from '@/lib/dates';
import { addDaysYmd } from '@/lib/ist';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import {
  ActionBar,
  ActivityList,
  ActivityRow,
  Avatar,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  FieldPair,
  NavHeader,
  Row,
  Screen,
  SelectField,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const MAX_DAYS = 7;

export default function BookProScreen() {
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const id = String(params.id || '');
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const now = useNow(30_000);
  const ist = istParts(new Date(now));
  const today = ist.date;
  const nowMin = ist.hour * 60 + ist.minute;
  const types = useProfTypes();
  const allowed = canBook(access);
  const users = useBookingUsers(allowed);
  const feed = useBookingFeed(allowed);
  // Ratings count every rated booking, as the website's do (getRating reads the whole table).
  const rated = useAllBookings(allowed);
  const depts = useBookingDepartments(allowed);
  const projects = useProjects(allowed);

  const [date, setDate] = useState(() => (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [shootLoc, setShootLoc] = useState('');
  const [channel, setChannel] = useState('');
  const [comments, setComments] = useState('');
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const [sent, setSent] = useState<BookingRecord | null>(null);

  // Only someone the search would list (dash.html:27448): bookable, with a type, and not you.
  const pro = users.data?.find((u) => u.id === id && u.professionalAvailable && !!u.professionalType && u.id !== me?.id) ?? null;
  const sM = toMin(start);
  const eM = toMin(end);
  // Hold only a time the form itself accepts (a clash the screen already shows needs no server answer).
  const basicErr = pro ? proTimeError({ list: feed.data ?? [], uid: pro.id, date, start, end, nowMin: date === today ? nowMin : null, held: [] }) : '';
  const hold = useSlotHold({
    type: 'pro',
    resourceId: pro?.id ?? '',
    date,
    payload: sM !== null && eM !== null && eM > sM && !basicErr && !pro?.leaveDates.includes(date) ? { startMin: sM, endMin: eM } : null,
    me,
    enabled: allowed && !!pro && !sent,
  });

  const submit = useMutation({
    mutationFn: async (b: Record<string, unknown>) => {
      const row = { id: `bk${Date.now()}`, ...b };
      await postBooking(row);
      return row;
    },
    onSuccess: (row) => {
      hold.consume();
      refreshBookings(qc);
      setConfirm(false);
      setTried(false);
      setStart('');
      setEnd('');
      setTimeout(() => setSent(row as unknown as BookingRecord), 400);
    },
    onError: (e) => {
      setConfirm(false);
      setServerErr(e instanceof Error ? e.message : 'Couldn’t send the request.');
      setStart('');
      setEnd('');
      refreshBookings(qc);
    },
  });

  if (!allowed) return <Redirect href="/" />;
  if (!pro) {
    return (
      <Screen header={<NavHeader title="Book a professional" />}>
        {!users.data && !users.isError ? (
          <SkeletonList rows={4} avatar />
        ) : users.isError && !users.data ? (
          <ErrorState message={users.error?.message || 'Couldn’t load this person.'} onRetry={() => void users.refetch()} />
        ) : (
          <EmptyState title="Not bookable" message="This person can’t be booked any more." />
        )}
      </Screen>
    );
  }

  const list = feed.data ?? [];
  const last = addDaysYmd(today, MAX_DAYS);
  const dateErr =
    date < today
      ? 'Pick today or a later day.'
      : date > last
        ? `Professionals can be booked up to 7 days ahead (until ${dateLabel(last, today)}).`
        : pro.leaveDates.includes(date)
          ? `${pro.name} is on leave that day. Pick another day.`
          : '';
  const timeErr = proTimeError({ list, uid: pro.id, date, start, end, nowMin: date === today ? nowMin : null, held: holdRanges(hold.others, 5) });
  const gapWarn = !timeErr && !!start && !!end && proGapWarning(list, pro.id, date, start, end);
  const needsLoc = pro.professionalType === CINEMATOGRAPHER;
  const kind = profTypeLabel(types, pro.professionalType);
  const deptName = depts.data?.find((d) => d.id === pro.dept)?.name ?? depts.data?.find((d) => d.name.toLowerCase() === pro.dept.toLowerCase())?.name ?? '';
  const ratingList = rated.data ?? list;
  const rating = ratingOf(ratingList, pro.id);
  const reviews = canReadReviews(me?.role)
    ? [...ratingList]
        .sort(sortBookingsNewestFirst)
        .filter((b) => b.resourceId === pro.id && Array.isArray(b.reviews) && b.reviews.length)
        .flatMap((b) => (b.reviews ?? []).map((r) => ({ ...r, project: b.project })))
        .slice(0, 3)
    : [];
  const confirmed = proBookingsOn(list, pro.id, date, ['approved', 'in_progress']);
  const waiting = proBookingsOn(list, pro.id, date, ['pending']);
  const approvers = approversOf(pro);
  const startOpts = timeOptions(7 * 60, 21 * 60 + 45, 15, (m) => date !== today || m > nowMin);
  const endOpts = timeOptions(7 * 60 + 15, 22 * 60, 15, (m) => sM === null || m > sM);

  const problems = {
    start: tried && !start ? 'Pick a start time.' : '',
    end: tried && !end ? 'Pick an end time.' : '',
    project: tried && !project ? 'Pick a project code.' : '',
    loc: needsLoc && tried && !shootLoc.trim() ? 'Where is the shoot?' : '',
  };
  const ready = !!start && !!end && !!project && !dateErr && !timeErr && !(needsLoc && !shootLoc.trim()) && !hold.holdErr;

  const review = () => {
    setTried(true);
    setServerErr('');
    if (ready) setConfirm(true);
  };

  const send = () => {
    if (!me || !project || submit.isPending) return;
    submit.mutate({
      type: 'professionals',
      resource: pro.name,
      resourceId: pro.id,
      requestedBy: me.name,
      requestedById: me.id,
      date,
      startTime: start,
      endTime: end,
      project: project.name || project.kekaCode || '',
      kekaCode: project.kekaCode || '',
      dates: [date],
      status: 'pending',
      reason: '',
      profDept: pro.dept,
      profDeptName: deptName,
      profType: pro.professionalType,
      comments: comments.trim(),
      channelName: channel.trim(),
      ...(needsLoc ? { shootingLocation: shootLoc.trim() } : {}),
      reviews: [],
      holdId: hold.holdId,
    });
  };

  return (
    <>
      <Screen
        header={<NavHeader title="Book a professional" />}
        footer={
          <ActionBar note={dateErr || timeErr || (tried && !ready ? 'Fill in the fields marked in red.' : null)}>
            <Button title="Review request" icon={<ArrowRight />} onPress={review} disabled={!!dateErr || !!timeErr} />
          </ActionBar>
        }>
        <Card tone="frostStrong" style={styles.profile}>
          <Row style={styles.head}>
            <Avatar name={pro.name} size={56} />
            <View style={styles.headText}>
              <Text variant="heading" numberOfLines={2}>
                {pro.name}
              </Text>
              <Text variant="label" muted numberOfLines={2}>
                {[kind, deptName || pro.dept, pro.location].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Row>
          {rating ? (
            <Row style={styles.rating}>
              <Star size={18} color={palette.goldInk} fill={palette.goldInk} />
              <Text variant="bodyStrong">{rating.avg.toFixed(1)}</Text>
              <Text variant="label" muted>
                {`${rating.count} rated booking${rating.count === 1 ? '' : 's'}`}
              </Text>
            </Row>
          ) : null}
          {pro.skills.length ? (
            <ChipRow bleed="card">
              {pro.skills.map((s) => (
                <Chip key={s} label={s} />
              ))}
            </ChipRow>
          ) : null}
          {pro.workLinks.map((l) => (
            <Button key={l} variant="text" size="sm" icon={<Link2 />} title={l} onPress={() => void Linking.openURL(l.startsWith('http') ? l : `https://${l}`)} style={styles.link} />
          ))}
        </Card>

        {reviews.length ? (
          <ActivityList title="Recent reviews">
            {reviews.map((r, i) => (
              <ActivityRow key={`${r.reviewerName}-${i}`} person={{ name: r.reviewerName || '' }} title={r.reviewerName || '—'} subtitle={r.comments || r.project || '—'} value={`★ ${r.rating ?? '—'}`} />
            ))}
          </ActivityList>
        ) : null}

        <DayStrip
          value={date}
          onChange={(d) => {
            setDate(d);
            setStart('');
            setEnd('');
          }}
          today={today}
          days={MAX_DAYS + 1}
        />

        <ActivityList title={`Booked on ${dateLabel(date, today)}`} empty="Nothing booked that day yet.">
          {[...confirmed, ...waiting]
            .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
            .map((b) => (
              <StackedRow
                key={b.id}
                person={{ name: b.requestedBy || '' }}
                title={timeRange(b)}
                subtitle={`${b.requestedBy || '—'} · ${b.kekaCode || b.project || 'Booking'}`}
                status={b.status === 'pending' ? { label: 'Waiting', tone: 'pending' } : { label: 'Booked', tone: 'done' }}
              />
            ))}
        </ActivityList>

        <Card tone="frostStrong" style={styles.form}>
          <FieldPair>
            <SelectField
              label="Start"
              value={start || null}
              options={startOpts}
              onChange={(v) => {
                setStart(v);
                if (end && (toMin(end) ?? 0) <= (toMin(v) ?? 0)) setEnd('');
                setServerErr('');
              }}
              placeholder="Start"
              error={problems.start}
            />
            <SelectField label="End" value={end || null} options={endOpts} onChange={(v) => {
                setEnd(v);
                setServerErr('');
              }} placeholder="End" error={problems.end} disabled={!start} />
          </FieldPair>
          {gapWarn ? <Banner tone="warning" title="Close to another booking" message="This is within an hour of their next or last booking. You can still ask." /> : null}
          <HoldNotice secsLeft={hold.secsLeft} holdErr={hold.holdErr} />
          <ProjectPicker variant="row" value={project} onChange={setProject} projects={projects.data} loading={projects.isLoading} error={problems.project} module="tasks" />
          {needsLoc ? (
            <TextField label="Shooting location" value={shootLoc} onChangeText={setShootLoc} placeholder="Where the shoot happens" error={problems.loc} hint="Cinematographers travel, so this is required." />
          ) : null}
          <TextField label="Channel (optional)" value={channel} onChangeText={setChannel} placeholder="e.g. YintTalks" />
          <TextField label="Comments (optional)" value={comments} onChangeText={setComments} multiline maxLength={500} counter placeholder="What they should know" />
        </Card>
        {serverErr ? <Banner tone="danger" title="Couldn’t book this time" message={serverErr} /> : null}
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Send this request?"
        from={{ title: 'You', subtitle: 'Asking', avatar: { name: me?.name || 'You' } }}
        to={{ title: pro.name, subtitle: kind, avatar: { name: pro.name } }}
        detailsTitle="Booking"
        confirmLabel="Swipe to request"
        onConfirm={send}
        loading={submit.isPending}
        note={approvers.length ? `${andList(approvers)} get${approvers.length === 1 ? 's' : ''} an email and WhatsApp to approve it.` : 'Their manager is asked to approve it.'}>
        <SummaryCard
          rows={[
            { key: 'day', label: 'Date', value: dateLabel(date, today) },
            { key: 'time', label: 'Time', value: start && end ? timeRange({ id: '', startTime: start, endTime: end }) : null },
            { key: 'code', label: 'Project code', value: project?.kekaCode || project?.name || null },
            { key: 'loc', label: 'Shooting location', value: needsLoc ? shootLoc.trim() : null },
            { key: 'ch', label: 'Channel', value: channel.trim() || null },
          ]}
          hideEmpty
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={!!sent}
        onClose={() => router.dismissTo('/admin/booking')}
        title="Request sent"
        subtitle={approvers.length ? `Waiting for ${approvers[0]}'s approval.` : 'Waiting for their manager’s approval.'}
        secondaryLabel="Book another"
        onSecondary={() => router.back()}
        onPrimary={() => router.dismissTo('/admin/booking')}>
        <SummaryCard
          rows={[
            { key: 'who', label: kind, value: pro.name },
            { key: 'when', label: 'When', value: sent ? `${dateLabel(date, today)} · ${timeRange(sent)}` : null },
            { key: 'st', label: 'Status', value: 'Waiting', status: 'pending' },
          ]}
        />
      </SuccessSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  profile: { gap: space.sm },
  head: { gap: space.sm },
  headText: { flex: 1, gap: 2 },
  rating: { gap: space.xs },
  link: { alignSelf: 'flex-start' },
  form: { gap: space.md },
}));
