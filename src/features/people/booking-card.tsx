// HR editing someone else's profile — the editable part of the website's EmpProfileModal
// (dash.html:29841-30040), on the roster person screen:
//   BookingCard       "Bookable as a professional" (professionalAvailable; turning it off clears the
//                     type, :29978), the professional type (tenant profTypes, :29988) and the
//                     specialisations people filter by when booking (saved as you add or remove, :29874).
//   ManagerLineCard   for a manager or admin row: who they report to (reportingTo, any Admin or HR,
//                     :30006).
// Shown to features/people/access canEditBooking (the web's canAdd minus `manager`, whose writes the
// server refuses). Each change is a plain PUT /users/:id with a toast: nothing here is irreversible or
// messages anyone.

import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import type { ProfType } from '@/api/me';
import { type RosterRecord, saveAccountFields, useInvalidatePeople } from '@/api/people';
import { roleLabel } from '@/features/people/roster';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import { Banner, Button, Card, CardHeader, hitSlopFor, isDarkScheme, ListRow, SelectField, Text, TextField, toast } from '@/ui';

function useSaver(userId: string) {
  const invalidate = useInvalidatePeople();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await saveAccountFields(userId, patch);
      await invalidate();
      toast.show(done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}

export function BookingCard({ row, profTypes }: { row: RosterRecord; profTypes: ProfType[] | undefined }) {
  const { busy, error, save } = useSaver(row.id);
  // Local copies so a toggle answers at once; the roster refetch brings the server's values back.
  const [on, setOn] = useState(row.professionalAvailable);
  const [type, setType] = useState(row.professionalType);
  const [specs, setSpecs] = useState(row.specializations);
  const [draft, setDraft] = useState('');
  const types = (Array.isArray(profTypes) ? profTypes : []).filter((t) => t && t.id && t.active !== false);
  const offTrack = isDarkScheme() ? palette.hairline : palette.surfaceSunken;

  const toggle = async () => {
    const next = !on;
    setOn(next);
    const ok = await save(next ? { professionalAvailable: true } : { professionalAvailable: false, professionalType: '' }, next ? 'They can be booked now.' : 'They can no longer be booked.');
    if (!ok) setOn(!next);
    else if (!next) setType('');
  };
  const pickType = async (v: string) => {
    const prev = type;
    setType(v);
    if (!(await save({ professionalType: v }, 'Professional type saved.'))) setType(prev);
  };
  const saveSpecs = async (next: string[]) => {
    const prev = specs;
    setSpecs(next);
    if (!(await save({ specializations: next }, 'Specialisations saved.'))) setSpecs(prev);
  };
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (specs.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    setDraft('');
    void saveSpecs([...specs, v]);
  };

  return (
    <Card tone="surface" style={styles.card}>
      <CardHeader title="Booking" />
      <Pressable
        onPress={toggle}
        disabled={busy}
        accessibilityRole="switch"
        accessibilityLabel="Bookable as a professional"
        accessibilityHint="People can book them for shoots and edits"
        accessibilityState={{ checked: on, disabled: busy, busy }}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <ListRow
          title="Bookable as a professional"
          subtitle="People can book them for shoots and edits"
          numberOfLines={2}
          subtitleLines={2}
          right={
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Switch value={on} disabled={busy} trackColor={{ false: offTrack, true: palette.accentDeep }} thumbColor={palette.onAccent} ios_backgroundColor={offTrack} />
            </View>
          }
        />
      </Pressable>
      {on ? (
        <View style={styles.body}>
          <SelectField
            label="Professional type"
            value={type || null}
            options={types.map((t) => ({ value: t.id, label: t.label || t.id }))}
            onChange={(v) => void pickType(v)}
            placeholder="Choose a type"
            hint={type ? null : 'Pick a type so they show up when people search to book.'}
            disabled={busy || !types.length}
          />
          <View style={styles.specs}>
            <Text variant="label" muted>
              Specialisations
            </Text>
            {specs.length ? (
              <View style={styles.chips}>
                {specs.map((sp) => (
                  <View key={sp} style={styles.chip}>
                    <Text variant="caption" numberOfLines={1} style={styles.chipText}>
                      {sp}
                    </Text>
                    <Pressable
                      onPress={() => void saveSpecs(specs.filter((x) => x !== sp))}
                      disabled={busy}
                      hitSlop={hitSlopFor(20)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${sp}`}>
                      <X size={14} color={palette.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="caption" muted>
                None yet. They show as filters when people book a professional.
              </Text>
            )}
            <View style={styles.addRow}>
              <View style={styles.flex}>
                <TextField value={draft} onChangeText={setDraft} placeholder="e.g. Product shoots" returnKeyType="done" onSubmitEditing={add} accessibilityLabel="New specialisation" maxLength={40} />
              </View>
              <Button title="Add" variant="accent" size="md" icon={<Plus />} onPress={add} disabled={busy || !draft.trim()} />
            </View>
          </View>
        </View>
      ) : null}
      {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
    </Card>
  );
}

export function ManagerLineCard({ row, accounts }: { row: RosterRecord; accounts: RosterRecord[] | undefined }) {
  const { busy, error, save } = useSaver(row.id);
  const [to, setTo] = useState(row.reportingTo);
  // :30006 — any Admin or HR account other than themselves.
  const options = [
    { value: '', label: 'No one' },
    ...(Array.isArray(accounts) ? accounts : [])
      .filter((u) => ['admin', 'hr'].includes(u.role) && u.id !== row.id && !u.resigned)
      .map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` })),
  ];
  const pick = async (v: string) => {
    const prev = to;
    setTo(v);
    if (!(await save({ reportingTo: v || null }, 'Reporting manager saved.'))) setTo(prev);
  };
  return (
    <Card tone="surface" style={styles.card}>
      <CardHeader title="Their manager" />
      <SelectField label="Reports to" value={to} options={options} onChange={(v) => void pick(v)} disabled={busy} hint="Admins and HR only, as on the website." />
      {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
    </Card>
  );
}

const styles = themedStyles(() => ({
  card: { gap: space.sm },
  toggle: { borderRadius: radius.md, marginHorizontal: -space.xs },
  pressed: { backgroundColor: palette.surfaceMuted },
  body: { gap: space.md },
  specs: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: space.sm,
    paddingRight: space.xs,
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.glassLine,
    maxWidth: '100%',
  },
  chipText: { flexShrink: 1 },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
}));
