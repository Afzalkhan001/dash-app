// Add or change a holiday (dash.html HolidaysPanel admin form ~L4660): date, name, Optional.
// POST /hr/holidays, PUT /hr/holidays/:id (409 "There is already a holiday on that date." shown
// as the server says it). Remove is a hard delete — it can be added again, but it changes everyone's
// leave-day counts — so it goes through ConfirmSheet + SwipeToConfirm. Nobody is messaged.

import { Palmtree, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import type { Holiday } from '@/api/hr';
import { useHolidayActions } from '@/api/hrtime';
import { errorText, ToggleRow } from '@/features/hrtime/ui';
import { dateLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ActionRow, Banner, Button, Card, ConfirmSheet, DateField, PillField, Sheet, SummaryCard, toast } from '@/ui';

export function HolidaySheet({ holiday, defaultDate, today, onClose }: { holiday: Holiday | null; defaultDate: string; today: string; onClose: () => void }) {
  const { save, remove } = useHolidayActions();
  const [date, setDate] = useState(holiday?.date ?? defaultDate);
  const [name, setName] = useState(holiday?.name ?? '');
  const [optional, setOptional] = useState(!!holiday?.optional);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const saving = save.isPending;
  const dirty = !holiday || date !== holiday.date || name !== holiday.name || optional !== !!holiday.optional;

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Give the holiday a name.');
    try {
      await save.mutateAsync({ id: holiday?.id, input: { date, name: name.trim(), optional } });
      toast.show(holiday ? 'Holiday saved.' : 'Holiday added.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const doRemove = async () => {
    if (!holiday) return;
    try {
      await remove.mutateAsync(holiday.id);
      setConfirm(false);
      toast.show('Holiday removed.');
      onClose();
    } catch (e) {
      setConfirm(false);
      setError(errorText(e));
    }
  };

  return (
    <>
      <Sheet
        visible={!confirm}
        onClose={saving ? () => {} : onClose}
        dirty={dirty && !saving && !!holiday}
        title={holiday ? 'Change holiday' : 'Add a holiday'}
        footer={
          <>
            {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
            <ActionRow context="sheet">
              {holiday ? <Button title="Remove" variant="danger" icon={<Trash2 />} onPress={() => setConfirm(true)} disabled={saving} /> : null}
              <Button title={holiday ? 'Save' : 'Add holiday'} loading={saving} disabled={!dirty} onPress={() => void submit()} />
            </ActionRow>
          </>
        }>
        <DateField label="Date" value={date} onChange={setDate} />
        <PillField label="Name" value={name} onChangeText={setName} maxLength={80} placeholder="e.g. Diwali" />
        <Card tone="surface" style={styles.toggle}>
          <ToggleRow
            label="Optional holiday"
            sub={optional ? 'People may take it or work as usual. It is not a day off for leave counts.' : 'A day off for everyone. Leave doesn’t count it.'}
            value={optional}
            onChange={setOptional}
          />
        </Card>
      </Sheet>
      {holiday ? (
        <ConfirmSheet
          visible={confirm}
          onClose={() => setConfirm(false)}
          title="Remove this holiday?"
          from={{ title: holiday.name, subtitle: dateLabel(holiday.date, today), icon: Palmtree, module: 'holidays' }}
          to={{ title: 'A normal day', subtitle: 'For everyone' }}
          confirmLabel="Swipe to remove"
          onConfirm={() => void doRemove()}
          loading={remove.isPending}
          note="Nobody is messaged. You can add it again later.">
          <SummaryCard rows={[{ label: 'Leave on that day', value: 'Counts as a working day from now on' }]} />
        </ConfirmSheet>
      ) : null}
    </>
  );
}

const styles = themedStyles(() => ({
  toggle: { paddingVertical: space.xs, paddingHorizontal: space.xs },
}));
