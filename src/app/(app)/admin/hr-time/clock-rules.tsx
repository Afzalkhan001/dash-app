// Clock-in rules — the website's "Clock-in rules by employee" (dash.html AttendancePeople ~L4466):
// GET /hr/attendance/people, PUT /hr/attendance/people {employee_ids[≤500], mode, location_ids}
// (hr.js ~L674–720). Super Admin and HR only.
//
// Plain names on the phone, the website's scheme names underneath (HR_RULE_LABEL, dash.html:4463):
//   default  Company default   — follows the company clock-in policy
//   geofence Office only       — "General capture scheme"
//   flexible Office or field   — "Field capture scheme"
//   remote   Always remote     — "Permanent WFH capture scheme"
// Office ticks apply to Office only / Office or field; none ticked means every office. More than 20
// people at once goes through ConfirmSheet + SwipeToConfirm. Nobody is messaged.

import { Building2, Home, MapPin, Navigation, UserCog } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type ClockMode, type ClockRulePerson, useAttendanceSetupActions, useClockRules, useOffices } from '@/api/hrtime';
import { PeopleSelectScreen } from '@/features/hrtime/people-select';
import { errorText, GateFallback, Tick, useHrTimeGate, noun } from '@/features/hrtime/ui';
import type { StatusTone } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ActionRow, Banner, Button, ConfirmSheet, ListRow, NavHeader, SelectTiles, Sheet, SummaryCard, Text, toast } from '@/ui';

const RULES: Record<ClockMode, { label: string; web: string; tone: StatusTone }> = {
  default: { label: 'Company default', web: 'Follows the company policy', tone: 'neutral' },
  geofence: { label: 'Office only', web: 'General capture scheme', tone: 'info' },
  flexible: { label: 'Office or field', web: 'Field capture scheme', tone: 'pending' },
  remote: { label: 'Always remote', web: 'Permanent WFH capture scheme', tone: 'done' },
};
const ICONS = { default: Building2, geofence: MapPin, flexible: Navigation, remote: Home };
const BIG = 20;

export default function ClockRulesScreen() {
  const { pending, allowed } = useHrTimeGate('attendance');
  const people = useClockRules(allowed);
  const offices = useOffices(allowed);
  const { setRules } = useAttendanceSetupActions();
  const [target, setTarget] = useState<{ ids: string[]; clear: () => void; key: number } | null>(null);
  const header = <NavHeader title="Clock-in rules" />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const officeName = new Map((offices.data ?? []).map((o) => [o.id, o.name]));
  const list = (people.data ?? []).filter((p) => p && p.id);
  const sub = (p: ClockRulePerson) => {
    const where =
      p.mode === 'geofence' || p.mode === 'flexible'
        ? p.location_ids.length
          ? p.location_ids.map((id) => officeName.get(id) ?? 'Removed office').join(', ')
          : 'Any office'
        : null;
    return [p.department || 'No team', where].filter(Boolean).join(' · ');
  };

  return (
    <PeopleSelectScreen
      header={header}
      intro="How each person may clock in. Most people follow the company default."
      people={list}
      loading={people.isPending}
      error={people.error ? errorText(people.error) : null}
      onRetry={() => void people.refetch()}
      onRefresh={() => Promise.all([people.refetch(), offices.refetch()])}
      filters={(Object.keys(RULES) as ClockMode[]).map((k) => ({ key: k, label: RULES[k].label }))}
      filterOf={(p) => p.mode}
      subOf={sub}
      statusOf={(p) => ({ label: RULES[p.mode]?.label ?? p.mode, tone: RULES[p.mode]?.tone ?? 'neutral' })}
      actionLabel="Set rule"
      busy={setRules.isPending}
      onAction={(ids, clear) => setTarget({ ids, clear, key: Date.now() })}
      sheet={
        target ? (
          <RuleSheet
            key={target.key}
            people={list.filter((p) => target.ids.includes(p.id))}
            offices={(offices.data ?? []).map((o) => ({ id: o.id, name: o.name }))}
            onClose={() => setTarget(null)}
            onDone={() => {
              target.clear();
              setTarget(null);
            }}
          />
        ) : null
      }
    />
  );
}

function RuleSheet({
  people,
  offices,
  onClose,
  onDone,
}: {
  people: ClockRulePerson[];
  offices: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { setRules } = useAttendanceSetupActions();
  const first = people[0];
  const same = people.every((p) => p.mode === first?.mode);
  const [mode, setMode] = useState<ClockMode>(same && first ? first.mode : 'geofence');
  const [locs, setLocs] = useState<string[]>(same && first ? first.location_ids.filter((id) => offices.some((o) => o.id === id)) : []);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const needsOffices = mode === 'geofence' || mode === 'flexible';
  const saving = setRules.isPending;
  const who = people.length === 1 ? (first?.name ?? '1 person') : `${people.length} people`;

  const apply = async () => {
    setError(null);
    try {
      const r = await setRules.mutateAsync({ employee_ids: people.map((p) => p.id), mode, location_ids: needsOffices ? locs : [] });
      setConfirm(false);
      toast.show(`Saved for ${r.updated} ${noun(r.updated, 'person', 'people')}.`);
      onDone();
    } catch (e) {
      setConfirm(false);
      setError(errorText(e));
    }
  };
  const whereText = needsOffices ? (locs.length ? locs.map((id) => offices.find((o) => o.id === id)?.name ?? '').join(', ') : 'Any office') : '—';

  return (
    <>
      <Sheet
        visible={!confirm}
        onClose={saving ? () => {} : onClose}
        title="Set clock-in rule"
        subtitle={`For ${who}`}
        footer={
          <>
            {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
            <ActionRow context="sheet">
              <Button title="Cancel" variant="accent" onPress={onClose} disabled={saving} />
              <Button title={`Apply to ${who}`} loading={saving} onPress={() => (people.length > BIG ? setConfirm(true) : void apply())} />
            </ActionRow>
          </>
        }>
        <SelectTiles
          columns={2}
          value={mode}
          onChange={setMode}
          accessibilityLabel="Clock-in rule"
          options={(Object.keys(RULES) as ClockMode[]).map((k) => ({ value: k, label: RULES[k].label, sub: RULES[k].web, icon: ICONS[k] }))}
        />
        {needsOffices ? (
          <View style={styles.group}>
            <Text variant="labelStrong" muted>
              Which offices
            </Text>
            {offices.length ? (
              offices.map((o) => {
                const on = locs.includes(o.id);
                return (
                  <ListRow
                    key={o.id}
                    title={o.name}
                    right={<Tick on={on} />}
                    onPress={() => setLocs((s) => (on ? s.filter((x) => x !== o.id) : [...s, o.id]))}
                    accessibilityLabel={`${o.name}, ${on ? 'ticked' : 'not ticked'}`}
                  />
                );
              })
            ) : (
              <Banner tone="warning" message="There are no offices yet. Add one in Offices and clock-in first." />
            )}
            <Text variant="caption" muted>
              None ticked means any office.
            </Text>
          </View>
        ) : (
          <Text variant="caption" muted>
            {mode === 'remote' ? 'They can clock in from anywhere; it is marked remote.' : 'They follow the company clock-in policy.'}
          </Text>
        )}
      </Sheet>
      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={`Change ${people.length} people?`}
        from={{ title: `${people.length} people`, subtitle: 'Ticked', icon: UserCog, module: 'attendance' }}
        to={{ title: RULES[mode].label, subtitle: RULES[mode].web, icon: ICONS[mode], module: 'attendance' }}
        confirmLabel="Swipe to apply"
        onConfirm={() => void apply()}
        loading={saving}
        note="Applies from their next clock-in. Nobody is messaged.">
        <SummaryCard rows={[{ label: 'Rule', value: RULES[mode].label }, { label: 'Offices', value: whereText }]} />
      </ConfirmSheet>
    </>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.xs },
}));
