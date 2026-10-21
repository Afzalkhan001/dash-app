// Offices and clock-in — the website's Attendance → Setup "Office locations" and "Attendance policy"
// cards (dash.html AttendanceSetup ~L4522). Super Admin and HR only (features/hrtime/access).
//
//   GET/POST/PUT/DELETE /hr/locations      hr.js ~L624–672 (remove is a soft delete with no restore)
//   GET/PUT /hr/attendance/settings        hr.js ~L608–622 (normaliseAttendanceSettings ~L125)
//
// Phone version (spec §4.2): no map. An office is placed with "Use where I'm standing" (one fresh
// high-accuracy GPS fix, refused when it is worse than ±50 m) or by typing the coordinates under
// "Advanced"; the radius is a preset or a custom number. The policy card also offers the weekly off
// and the fix-attendance window, which the server accepts but the website form does not show.
// Removing an office can't be undone, so it goes through ConfirmSheet + SwipeToConfirm. Nobody is
// messaged by anything here.

import { router } from 'expo-router';
import { Building2, Crosshair, Map as MapIcon, MapPin, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type AttendanceSettings, type OfficeLocation, useAttendanceSettings } from '@/api/attendance';
import { useAttendanceSetupActions, useOffices } from '@/api/hrtime';
import { haversineM } from '@/features/attendance/format';
import { getPosition } from '@/features/attendance/use-clock';
import { daysLabel, errorText, GateFallback, intOf, NumberField, ToggleRow, useHrTimeGate, WeekdayChips, noun } from '@/features/hrtime/ui';
import { durationLabel, hmLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
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
  KeyValueList,
  NavHeader,
  PillButton,
  PillField,
  Screen,
  Segmented,
  Sheet,
  Skeleton,
  SkeletonList,
  SummaryCard,
  SummaryHero,
  Text,
  TimeField,
  toast,
} from '@/ui';

const RADII = ['50', '100', '150', '200', '300', '500'];
const MAX_FIX_M = 50;
const keepOpen = () => {};

export default function OfficesScreen() {
  const { pending, allowed } = useHrTimeGate('attendance');
  const offices = useOffices(allowed);
  const settings = useAttendanceSettings(allowed);
  const [edit, setEdit] = useState<{ office: OfficeLocation | null; key: number } | null>(null);
  const [policyKey, setPolicyKey] = useState<number | null>(null);
  const header = (
    <NavHeader
      title="Offices and clock-in"
      actions={allowed ? [{ icon: Plus, label: 'Add office', onPress: () => setEdit({ office: null, key: Date.now() }) }] : undefined}
    />
  );
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const list = (offices.data ?? []).filter((o) => o && o.id);
  const s = settings.data;

  return (
    <Screen header={header} onRefresh={() => Promise.all([offices.refetch(), settings.refetch()])}>
      {offices.isPending ? (
        <Skeleton height={176} radius={radius.xxl} />
      ) : (
        <SummaryHero
          icon={Building2}
          module="attendance"
          label="Offices people clock in at"
          value={list.length}
          unit={noun(list.length, 'office')}
          info={s ? { label: 'Clock in inside an office', value: s.requireGeofence ? 'On' : 'Off' } : undefined}
          sub={s ? (s.allowRemote ? 'People may also clock in from elsewhere (marked remote)' : 'Clocking in from elsewhere is off') : undefined}
        />
      )}

      {offices.isPending ? (
        <SkeletonList rows={2} avatar tone="surface" />
      ) : offices.error && !list.length ? (
        <ErrorState message={errorText(offices.error)} onRetry={() => void offices.refetch()} />
      ) : !list.length ? (
        <Card tone="surface">
          <EmptyState
            icon={<MapPin color={moduleTone.attendance.fg} strokeWidth={1.8} />}
            title="No office yet"
            message="Nobody can clock in inside an office until you add one."
            action={<Button title="Add office" icon={<Plus />} onPress={() => setEdit({ office: null, key: Date.now() })} />}
          />
        </Card>
      ) : (
        <ActivityList title="Offices">
          {list.map((o) => (
            <ActivityRow
              key={o.id}
              module="attendance"
              icon={MapPin}
              title={o.name || 'Office'}
              subtitle={[`${o.radius_m} m around the centre`, o.address].filter(Boolean).join(' · ')}
              chevron
              accessibilityHint="Opens the office to change or remove it"
              onPress={() => setEdit({ office: o, key: Date.now() })}
            />
          ))}
        </ActivityList>
      )}
      {/* Integrator pass 3: the website's map (OsmMap) is admin/advanced/office-map, same gate (canSetUpAttendance). */}
      <Button variant="text" title="Place offices on a map" icon={<MapIcon />} onPress={() => router.push('/admin/advanced/office-map')} />

      {settings.isPending ? (
        <Skeleton height={320} radius={radius.xl} />
      ) : settings.error || !s ? (
        <ErrorState message={errorText(settings.error)} onRetry={() => void settings.refetch()} />
      ) : (
        <SummaryCard
          title="Company clock-in policy"
          right={<PillButton label="Change" icon={<Pencil size={14} color={palette.text} />} chevron={false} onPress={() => setPolicyKey(Date.now())} />}
          rows={[
            { label: 'Hours', value: `${hmLabel(s.shiftStart)} – ${hmLabel(s.shiftEnd)}` },
            { label: 'Grace before late', value: durationLabel(s.graceMinutes) },
            { label: 'Half day from', value: durationLabel(s.halfDayMinutes) },
            { label: 'Full day from', value: durationLabel(s.fullDayMinutes) },
            { label: 'Weekly off', value: daysLabel(s.weeklyOff) },
            { label: 'GPS must be within', value: `±${s.maxAccuracyM} m` },
            { label: 'Fix attendance', value: `Up to ${s.regularizationWindowDays} ${noun(s.regularizationWindowDays, 'day')} back` },
          ]}
        />
      )}
      <Text variant="caption" muted align="center">
        A shift, where someone has one, replaces these hours and weekly off.
      </Text>

      {edit ? <OfficeSheet key={edit.key} office={edit.office} others={list} onClose={() => setEdit(null)} /> : null}
      {policyKey && s ? <PolicySheet key={policyKey} settings={s} onClose={() => setPolicyKey(null)} /> : null}
    </Screen>
  );
}

// ── Office sheet ─────────────────────────────────────────────────────────────
type Fix = { lat: number; lng: number; accuracy: number };

function OfficeSheet({ office, others, onClose }: { office: OfficeLocation | null; others: OfficeLocation[]; onClose: () => void }) {
  const { saveOffice, removeOffice } = useAttendanceSetupActions();
  const [name, setName] = useState(office?.name ?? '');
  const [address, setAddress] = useState(office?.address ?? '');
  const startRadius = String(office?.radius_m ?? 150);
  const [preset, setPreset] = useState(RADII.includes(startRadius) ? startRadius : 'custom');
  const [custom, setCustom] = useState(RADII.includes(startRadius) ? '' : startRadius);
  const [lat, setLat] = useState(office ? String(office.lat) : '');
  const [lng, setLng] = useState(office ? String(office.lng) : '');
  const [advanced, setAdvanced] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const radiusM = preset === 'custom' ? intOf(custom) : Number(preset);
  const latN = Number(lat);
  const lngN = Number(lng);
  const hasPoint = lat.trim() !== '' && lng.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lngN) && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;
  const fromCentre = fix && hasPoint ? Math.round(haversineM(fix.lat, fix.lng, latN, lngN)) : null;
  const saving = saveOffice.isPending;
  const dirty =
    !office ||
    name !== office.name ||
    address !== (office.address ?? '') ||
    radiusM !== office.radius_m ||
    latN !== office.lat ||
    lngN !== office.lng;

  const locateMe = async () => {
    setGpsError(null);
    setLocating(true);
    try {
      const f = await getPosition();
      setFix(f);
      if (f.accuracy > MAX_FIX_M) {
        setGpsError(`Your phone is only sure to ±${f.accuracy} m. Step outside or wait a moment, then try again (it needs ±${MAX_FIX_M} m or better).`);
        return;
      }
      setLat(f.lat.toFixed(6));
      setLng(f.lng.toFixed(6));
    } catch (e) {
      setGpsError(errorText(e, 'Could not find where you are. Try again.'));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the office a name.');
    if (!hasPoint) return setError('Set where the office is: use where you’re standing, or type its coordinates under Advanced.');
    if (radiusM == null || radiusM < 25 || radiusM > 5000) return setError('The circle must be 25 to 5000 metres.');
    try {
      await saveOffice.mutateAsync({ id: office?.id, input: { name: name.trim(), address: address.trim(), lat: latN, lng: lngN, radius_m: radiusM } });
      toast.show(office ? 'Office saved.' : 'Office added.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async () => {
    if (!office) return;
    try {
      await removeOffice.mutateAsync(office.id);
      setConfirmRemove(false);
      toast.show('Office removed.');
      onClose();
    } catch (e) {
      setConfirmRemove(false);
      setError(errorText(e));
    }
  };

  const lastOne = !!office && others.length === 1;

  return (
    <>
      <Sheet
        visible={!confirmRemove}
        onClose={saving ? keepOpen : onClose}
        dirty={dirty && !saving && !!office}
        title={office ? 'Change office' : 'Add an office'}
        subtitle="People clock in inside this circle."
        footer={
          <>
            {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
            <ActionRow context="sheet">
              {office ? <Button title="Remove" variant="danger" icon={<Trash2 />} onPress={() => setConfirmRemove(true)} disabled={saving} /> : null}
              <Button title={office ? 'Save' : 'Add office'} onPress={() => void save()} loading={saving} disabled={!dirty} />
            </ActionRow>
          </>
        }>
        <PillField label="Name" value={name} onChangeText={setName} maxLength={80} placeholder="e.g. Jubilee Hills office" />
        <PillField label="Address (optional)" value={address} onChangeText={setAddress} maxLength={200} placeholder="Shown to people when they clock in" />

        <View style={styles.group}>
          <Text variant="labelStrong" muted>
            Where it is
          </Text>
          <Button
            title={locating ? 'Finding you…' : hasPoint ? 'Move it to where I’m standing' : 'Use where I’m standing'}
            variant="accent"
            icon={<Crosshair />}
            loading={locating}
            onPress={() => void locateMe()}
          />
          {gpsError ? <Banner tone="warning" message={gpsError} /> : null}
          {hasPoint ? (
            <Card tone="muted" style={styles.point}>
              <KeyValueList
                rows={[
                  { label: 'Centre', value: `${latN.toFixed(5)}, ${lngN.toFixed(5)}`, tabular: true, selectable: true },
                  fix ? { label: 'Your GPS', value: `±${fix.accuracy} m`, tone: fix.accuracy > MAX_FIX_M ? 'warning' : 'success' } : { label: 'Your GPS', value: null },
                  fromCentre != null ? { label: 'You are', value: `${fromCentre} m from the centre` } : { label: 'You are', value: null },
                ]}
                hideEmpty
              />
            </Card>
          ) : (
            <Text variant="caption" muted>
              Stand at the office’s main door, outside if you can, for the best fix.
            </Text>
          )}
          <Button title={advanced ? 'Hide coordinates' : 'Advanced: type the coordinates'} variant="text" size="sm" onPress={() => setAdvanced((a) => !a)} />
          {advanced ? (
            <FieldPair>
              <PillField label="Latitude" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="17.4326" />
              <PillField label="Longitude" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="78.4071" />
            </FieldPair>
          ) : null}
        </View>

        <View style={styles.group}>
          <Text variant="labelStrong" muted>
            Circle size
          </Text>
          <Segmented
            options={[...RADII.map((r) => ({ key: r, label: `${r} m` })), { key: 'custom', label: 'Other' }]}
            value={preset}
            onChange={setPreset}
          />
          {preset === 'custom' ? <NumberField label="Metres" value={custom} onChange={setCustom} unit="m" hint="25 to 5000 metres." /> : null}
        </View>
      </Sheet>

      {office ? (
        <ConfirmSheet
          visible={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          title="Remove this office?"
          subtitle={office.name}
          from={{ title: office.name, subtitle: `${office.radius_m} m circle`, icon: MapPin, module: 'attendance' }}
          to={{ title: 'Removed', subtitle: 'Can’t be brought back', icon: Trash2 }}
          detailsTitle="What happens"
          confirmLabel="Swipe to remove"
          onConfirm={() => void remove()}
          loading={removeOffice.isPending}
          note="Nobody is messaged.">
          <SummaryCard
            rows={[
              { label: 'Past clock-ins', value: 'Keep their record' },
              { label: 'From now on', value: 'Nobody can clock in here' },
              lastOne ? { label: 'Last office', value: 'Office clock-in stops for everyone', status: 'failed' } : { label: 'Undo', value: 'Not possible — add it again instead' },
            ]}
          />
        </ConfirmSheet>
      ) : null}
    </>
  );
}

// ── Company policy sheet ─────────────────────────────────────────────────────
function PolicySheet({ settings: s, onClose }: { settings: AttendanceSettings; onClose: () => void }) {
  const { savePolicy } = useAttendanceSetupActions();
  const [start, setStart] = useState(s.shiftStart);
  const [end, setEnd] = useState(s.shiftEnd);
  const [grace, setGrace] = useState(String(s.graceMinutes));
  const [half, setHalf] = useState(String(s.halfDayMinutes));
  const [full, setFull] = useState(String(s.fullDayMinutes));
  const [gps, setGps] = useState(String(s.maxAccuracyM));
  const [fixWindow, setFixWindow] = useState(String(s.regularizationWindowDays));
  const [requireGeofence, setRequireGeofence] = useState(s.requireGeofence);
  const [allowRemote, setAllowRemote] = useState(s.allowRemote);
  const [weeklyOff, setWeeklyOff] = useState<number[]>(Array.isArray(s.weeklyOff) ? s.weeklyOff : []);
  const [error, setError] = useState<string | null>(null);
  const saving = savePolicy.isPending;

  const patch: Partial<AttendanceSettings> = {
    shiftStart: start,
    shiftEnd: end,
    graceMinutes: intOf(grace) ?? NaN,
    halfDayMinutes: intOf(half) ?? NaN,
    fullDayMinutes: intOf(full) ?? NaN,
    maxAccuracyM: intOf(gps) ?? NaN,
    regularizationWindowDays: intOf(fixWindow) ?? NaN,
    requireGeofence,
    allowRemote,
    weeklyOff: [...weeklyOff].sort((a, b) => a - b),
  };
  const sameDays = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  const dirty =
    start !== s.shiftStart ||
    end !== s.shiftEnd ||
    patch.graceMinutes !== s.graceMinutes ||
    patch.halfDayMinutes !== s.halfDayMinutes ||
    patch.fullDayMinutes !== s.fullDayMinutes ||
    patch.maxAccuracyM !== s.maxAccuracyM ||
    patch.regularizationWindowDays !== s.regularizationWindowDays ||
    requireGeofence !== s.requireGeofence ||
    allowRemote !== s.allowRemote ||
    !sameDays(weeklyOff, s.weeklyOff ?? []);

  const save = async () => {
    setError(null);
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v === 'number' && !Number.isFinite(v)) return setError(`Fill in ${LABEL[k] ?? k} as a whole number.`);
    }
    if (weeklyOff.length > 6) return setError('Leave at least one working day in the week.');
    try {
      await savePolicy.mutateAsync(patch);
      toast.show('Clock-in policy saved.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const minsHint = (v: string) => (intOf(v) != null ? `= ${durationLabel(intOf(v))}` : 'In minutes');

  return (
    <Sheet
      visible
      onClose={saving ? keepOpen : onClose}
      dirty={dirty && !saving}
      title="Company clock-in policy"
      subtitle="Applies to everyone without a shift of their own."
      footer={
        <>
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
          <Text variant="caption" muted align="center">
            This changes how everyone’s day is marked from now on. Past days stay as they were.
          </Text>
          <ActionRow context="sheet">
            <Button title="Cancel" variant="accent" onPress={onClose} disabled={saving} />
            <Button title="Save policy" onPress={() => void save()} loading={saving} disabled={!dirty} />
          </ActionRow>
        </>
      }>
      <FieldPair>
        <TimeField label="Starts" value={start} onChange={setStart} />
        <TimeField label="Ends" value={end} onChange={setEnd} />
      </FieldPair>
      <NumberField label="Grace before late" value={grace} onChange={setGrace} unit="min" hint={minsHint(grace)} />
      <FieldPair>
        <NumberField label="Half day from" value={half} onChange={setHalf} unit="min" hint={minsHint(half)} />
        <NumberField label="Full day from" value={full} onChange={setFull} unit="min" hint={minsHint(full)} />
      </FieldPair>
      <WeekdayChips value={weeklyOff} onChange={setWeeklyOff} />
      <Card tone="surface" style={styles.toggles}>
        <ToggleRow
          label="Clock in inside an office"
          sub="Office clock-ins must be within an office circle."
          value={requireGeofence}
          onChange={setRequireGeofence}
        />
        <ToggleRow label="Allow remote clock-in" sub="People outside every circle can still clock in, marked remote." value={allowRemote} onChange={setAllowRemote} />
      </Card>
      <NumberField label="GPS must be within" value={gps} onChange={setGps} unit="m" hint="10 to 1000 m. Fixes less sure than this are refused." />
      <NumberField label="Fix attendance up to" value={fixWindow} onChange={setFixWindow} unit="days" hint="How many days back people may ask to fix a day." />
    </Sheet>
  );
}

const LABEL: Record<string, string> = {
  graceMinutes: 'Grace before late',
  halfDayMinutes: 'Half day from',
  fullDayMinutes: 'Full day from',
  maxAccuracyM: 'GPS must be within',
  regularizationWindowDays: 'Fix attendance up to',
};

const styles = themedStyles(() => ({
  group: { gap: space.xs },
  point: { paddingVertical: space.xs },
  toggles: { paddingVertical: space.xs, paddingHorizontal: space.xs, gap: 0 },
}));
