// Office map (Super Admin, HR with attendance) — the website's office editor map (AttendanceSetup →
// Office locations → OsmMap, dash.html:3634): every office's clock-in circle on an OpenStreetMap map;
// pick an office (or "New office"), tap the map to place its centre, set the circle's size, save.
//
//   GET /hr/locations · PUT /hr/locations/:id · POST /hr/locations {name, address, lat, lng, radius_m}
//   (hr.js ~L624–660, the hrtime domain's hooks). The circle is 25–5000 m, as the offices screen allows.
//
// Moving an office changes where everyone's clock-in is accepted, so the save shows old → new and a
// swipe. Nobody is messaged. The list version (with "Use where I'm standing" and remove) stays at
// HR setup › Offices.

import { useRouter } from 'expo-router';
import { Building2, Crosshair, MapPin, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { OfficeLocation } from '@/api/attendance';
import { useAttendanceSetupActions, useOffices } from '@/api/hrtime';
import { canUseOfficeMap } from '@/features/adminadvanced/access';
import { MapFrame } from '@/features/adminadvanced/map-frame';
import { GateFallback, useGate } from '@/features/adminadvanced/ui';
import { haversineM } from '@/features/attendance/format';
import { getPosition } from '@/features/attendance/use-clock';
import { palette } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  ErrorState,
  KeyValueList,
  NavHeader,
  Screen,
  Skeleton,
  SummaryCard,
  Text,
  TextField,
  toast,
  useLayout,
} from '@/ui';

const SIZES = [50, 100, 150, 200, 300, 500];
const NEW = '__new';
type Draft = { lat: number | null; lng: number | null; radius: string; name: string; address: string };
const fmt = (n: number | null) => (n == null ? '—' : n.toFixed(5));
const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export default function OfficeMapScreen() {
  const router = useRouter();
  const { width, gap } = useLayout();
  const { access, pending } = useGate();
  const allowed = canUseOfficeMap(access.hr, access.user);
  const q = useOffices(allowed);
  const { saveOffice } = useAttendanceSetupActions();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const header = <NavHeader title="Office map" />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const offices: OfficeLocation[] = q.data ?? [];
  const office = selected && selected !== NEW ? (offices.find((o) => o.id === selected) ?? null) : null;
  const isNew = selected === NEW;
  const radiusM = Number(draft?.radius);
  const radiusOk = Number.isInteger(radiusM) && radiusM >= 25 && radiusM <= 5000;
  const pin = draft && draft.lat != null && draft.lng != null ? { lat: draft.lat, lng: draft.lng, radius_m: radiusOk ? radiusM : 100 } : null;
  const moved = office && pin ? haversineM(office.lat, office.lng, pin.lat, pin.lng) : 0;
  const changed =
    !!draft &&
    (isNew
      ? pin != null
      : !!office && (Math.abs(moved) > 0.5 || radiusM !== office.radius_m || draft.name.trim() !== office.name || draft.address.trim() !== (office.address ?? '')));

  const choose = (id: string | null) => {
    setError(null);
    setSelected(id);
    const o = id && id !== NEW ? offices.find((x) => x.id === id) : null;
    setDraft(
      id == null ? null : o ? { lat: o.lat, lng: o.lng, radius: String(o.radius_m), name: o.name, address: o.address ?? '' } : { lat: null, lng: null, radius: '150', name: '', address: '' },
    );
  };
  const onPick = (lat: number, lng: number) => {
    if (!draft) return toast.show('Pick an office first, or New office', 'info');
    setError(null);
    setDraft({ ...draft, lat, lng });
  };
  const here = async () => {
    setLocating(true);
    setError(null);
    try {
      const f = await getPosition();
      setMe(f);
      if (draft && f.accuracy <= 50) setDraft({ ...draft, lat: f.lat, lng: f.lng });
      else if (draft) setError(`Your location is only accurate to ±${f.accuracy} m. Tap the map to place the office instead.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t get your location.');
    } finally {
      setLocating(false);
    }
  };
  const review = () => {
    if (!draft || !pin) return setError('Tap the map to place the office.');
    if (!draft.name.trim()) return setError('Give the office a name.');
    if (!radiusOk) return setError('The circle must be 25 to 5000 metres.');
    setError(null);
    saveOffice.reset();
    setConfirming(true);
  };
  const save = () => {
    if (!draft || !pin) return;
    saveOffice.mutate(
      { id: office?.id, input: { name: draft.name.trim(), address: draft.address.trim(), lat: pin.lat, lng: pin.lng, radius_m: radiusM } },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.show(isNew ? 'Office added' : 'Office saved', 'success');
          choose(null);
        },
      },
    );
  };

  const mapHeight = Math.round(Math.min(420, Math.max(260, width * 0.95)));
  const fences = offices.map((o) => ({ id: o.id, name: o.name, lat: o.lat, lng: o.lng, radius_m: o.radius_m, selected: o.id === selected }));

  return (
    <Screen
      header={header}
      onRefresh={() => q.refetch()}
      footer={
        draft ? (
          <ActionBar>
            <ActionRow context="bar">
              <Button title="Cancel" variant="accent" onPress={() => choose(null)} />
              <Button title={isNew ? 'Add office' : 'Save'} icon={<MapPin />} disabled={!changed} onPress={review} />
            </ActionRow>
          </ActionBar>
        ) : undefined
      }>
      {q.isError && !q.data ? (
        <ErrorState message={q.error?.message ?? 'The offices could not be loaded.'} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton height={mapHeight} radius={20} />
      ) : (
        // A View, not a fragment: Screen spaces its direct children only.
        <View style={{ gap }}>
          <ChipRow>
            {offices.map((o) => (
              <Chip key={o.id} label={o.name} selected={selected === o.id} icon={<Building2 size={14} color={palette.textMuted} />} onPress={() => choose(selected === o.id ? null : o.id)} />
            ))}
            <Chip label="New office" selected={isNew} icon={<Plus size={14} color={palette.textMuted} />} onPress={() => choose(isNew ? null : NEW)} />
          </ChipRow>
          <MapFrame
            height={mapHeight}
            fitKey={`${selected ?? 'all'}:${offices.length}`}
            state={{
              fences: isNew || !office ? fences : fences.map((f) => (f.id === office.id ? { ...f, selected: true } : f)),
              pin,
              me,
              colors: { fence: palette.primary, pin: palette.dangerInk, me: palette.info, ink: palette.ink, surface: palette.surface },
            }}
            onPick={onPick}
            onError={setMapError}
          />
          {mapError ? <Banner tone="warning" message={`${mapError} You can still place an office from HR setup › Offices.`} /> : null}
          <Text variant="caption" muted>
            {draft ? (pin ? 'Tap the map again to move the centre.' : 'Tap the map where the office is.') : 'Pick an office above to move it, or New office.'}
          </Text>
        </View>
      )}

      {draft ? (
        <Card padded style={{ gap: 12 }}>
          <Text variant="heading">{isNew ? 'New office' : office?.name}</Text>
          <TextField label="Name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} maxLength={80} placeholder="Tamada Media HQ" />
          <TextField label="Address (optional)" value={draft.address} onChangeText={(v) => setDraft({ ...draft, address: v })} multiline />
          <Text variant="label" muted>
            Circle size
          </Text>
          <ChipRow bleed="card">
            {SIZES.map((m) => (
              <Chip key={m} label={`${m} m`} selected={draft.radius === String(m)} onPress={() => setDraft({ ...draft, radius: String(m) })} />
            ))}
          </ChipRow>
          <TextField
            label="Or type the size (metres)"
            value={draft.radius}
            onChangeText={(v) => setDraft({ ...draft, radius: v.replace(/\D/g, '').slice(0, 4) })}
            keyboardType="number-pad"
            error={draft.radius && !radiusOk ? '25 to 5000 metres' : null}
          />
          <KeyValueList
            rows={[
              { key: 'lat', label: 'Latitude', value: fmt(draft.lat), tabular: true },
              { key: 'lng', label: 'Longitude', value: fmt(draft.lng), tabular: true },
            ]}
          />
          <Button title="Use where I’m standing" variant="accent" icon={<Crosshair />} loading={locating} onPress={() => void here()} />
          {error ? <Banner tone="danger" message={error} /> : null}
        </Card>
      ) : (
        <Button title="Offices as a list" variant="accent" onPress={() => router.push('/admin/hr-time/offices')} />
      )}

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={isNew ? 'Add this office?' : 'Save this office?'}
        from={
          isNew || !office
            ? { title: 'New office', subtitle: 'Not on the map yet', icon: Plus, module: 'attendance' }
            : { title: office.name, subtitle: `${office.radius_m} m circle`, icon: Building2, module: 'attendance' }
        }
        to={{ title: draft?.name.trim() || 'Office', subtitle: radiusOk ? `${radiusM} m circle` : '', icon: MapPin, module: 'attendance' }}
        confirmLabel={isNew ? 'Swipe to add' : 'Swipe to save'}
        onConfirm={save}
        loading={saveOffice.isPending}
        note="Nobody is messaged. Clock-ins are checked against this circle from now on.">
        <SummaryCard
          rows={[
            { key: 'where', label: 'Centre', value: pin ? `${fmt(pin.lat)}, ${fmt(pin.lng)}` : '—' },
            ...(office ? [{ key: 'moved', label: 'Moved by', value: metres(moved) }] : []),
            { key: 'size', label: 'Circle', value: radiusOk ? `${radiusM} m` : '—' },
          ]}
        />
        {saveOffice.error ? <Banner tone="danger" title="Couldn’t save" message={saveOffice.error.message} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}
