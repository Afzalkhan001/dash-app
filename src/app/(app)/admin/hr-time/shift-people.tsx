// Who works which shift — the website's "Who works which shift" card (dash.html ShiftsPanel ~L4700):
// GET /hr/shifts/assignments, PUT /hr/shifts/assignments {employee_ids[≤500], shift_id | null}
// (hr_time.js ~L133–171; null = back on company hours). Super Admin and HR with Shifts on.
// Tick people, then pick a shift (or "Company hours") in the sheet. Nobody is messaged.

import { Building2, Clock } from 'lucide-react-native';
import { useState } from 'react';

import { useAllShifts } from '@/api/attendance';
import { type ShiftPerson, useShiftActions, useShiftPeople } from '@/api/hrtime';
import { PeopleSelectScreen } from '@/features/hrtime/people-select';
import { errorText, GateFallback, useHrTimeGate, noun } from '@/features/hrtime/ui';
import { hmLabel } from '@/lib/dates';
import { ActionRow, Banner, Button, NavHeader, SelectTiles, Sheet, toast } from '@/ui';

const NONE = '__company';

export default function ShiftPeopleScreen() {
  const { pending, allowed } = useHrTimeGate('shifts');
  const people = useShiftPeople(allowed);
  const shifts = useAllShifts(allowed);
  const { assign } = useShiftActions();
  const [target, setTarget] = useState<{ ids: string[]; clear: () => void; key: number } | null>(null);
  const header = <NavHeader title="Who works which shift" />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const list = (people.data ?? []).filter((p) => p && p.id);
  const all = Array.isArray(shifts.data) ? shifts.data : [];
  const byId = new Map(all.map((s) => [s.id, s]));
  const nameOf = (p: ShiftPerson) => (p.shift_id ? (byId.get(p.shift_id)?.name ?? 'Removed shift') : 'Company hours');

  return (
    <PeopleSelectScreen
      header={header}
      intro="People without a shift keep the company’s hours and weekly off."
      people={list}
      loading={people.isPending}
      error={people.error ? errorText(people.error) : null}
      onRetry={() => void people.refetch()}
      onRefresh={() => Promise.all([people.refetch(), shifts.refetch()])}
      filters={[...all.map((s) => ({ key: s.id, label: s.name })), { key: NONE, label: 'Company hours' }]}
      filterOf={(p) => p.shift_id ?? NONE}
      subOf={(p) => p.department || 'No team'}
      statusOf={(p) => ({ label: nameOf(p), tone: p.shift_id ? 'info' : 'neutral' })}
      actionLabel="Set shift"
      busy={assign.isPending}
      onAction={(ids, clear) => setTarget({ ids, clear, key: Date.now() })}
      sheet={
        target ? (
          <ShiftPickSheet
            key={target.key}
            count={target.ids.length}
            single={target.ids.length === 1 ? list.find((p) => p.id === target.ids[0]) : undefined}
            options={all.map((s) => ({ value: s.id, label: s.name, sub: `${hmLabel(s.start_time)} – ${hmLabel(s.end_time)}`, icon: Clock }))}
            onClose={() => setTarget(null)}
            onSave={async (shiftId) => {
              const r = await assign.mutateAsync({ employee_ids: target.ids, shift_id: shiftId });
              toast.show(`Saved for ${r.updated} ${noun(r.updated, 'person', 'people')}.`);
              target.clear();
              setTarget(null);
            }}
            saving={assign.isPending}
          />
        ) : null
      }
    />
  );
}

function ShiftPickSheet({
  count,
  single,
  options,
  onClose,
  onSave,
  saving,
}: {
  count: number;
  single?: ShiftPerson;
  options: { value: string; label: string; sub: string; icon: typeof Clock }[];
  onClose: () => void;
  onSave: (shiftId: string | null) => Promise<void>;
  saving: boolean;
}) {
  const [value, setValue] = useState<string>(single ? (single.shift_id ?? NONE) : (options[0]?.value ?? NONE));
  const [error, setError] = useState<string | null>(null);
  const who = single ? single.name : `${count} people`;
  const save = async () => {
    setError(null);
    try {
      await onSave(value === NONE ? null : value);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Sheet
      visible
      onClose={saving ? () => {} : onClose}
      title="Set shift"
      subtitle={`For ${who}`}
      footer={
        <>
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
          <ActionRow context="sheet">
            <Button title="Cancel" variant="accent" onPress={onClose} disabled={saving} />
            <Button title="Save" loading={saving} onPress={() => void save()} />
          </ActionRow>
        </>
      }>
      <SelectTiles
        columns={2}
        value={value}
        onChange={setValue}
        accessibilityLabel="Shift"
        options={[...options, { value: NONE, label: 'Company hours', sub: 'No shift of their own', icon: Building2 }]}
      />
    </Sheet>
  );
}
