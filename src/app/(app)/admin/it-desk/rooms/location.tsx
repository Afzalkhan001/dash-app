// Add or edit a shooting location (web: AddShootingLocationPage, dash.html:21411). ?id=<location> edits.
// Required: name, city, area, full address; an approver when approval is needed (a manager or admin,
// as on the website). Availability (opening / closing, slot length, gap between bookings), booking
// rules (shortest / longest booking, approval, several at once), description, contact, internal notes,
// up to 5 photos. Editing loads the photos once (GET /locations?withImages=1, never on disk) and sends
// `images` only when they changed. "Open for booking" saves at once; Delete is swiped. No messages.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { MapPin, Save, Trash2, UserCheck } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type ItLocation, type LocationBody, useFacilityWrites, useLocationWithPhotos } from '@/api/itdesk';
import { canSeeRooms, LOCATION_APPROVER_ROLES } from '@/features/itdesk/access';
import { BUFFERS, LOCATION_CITIES, MAX_DURATIONS, MIN_DURATIONS, SLOT_LENGTHS } from '@/features/itdesk/format';
import { PhotoStrip } from '@/features/itdesk/photo-strip';
import { ToggleRow } from '@/features/itdesk/ui';
import { PersonPicker, usePickablePeople } from '@/features/shared/person-picker';
import { durationLabel } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  FieldMessage,
  FieldPair,
  LabelledSection,
  NavHeader,
  Screen,
  Segmented,
  SelectField,
  SkeletonList,
  SuccessSheet,
  TextField,
  TimeField,
  toast,
} from '@/ui';

export default function LocationScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const access = useAccess();
  const allowed = canSeeRooms(access);
  const editing = typeof id === 'string' && !!id;
  const loc = useLocationWithPhotos(editing ? id : '', allowed && editing);

  if (access.user && !allowed) return <Redirect href="/" />;
  if (!editing) return <LocationForm initial={null} />;
  if (loc.data) return <LocationForm key={loc.data.id} initial={loc.data} />;
  return (
    <Screen header={<NavHeader title="Location" />}>
      {loc.isPending ? (
        <SkeletonList rows={5} />
      ) : loc.isError ? (
        <ErrorState message={loc.error?.message ?? ''} onRetry={() => void loc.refetch()} />
      ) : (
        <EmptyState icon={<MapPin color={palette.textMuted} />} title="This location is gone" message="Someone may have deleted it." />
      )}
    </Screen>
  );
}

type Form = Omit<LocationBody, 'images' | 'status'>;
// Whole hours read "2h", not "2h 0m".
const minutesOptions = (list: number[], zero = 'None') => list.map((m) => ({ value: String(m), label: m === 0 ? zero : m % 60 === 0 ? `${m / 60}h` : durationLabel(m) }));

function LocationForm({ initial }: { initial: ItLocation | null }) {
  const router = useRouter();
  const w = useFacilityWrites();
  const people = usePickablePeople();
  const [f, setF] = useState<Form>(() => ({
    name: initial?.name ?? '',
    city: initial?.city || 'Hyderabad',
    area: initial?.area ?? '',
    address: initial?.address ?? '',
    type: initial?.type || 'indoor',
    openingTime: initial?.openingTime || '07:00',
    closingTime: initial?.closingTime || '22:00',
    slotDuration: initial?.slotDuration ?? 60,
    bufferTime: initial?.bufferTime ?? 30,
    minDuration: initial?.minDuration ?? 60,
    maxDuration: initial?.maxDuration ?? 480,
    approvalRequired: initial?.approvalRequired ?? false,
    allowMultiple: initial?.allowMultiple ?? false,
    approverName: initial?.approverName ?? '',
    approverId: initial?.approverId ?? '',
    description: initial?.description ?? '',
    contact: initial?.contact ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    internalNotes: initial?.internalNotes ?? '',
  }));
  const [photos, setPhotos] = useState<string[]>(initial?.images ?? []);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [active, setActive] = useState(initial ? initial.status === 'active' : true);
  const [picking, setPicking] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  // dash.html:21428 validate
  const errs = {
    name: !f.name.trim() ? 'Required' : null,
    area: !f.area.trim() ? 'Required' : null,
    address: !f.address.trim() ? 'Required' : null,
    approver: f.approvalRequired && !f.approverName.trim() ? 'Choose who approves' : null,
  };
  const hoursBad = f.openingTime && f.closingTime && f.closingTime <= f.openingTime ? 'Closing must be after opening' : null;
  const durBad = f.maxDuration < f.minDuration ? 'The longest booking must be at least the shortest' : null;
  // The contact is optional, but a typo here is what the crew dials or emails on the day.
  const emailBad = f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) ? 'Check the email address' : null;
  const phoneBad = f.phone.trim() && f.phone.replace(/\D/g, '').length < 10 ? 'Check the phone number' : null;
  const blocker = errs.name || errs.area || errs.address ? 'Name, area and full address are needed' : errs.approver ? 'Choose who approves bookings' : hoursBad || durBad || phoneBad || emailBad;
  const cityOptions = [...LOCATION_CITIES, ...(f.city && !LOCATION_CITIES.includes(f.city) ? [f.city] : [])].map((c) => ({ value: c, label: c }));

  const save = () => {
    setTried(true);
    setError(null);
    if (blocker) return;
    // dash.html:21447 payload; the approver is kept only when approval is needed.
    const body: LocationBody = {
      ...f,
      name: f.name.trim(),
      area: f.area.trim(),
      address: f.address.trim() || `${f.area.trim()}, ${f.city}`,
      approverName: f.approvalRequired ? f.approverName : '',
      approverId: f.approvalRequired ? f.approverId : '',
      ...(!initial || photosChanged ? { images: photos } : null),
    };
    w.saveLocation.mutate({ id: initial?.id, body }, { onSuccess: () => setDone(initial ? 'Location saved' : 'Location added'), onError: (e) => setError(e.message) });
  };

  const toggle = (next: boolean) => {
    if (!initial) return;
    setActive(next);
    w.setStatus.mutate(
      { table: 'locations', id: initial.id, status: next ? 'active' : 'inactive' },
      {
        onSuccess: () => toast.show(next ? 'Open for booking' : 'Closed for new bookings', 'success'),
        onError: (e) => {
          setActive(!next);
          toast.show(`Couldn’t change it: ${e.message}`, 'danger');
        },
      },
    );
  };

  return (
    <Screen
      header={<NavHeader title={initial ? 'Edit location' : 'Add a location'} />}
      footer={
        <ActionBar note={tried ? blocker : null}>
          <Button title={initial ? 'Save location' : 'Add location'} icon={<Save />} loading={w.saveLocation.isPending} onPress={save} />
        </ActionBar>
      }>
      {initial ? (
        <Card padded={false}>
          <ToggleRow
            title="Open for booking"
            subtitle={active ? 'People can book this location.' : 'Hidden from new bookings. Existing bookings stay.'}
            value={active}
            busy={w.setStatus.isPending}
            onChange={toggle}
            icon={MapPin}
            module="support"
          />
        </Card>
      ) : null}

      <Card style={styles.group}>
        <TextField label="Name" value={f.name} onChangeText={set('name')} placeholder="e.g. Banjara Hills Rooftop" error={tried ? errs.name : null} maxLength={100} />
        <SelectField label="City" value={f.city} options={cityOptions} onChange={set('city')} />
        <TextField label="Area" value={f.area} onChangeText={set('area')} placeholder="e.g. Banjara Hills" error={tried ? errs.area : null} />
        <TextField label="Full address" value={f.address} onChangeText={set('address')} placeholder="Street, landmark, PIN" multiline maxLength={300} error={tried ? errs.address : null} />
        <Segmented
          options={[
            { key: 'indoor', label: 'Indoor' },
            { key: 'outdoor', label: 'Outdoor' },
          ]}
          value={f.type === 'outdoor' ? 'outdoor' : 'indoor'}
          onChange={(v) => set('type')(v)}
        />
      </Card>

      <LabelledSection title="Photos">
        <Card style={styles.group}>
          <PhotoStrip
          photos={photos}
          onChange={(next) => {
            setPhotos(next);
              setPhotosChanged(true);
            }}
          />
        </Card>
      </LabelledSection>

      <LabelledSection title="When it can be booked">
        <Card style={styles.group}>
          <FieldPair>
            <TimeField label="Opens" value={f.openingTime} onChange={set('openingTime')} />
            <TimeField label="Closes" value={f.closingTime} onChange={set('closingTime')} />
          </FieldPair>
          {tried && hoursBad ? <FieldMessage error={hoursBad} /> : null}
          <SelectField label="Time slots" value={String(f.slotDuration)} options={minutesOptions(SLOT_LENGTHS)} onChange={(v) => set('slotDuration')(+v)} />
          <SelectField label="Gap between bookings" value={String(f.bufferTime)} options={minutesOptions(BUFFERS)} onChange={(v) => set('bufferTime')(+v)} />
        </Card>
      </LabelledSection>

      <LabelledSection title="Booking rules">
        <Card style={styles.group}>
          <SelectField label="Shortest booking" value={String(f.minDuration)} options={minutesOptions(MIN_DURATIONS)} onChange={(v) => set('minDuration')(+v)} />
          <SelectField label="Longest booking" value={String(f.maxDuration)} options={minutesOptions(MAX_DURATIONS)} onChange={(v) => set('maxDuration')(+v)} error={tried ? durBad : null} />
          <ToggleRow bleed title="Several bookings at once" subtitle="More than one team can book the same time." value={!!f.allowMultiple} onChange={set('allowMultiple')} />
          <ToggleRow bleed title="Needs approval" subtitle="Someone approves each booking before it is confirmed." value={!!f.approvalRequired} onChange={set('approvalRequired')} />
          {f.approvalRequired ? (
            <View style={styles.tight}>
              <AccountRow
                icon={UserCheck}
                title={f.approverName || 'Choose who approves'}
                sub={f.approverName ? 'Approves bookings' : 'A manager or admin'}
                actionLabel={f.approverName ? 'Change' : 'Choose'}
                onChange={() => setPicking(true)}
                onPress={() => setPicking(true)}
              />
              {tried && errs.approver ? <FieldMessage error={errs.approver} /> : null}
            </View>
          ) : null}
        </Card>
      </LabelledSection>

      <LabelledSection title="Contact at the location">
        <Card style={styles.group}>
          <TextField label="Contact person (optional)" value={f.contact} onChangeText={set('contact')} placeholder="Name" />
          <TextField label="Phone (optional)" value={f.phone} onChangeText={set('phone')} placeholder="+91 …" keyboardType="phone-pad" error={tried ? phoneBad : null} />
          <TextField label="Email (optional)" value={f.email} onChangeText={set('email')} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={tried ? emailBad : null} />
        </Card>
      </LabelledSection>

      <Card style={styles.group}>
        <TextField label="Description (optional)" value={f.description} onChangeText={set('description')} placeholder="What the place is like, what to bring" multiline maxLength={600} counter />
        <TextField label="Internal notes (optional)" value={f.internalNotes} onChangeText={set('internalNotes')} placeholder="Only IT Admin sees these" multiline maxLength={500} counter />
      </Card>

      {error ? <Banner tone="danger" title="Couldn’t save the location" message={error} /> : null}

      {initial ? (
        <View style={styles.danger}>
          <Button variant="danger" title="Delete location" icon={<Trash2 />} onPress={() => setDeleting(true)} />
        </View>
      ) : null}

      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Who approves bookings?"
        people={people.data}
        loading={people.isPending}
        filter={(p) => LOCATION_APPROVER_ROLES.includes(String(p.role))}
        selectedId={f.approverId || null}
        allowOnLeave
        recentKey="itdesk.approver"
        onPick={(p) => setF((x) => ({ ...x, approverName: p.name, approverId: p.id }))}
      />

      {initial ? (
        <ConfirmSheet
          visible={deleting}
          onClose={() => setDeleting(false)}
          title={`Delete ${initial.name || 'this location'}?`}
          from={{ title: initial.name || 'Location', subtitle: [initial.area, initial.city].filter(Boolean).join(', ') || undefined, icon: MapPin, module: 'support' }}
          to={{ title: 'Deleted', subtitle: 'Gone from booking', icon: Trash2, module: 'security' }}
          confirmLabel="Swipe to delete"
          loading={w.remove.isPending}
          onConfirm={() =>
            w.remove.mutate(
              { table: 'locations', id: initial.id },
              {
                onSuccess: () => {
                  setDeleting(false);
                  setDone('Location deleted');
                },
                onError: (e) => {
                  setDeleting(false);
                  toast.show(`Couldn’t delete it: ${e.message}`, 'danger');
                },
              },
            )
          }
          note="This can’t be undone. Past bookings keep the location’s name. No one is notified. To stop new bookings only, close it instead."
        />
      ) : null}

      <SuccessSheet
        visible={!!done}
        onClose={() => router.back()}
        onPrimary={() => router.back()}
        title={done ?? ''}
        subtitle={done === 'Location deleted' ? 'It no longer shows when people book a location.' : done === 'Location added' ? `${f.name.trim()} is open for booking.` : 'Your changes are saved.'}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.md },
  tight: { gap: space.xs },
  danger: { paddingTop: space.xs },
}));
