// Book a shooting location (web: BookLocation, dash.html:28158–28482). Pick the city and the day (up to
// 30 days ahead), then a location; then start and end on the half hour (06:00–23:30; at least 30
// minutes; a 30-minute gap either side of every booking; not while someone else holds it), the project
// code (required) and the channel. Locations that need approval say who approves.
// Booking is two steps, as on the web: POST /loc_time_bookings claims the time (409 if taken), then
// POST /bookings records it — approved, or waiting for the location's approver.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { ArrowRight, Hourglass, MapPin } from 'lucide-react-native';
import { useState } from 'react';

import { type Location, postBooking, postLocSlot, useBookingFeed, useLocations, useLocSlots } from '@/api/booking';
import { type Project, useProjects } from '@/api/reimbursements';
import { useNow } from '@/features/attendance/use-now';
import { canBook } from '@/features/booking/access';
import { refreshBookings, StepError } from '@/features/booking/actions';
import { cityOfLocation, holdRanges, liveLocSlots, LOC_TIMES, locTimeError, minToHm, toMin } from '@/features/booking/model';
import { DayStrip, HoldNotice, typeIcon, useMe } from '@/features/booking/ui';
import { useSlotHold } from '@/features/booking/use-slot-hold';
import { ProjectPicker } from '@/features/shared/project-picker';
import { dateLabel, durationLabel, hmLabel, istParts } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  FieldPair,
  MenuSheet,
  NavHeader,
  PillSelector,
  Row,
  Screen,
  SelectField,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  TextField,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const MAX_DAYS = 30;

export default function BookLocationScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useMe();
  const now = useNow(30_000);
  const ist = istParts(new Date(now));
  const today = ist.date;
  const nowMin = ist.hour * 60 + ist.minute;
  const allowed = canBook(access);
  const locations = useLocations(allowed);
  const projects = useProjects(allowed);
  const [city, setCity] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [loc, setLoc] = useState<Location | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [channel, setChannel] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const slotRows = useLocSlots(allowed && !!loc, !!loc && !done);
  const feed = useBookingFeed(allowed);
  // A rejected or cancelled booking's time row stays on the server; the website reads past it.
  const slotData = slotRows.data && (feed.data || feed.isError) ? liveLocSlots(slotRows.data, feed.data ?? []) : undefined;
  const sm = toMin(start);
  const em = toMin(end);
  const basicErr = loc ? locTimeError({ rows: slotData ?? [], locId: loc.id, date, start, end, held: [] }) : '';
  const hold = useSlotHold({
    type: 'loc',
    resourceId: loc?.id ?? '',
    date,
    payload: sm !== null && em !== null && em > sm && !basicErr ? { startMin: sm, endMin: em } : null,
    me,
    enabled: allowed && !!loc && !done,
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!loc || !me || sm === null || em === null) throw new Error('Pick a location and a time.');
      const needsApproval = !!loc.approvalRequired;
      const bookingId = `bkl${Date.now() + 1}`;
      await postLocSlot({
        id: `ltb${Date.now()}`,
        locationId: loc.id,
        date,
        startMin: sm,
        endMin: em,
        bookedBy: me.name,
        bookedById: me.id,
        project: project?.name || '',
        bookingId,
        holdId: hold.holdId,
      });
      hold.consume();
      const bk = {
        id: bookingId,
        type: 'locations',
        resource: loc.name || loc.id,
        locationId: loc.id,
        requestedBy: me.name,
        requestedById: me.id,
        dates: [date],
        date,
        startTime: start,
        endTime: end,
        project: project?.name || '',
        kekaCode: project?.kekaCode || '',
        channelName: channel.trim(),
        status: needsApproval ? 'pending' : 'approved',
        reason: '',
        locationApproverId: needsApproval ? loc.approverId || '' : '',
        locationApproverName: needsApproval ? loc.approverName || '' : '',
        createdAt: new Date().toISOString(),
      };
      try {
        await postBooking(bk);
      } catch {
        try {
          await postBooking(bk);
        } catch (e2) {
          throw new StepError('The time is yours, but the booking wasn’t recorded. Ask IT Admin to check it.', e2);
        }
      }
    },
    onSuccess: () => {
      refreshBookings(qc);
      setConfirm(false);
      setTimeout(() => setDone(true), 400);
    },
    onError: (e) => {
      setConfirm(false);
      refreshBookings(qc);
      setErr(e instanceof StepError ? e.done : e instanceof Error ? e.message : 'Couldn’t book the location.');
      if (!(e instanceof StepError)) {
        setStart('');
        setEnd('');
      }
    },
  });

  if (!allowed) return <Redirect href="/" />;

  const all = locations.data ?? [];
  const cities = [...new Set(all.map(cityOfLocation).filter(Boolean))].sort();
  const shown = all.filter((l) => !city || cityOfLocation(l).toLowerCase() === city.toLowerCase());

  // ── Step 1: where ──
  if (!loc) {
    return (
      <>
        <Screen header={<NavHeader title="Book a location" />} onRefresh={() => locations.refetch()}>
          <DayStrip value={date} onChange={setDate} today={today} days={8} maxDays={MAX_DAYS} />
          {cities.length ? (
            <Row>
              <PillSelector icon={MapPin} label={city || 'All areas'} onPress={() => setCityOpen(true)} accessibilityLabel={`Area: ${city || 'all'}`} />
            </Row>
          ) : null}
          {locations.isError && !locations.data ? (
            <ErrorState message={locations.error?.message || 'Couldn’t load the locations.'} onRetry={() => void locations.refetch()} />
          ) : !locations.data ? (
            <SkeletonList rows={3} />
          ) : shown.length ? (
            <ActivityList title="Locations">
              {shown.map((l) => (
                <ActivityRow
                  key={l.id}
                  module="tasks"
                  icon={MapPin}
                  title={l.name || l.id}
                  subtitle={l.address || cityOfLocation(l) || undefined}
                  note={l.approvalRequired ? `Needs approval${l.approverName ? ` by ${l.approverName}` : ''}` : undefined}
                  chevron
                  onPress={() => {
                    setLoc(l);
                    setErr('');
                  }}
                />
              ))}
            </ActivityList>
          ) : (
            <EmptyState icon={<MapPin color={palette.textMuted} />} title="No locations here" message="IT Admin adds shooting locations in the IT desk." />
          )}
        </Screen>
        <MenuSheet
          visible={cityOpen}
          onClose={() => setCityOpen(false)}
          title="Area"
          items={[
            {
              key: '__all',
              label: 'All areas',
              onPress: () => {
                setCity('');
                setCityOpen(false);
              },
            },
            ...cities.map((c) => ({
              key: c,
              label: c,
              onPress: () => {
                setCity(c);
                setCityOpen(false);
              },
            })),
          ]}
        />
      </>
    );
  }

  // ── Step 2: when ──
  const taken = (slotData ?? []).filter((b) => b.locationId === loc.id && b.date === date).sort((a, b) => a.startMin - b.startMin);
  const timeErr = locTimeError({ rows: slotData ?? [], locId: loc.id, date, start, end, held: holdRanges(hold.others, 5) });
  const startOpts = LOC_TIMES.filter((t) => date !== today || (toMin(t) ?? 0) > nowMin).map((t) => ({ value: t, label: hmLabel(t) }));
  const endOpts = LOC_TIMES.filter((t) => !!start && t > start).map((t) => ({ value: t, label: hmLabel(t) }));
  const ready = !!slotData && !!start && !!end && !!project && !timeErr && !hold.holdErr;
  const needsApproval = !!loc.approvalRequired;
  const length = sm !== null && em !== null && em > sm ? durationLabel(em - sm) : '';

  return (
    <>
      <Screen
        header={<NavHeader title="Book a location" />}
        onRefresh={() => Promise.all([slotRows.refetch(), feed.refetch()])}
        footer={
          <ActionBar note={timeErr || (start && end && !project ? 'Pick a project code.' : length ? `${hmLabel(start)} – ${hmLabel(end)} · ${length}` : 'Pick a start and end time.')}>
            <Button title="Review booking" icon={<ArrowRight />} disabled={!ready} onPress={() => setConfirm(true)} />
          </ActionBar>
        }>
        <AccountRow
          icon={MapPin}
          module="tasks"
          title={loc.name || 'Location'}
          sub={loc.address || cityOfLocation(loc) || 'Shooting location'}
          actionLabel="Change"
          onPress={() => {
            setLoc(null);
            setStart('');
            setEnd('');
          }}
          accessibilityLabel={`${loc.name || 'Location'}. Change location`}
        />
        {needsApproval ? (
          <Banner tone="info" icon={Hourglass} title={`Needs approval${loc.approverName ? ` by ${loc.approverName}` : ''}`} message="The time is kept for you while they decide." />
        ) : null}
        <DayStrip
          value={date}
          onChange={(d) => {
            setDate(d);
            setStart('');
            setEnd('');
          }}
          today={today}
          days={8}
          maxDays={MAX_DAYS}
        />
        <ActivityList title={`Booked on ${dateLabel(date, today)}`} empty={slotData ? 'Nothing booked that day yet.' : slotRows.isError ? 'Couldn’t load the bookings. Pull to refresh.' : undefined} loading={!slotData && !slotRows.isError} loadingRows={1}>
          {taken.map((b) => (
            <ActivityRow key={b.id} module="tasks" icon={MapPin} title={`${hmLabel(minToHm(b.startMin))} – ${hmLabel(minToHm(b.endMin))}`} subtitle={`${b.bookedBy || '—'}${b.project ? ` · ${b.project}` : ''}`} note="Keep 30 minutes free either side" />
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
                setEnd('');
                setErr('');
              }}
              placeholder="Start"
            />
            <SelectField
              label="End"
              value={end || null}
              options={endOpts}
              onChange={(v) => {
                setEnd(v);
                setErr('');
              }}
              placeholder="End"
              disabled={!start}
            />
          </FieldPair>
          <HoldNotice secsLeft={hold.secsLeft} holdErr={hold.holdErr} />
          <ProjectPicker variant="row" value={project} onChange={setProject} projects={projects.data} loading={projects.isLoading} module="tasks" />
          <TextField label="Channel (optional)" value={channel} onChangeText={setChannel} placeholder="e.g. YintTalks" />
        </Card>
        {err ? <Banner tone="danger" title="Couldn’t book it" message={err} /> : null}
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={needsApproval ? 'Ask for this location?' : 'Book this location?'}
        from={{ title: 'You', subtitle: 'Booking', avatar: { name: me?.name || 'You' } }}
        to={{ title: loc.name || 'Location', subtitle: cityOfLocation(loc) || 'Shooting location', icon: typeIcon('locations'), module: 'tasks' }}
        detailsTitle="Booking"
        confirmLabel={needsApproval ? 'Swipe to request' : 'Swipe to book'}
        onConfirm={() => book.mutate()}
        loading={book.isPending}
        note={
          needsApproval
            ? `${loc.approverName || 'The approver'} gets an email and WhatsApp to approve it. You get one too.`
            : 'You get a confirmation by email and WhatsApp.'
        }>
        <SummaryCard
          rows={[
            { key: 'day', label: 'Date', value: dateLabel(date, today) },
            { key: 'time', label: 'Time', value: start && end ? `${hmLabel(start)} – ${hmLabel(end)}` : null },
            { key: 'code', label: 'Project code', value: project?.kekaCode || project?.name || null },
            { key: 'ch', label: 'Channel', value: channel.trim() || null },
          ]}
          hideEmpty
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={done}
        onClose={() => router.dismissTo('/admin/booking')}
        onPrimary={() => router.dismissTo('/admin/booking')}
        title={needsApproval ? 'Request sent' : 'Location booked'}
        subtitle={
          needsApproval
            ? `${loc.approverName || 'The approver'} will approve or reject it. The time is kept for you meanwhile.`
            : `${loc.name || 'It'} is yours on ${dateLabel(date, today)}, ${hmLabel(start)} – ${hmLabel(end)}.`
        }>
        {loc.contact || loc.phone || loc.email ? (
          <SummaryCard
            title="Location contact"
            rows={[
              { key: 'n', label: 'Contact', value: loc.contact || null },
              { key: 'p', label: 'Phone', value: loc.phone || null },
              { key: 'e', label: 'Email', value: loc.email || null },
            ]}
            hideEmpty
          />
        ) : null}
      </SuccessSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  form: { gap: space.md },
}));
