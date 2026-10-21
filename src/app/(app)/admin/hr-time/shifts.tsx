// Shifts (manage) — the website's ShiftsPanel admin cards (dash.html ~L4686): GET /hr/shifts,
// POST /hr/shifts, PUT/DELETE /hr/shifts/:id (hr_time.js ~L105–195). Super Admin and HR with Shifts on.
// Tap a shift to change it; + adds one. Removing a shift also wipes who was on it (the server
// hard-deletes the assignments), so it goes through ConfirmSheet + SwipeToConfirm and says how many
// people go back to company hours. Nobody is messaged.

import { useRouter } from 'expo-router';
import { Clock, Plus, Trash2, UsersRound } from 'lucide-react-native';
import { useState } from 'react';

import { type Shift, useAllShifts } from '@/api/attendance';
import { useShiftActions, useShiftPeople } from '@/api/hrtime';
import { daysLabel, errorText, GateFallback, intOf, NumberField, useHrTimeGate, WeekdayChips, noun } from '@/features/hrtime/ui';
import { durationLabel, hmLabel } from '@/lib/dates';
import { moduleTone } from '@/theme/tokens';
import {
  ActionRow,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  FieldPair,
  NavHeader,
  PillField,
  Screen,
  Sheet,
  SkeletonList,
  SummaryCard,
  Text,
  TimeField,
  toast,
} from '@/ui';

const BLANK: Omit<Shift, 'id'> = { name: '', start_time: '09:30', end_time: '18:30', grace_minutes: 15, half_day_minutes: 240, full_day_minutes: 480, weekly_off: [0] };

export default function ManageShiftsScreen() {
  const router = useRouter();
  const { pending, allowed } = useHrTimeGate('shifts');
  const shifts = useAllShifts(allowed);
  const people = useShiftPeople(allowed);
  const [edit, setEdit] = useState<{ shift: Shift | null; key: number } | null>(null);
  const header = (
    <NavHeader title="Shifts" actions={allowed ? [{ icon: Plus, label: 'New shift', onPress: () => setEdit({ shift: null, key: Date.now() }) }] : undefined} />
  );
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const list = (Array.isArray(shifts.data) ? shifts.data : []).filter((s) => s && s.id);
  const onShift = (id: string) => (people.data ?? []).filter((p) => p.shift_id === id).length;
  const counted = !!people.data;

  return (
    <Screen header={header} onRefresh={() => Promise.all([shifts.refetch(), people.refetch()])}>
      {shifts.isPending ? (
        <SkeletonList rows={3} avatar tone="surface" />
      ) : shifts.error && !list.length ? (
        <ErrorState message={errorText(shifts.error)} onRetry={() => void shifts.refetch()} />
      ) : !list.length ? (
        <Card tone="surface">
          <EmptyState
            icon={<Clock color={moduleTone.shifts.fg} strokeWidth={1.8} />}
            title="No shifts yet"
            message="Everyone follows the company’s normal hours."
            action={<Button title="New shift" icon={<Plus />} onPress={() => setEdit({ shift: null, key: Date.now() })} />}
          />
        </Card>
      ) : (
        <ActivityList title={`${list.length} ${noun(list.length, 'shift')}`}>
          {list.map((s) => {
            const n = onShift(s.id);
            return (
              <ActivityRow
                key={s.id}
                module="shifts"
                icon={Clock}
                title={s.name || 'Shift'}
                subtitle={`${hmLabel(s.start_time)} – ${hmLabel(s.end_time)} · off ${daysLabel(s.weekly_off)}`}
                note={counted ? `${n} ${noun(n, 'person', 'people')} · late after ${durationLabel(s.grace_minutes)}` : `Late after ${durationLabel(s.grace_minutes)}`}
                chevron
                accessibilityHint="Opens the shift to change or remove it"
                onPress={() => setEdit({ shift: s, key: Date.now() })}
              />
            );
          })}
        </ActivityList>
      )}

      <ActivityList>
        <ActivityRow
          module="shifts"
          icon={UsersRound}
          title="Who works which shift"
          subtitle="Put people on a shift or back on company hours"
          chevron
          onPress={() => router.push('/admin/hr-time/shift-people')}
        />
      </ActivityList>

      {edit ? <ShiftSheet key={edit.key} shift={edit.shift} people={edit.shift ? onShift(edit.shift.id) : 0} onClose={() => setEdit(null)} /> : null}
    </Screen>
  );
}

function ShiftSheet({ shift, people, onClose }: { shift: Shift | null; people: number; onClose: () => void }) {
  const { save, remove } = useShiftActions();
  const start = shift ?? BLANK;
  const [name, setName] = useState(start.name);
  const [from, setFrom] = useState(start.start_time);
  const [to, setTo] = useState(start.end_time);
  const [grace, setGrace] = useState(String(start.grace_minutes));
  const [half, setHalf] = useState(String(start.half_day_minutes));
  const [full, setFull] = useState(String(start.full_day_minutes));
  const [off, setOff] = useState<number[]>(Array.isArray(start.weekly_off) ? start.weekly_off : []);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const saving = save.isPending;
  const minsHint = (v: string) => (intOf(v) != null ? `= ${durationLabel(intOf(v))}` : 'In minutes');

  const submit = async () => {
    setError(null);
    const g = intOf(grace);
    const h = intOf(half);
    const f = intOf(full);
    if (name.trim().length < 2) return setError('Give the shift a name.');
    if (g == null || h == null || f == null) return setError('Fill in grace, half day and full day as whole minutes.');
    try {
      await save.mutateAsync({
        id: shift?.id,
        input: { name: name.trim(), start_time: from, end_time: to, grace_minutes: g, half_day_minutes: h, full_day_minutes: f, weekly_off: [...off].sort((a, b) => a - b) },
      });
      toast.show(shift ? 'Shift saved.' : 'Shift added.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const doRemove = async () => {
    if (!shift) return;
    try {
      await remove.mutateAsync(shift.id);
      setConfirmRemove(false);
      toast.show('Shift removed.');
      onClose();
    } catch (e) {
      setConfirmRemove(false);
      setError(errorText(e));
    }
  };

  return (
    <>
      <Sheet
        visible={!confirmRemove}
        onClose={saving ? () => {} : onClose}
        dirty={!saving && (name !== start.name || from !== start.start_time || to !== start.end_time || grace !== String(start.grace_minutes) || half !== String(start.half_day_minutes) || full !== String(start.full_day_minutes) || daysLabel(off) !== daysLabel(start.weekly_off))}
        title={shift ? 'Change shift' : 'New shift'}
        subtitle={shift && people ? `${people} ${noun(people, 'person', 'people')} on it` : undefined}
        footer={
          <>
            {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
            {shift ? (
              <Text variant="caption" muted align="center">
                Changes how late and half days are marked for everyone on it, from now on.
              </Text>
            ) : null}
            <ActionRow context="sheet">
              {shift ? <Button title="Remove" variant="danger" icon={<Trash2 />} onPress={() => setConfirmRemove(true)} disabled={saving} /> : null}
              <Button title={shift ? 'Save' : 'Add shift'} loading={saving} onPress={() => void submit()} />
            </ActionRow>
          </>
        }>
        <PillField label="Name" value={name} onChangeText={setName} maxLength={60} placeholder="e.g. Late edit shift" />
        <FieldPair>
          <TimeField label="Starts" value={from} onChange={setFrom} />
          <TimeField label="Ends" value={to} onChange={setTo} />
        </FieldPair>
        <Text variant="caption" muted>
          Shifts can’t run past midnight.
        </Text>
        <NumberField label="Grace before late" value={grace} onChange={setGrace} unit="min" hint={minsHint(grace)} />
        <FieldPair>
          <NumberField label="Half day from" value={half} onChange={setHalf} unit="min" hint={minsHint(half)} />
          <NumberField label="Full day from" value={full} onChange={setFull} unit="min" hint={minsHint(full)} />
        </FieldPair>
        <WeekdayChips value={off} onChange={setOff} />
      </Sheet>
      {shift ? (
        <ConfirmSheet
          visible={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          title="Remove this shift?"
          from={{ title: shift.name, subtitle: `${hmLabel(shift.start_time)} – ${hmLabel(shift.end_time)}`, icon: Clock, module: 'shifts' }}
          to={{ title: 'Company hours', subtitle: `${people} ${noun(people, 'person', 'people')} move back` }}
          detailsTitle="What happens"
          confirmLabel="Swipe to remove"
          onConfirm={() => void doRemove()}
          loading={remove.isPending}
          note="Nobody is messaged.">
          <SummaryCard
            rows={[
              { label: 'People on it', value: `${people} go back to company hours` },
              { label: 'Who was on it', value: 'Not kept — adding it again starts empty' },
              { label: 'Past days', value: 'Stay as they were' },
            ]}
          />
        </ConfirmSheet>
      ) : null}
    </>
  );
}
