// Add or edit a conference room (web: AddConferenceRoomPage, dash.html:21669). ?id=<room> edits.
// Name, capacity and floor are required; up to 5 photos (900 px JPEG); amenities; internal notes.
// Editing loads the photos once (GET /rooms?withImages=1, never on disk) and sends `images` only when
// they changed — the PUT merges, so leaving them out keeps the stored ones. "Open for booking" saves at
// once (PUT {status}); Delete is swiped. No one is messaged by any of it.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { DoorOpen, Save, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type ItRoom, useFacilityWrites, useRoomWithPhotos } from '@/api/itdesk';
import { canSeeRooms } from '@/features/itdesk/access';
import { ROOM_AMENITIES } from '@/features/itdesk/format';
import { PhotoStrip } from '@/features/itdesk/photo-strip';
import { ToggleRow } from '@/features/itdesk/ui';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  ActionBar,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  SkeletonList,
  SuccessSheet,
  Text,
  TextField,
  toast,
} from '@/ui';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const access = useAccess();
  const allowed = canSeeRooms(access);
  const editing = typeof id === 'string' && !!id;
  const room = useRoomWithPhotos(editing ? id : '', allowed && editing);

  if (access.user && !allowed) return <Redirect href="/" />;
  if (!editing) return <RoomForm initial={null} />;
  if (room.data) return <RoomForm key={room.data.id} initial={room.data} />;
  return (
    <Screen header={<NavHeader title="Room" />}>
      {room.isPending ? (
        <SkeletonList rows={5} />
      ) : room.isError ? (
        <ErrorState message={room.error?.message ?? ''} onRetry={() => void room.refetch()} />
      ) : (
        <EmptyState icon={<DoorOpen color={palette.textMuted} />} title="This room is gone" message="Someone may have deleted it." />
      )}
    </Screen>
  );
}

function RoomForm({ initial }: { initial: ItRoom | null }) {
  const router = useRouter();
  const w = useFacilityWrites();
  const [name, setName] = useState(initial?.name ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : '');
  const [floor, setFloor] = useState(initial?.floor ?? '');
  const [amenities, setAmenities] = useState<string[]>(initial?.amenities ?? []);
  const [photos, setPhotos] = useState<string[]>(initial?.images ?? []);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [notes, setNotes] = useState(initial?.internalNotes ?? '');
  const [active, setActive] = useState(initial ? initial.status === 'active' : true);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const errs = {
    name: !name.trim() ? 'Required' : null,
    capacity: !capacity.trim() ? 'Required' : !(Number(capacity) > 0) ? 'Enter a number of people' : null,
    floor: !floor.trim() ? 'Required' : null,
  };
  const blocker = errs.name || errs.capacity || errs.floor ? 'Name, capacity and floor are needed' : null;
  const extras = amenities.filter((x) => !ROOM_AMENITIES.includes(x));

  const save = () => {
    setTried(true);
    setError(null);
    if (blocker) return;
    const body = {
      name: name.trim(),
      capacity: +capacity,
      floor: floor.trim(),
      amenities,
      internalNotes: notes,
      ...(!initial || photosChanged ? { images: photos } : null),
    };
    w.saveRoom.mutate(
      { id: initial?.id, body },
      { onSuccess: () => setDone(initial ? 'Room saved' : 'Room added'), onError: (e) => setError(e.message) },
    );
  };

  const toggle = (next: boolean) => {
    if (!initial) return;
    setActive(next);
    w.setStatus.mutate(
      { table: 'rooms', id: initial.id, status: next ? 'active' : 'inactive' },
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
      header={<NavHeader title={initial ? 'Edit room' : 'Add a room'} />}
      footer={
        <ActionBar note={tried ? blocker : null}>
          <Button title={initial ? 'Save room' : 'Add room'} icon={<Save />} loading={w.saveRoom.isPending} onPress={save} />
        </ActionBar>
      }>
      {initial ? (
        <Card padded={false}>
          <ToggleRow
            title="Open for booking"
            subtitle={active ? 'People can book this room.' : 'Hidden from new bookings. Existing bookings stay.'}
            value={active}
            busy={w.setStatus.isPending}
            onChange={toggle}
            icon={DoorOpen}
            module="support"
          />
        </Card>
      ) : null}

      <Card style={styles.group}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Board Room" error={tried ? errs.name : null} maxLength={80} />
        <TextField
          label="Capacity"
          value={capacity}
          onChangeText={(v) => setCapacity(v.replace(/\D/g, ''))}
          placeholder="People it seats"
          keyboardType="number-pad"
          error={tried ? errs.capacity : null}
        />
        <TextField label="Floor" value={floor} onChangeText={setFloor} placeholder="e.g. 3rd floor" error={tried ? errs.floor : null} />
      </Card>

      <Card style={styles.group}>
        <Text variant="labelStrong" muted>
          Photos
        </Text>
        <PhotoStrip
          photos={photos}
          onChange={(next) => {
            setPhotos(next);
            setPhotosChanged(true);
          }}
        />
      </Card>

      <Card style={styles.group}>
        <Text variant="labelStrong" muted>
          What it has
        </Text>
        <ChipRow wrap bleed="none">
          {[...ROOM_AMENITIES, ...extras].map((x) => {
            const on = amenities.includes(x);
            return <Chip key={x} label={x} selected={on} onPress={() => setAmenities(on ? amenities.filter((y) => y !== x) : [...amenities, x])} />;
          })}
        </ChipRow>
      </Card>

      <Card style={styles.group}>
        <TextField label="Internal notes (optional)" value={notes} onChangeText={setNotes} placeholder="Only IT Admin sees these" multiline maxLength={500} counter />
      </Card>

      {error ? <Banner tone="danger" title="Couldn’t save the room" message={error} /> : null}

      {initial ? (
        <View style={styles.danger}>
          <Button variant="danger" title="Delete room" icon={<Trash2 />} onPress={() => setDeleting(true)} />
        </View>
      ) : null}

      {initial ? (
        <ConfirmSheet
          visible={deleting}
          onClose={() => setDeleting(false)}
          title={`Delete ${initial.name || 'this room'}?`}
          from={{ title: initial.name || 'Room', subtitle: [initial.floor, initial.capacity ? `${initial.capacity} people` : ''].filter(Boolean).join(' · ') || undefined, icon: DoorOpen, module: 'support' }}
          to={{ title: 'Deleted', subtitle: 'Gone from booking', icon: Trash2, module: 'security' }}
          confirmLabel="Swipe to delete"
          loading={w.remove.isPending}
          onConfirm={() =>
            w.remove.mutate(
              { table: 'rooms', id: initial.id },
              {
                onSuccess: () => {
                  setDeleting(false);
                  setDone('Room deleted');
                },
                onError: (e) => {
                  setDeleting(false);
                  toast.show(`Couldn’t delete it: ${e.message}`, 'danger');
                },
              },
            )
          }
          note="This can’t be undone. Past bookings keep the room’s name. No one is notified. To stop new bookings only, close it instead."
        />
      ) : null}

      <SuccessSheet visible={!!done} onClose={() => router.back()} onPrimary={() => router.back()} title={done ?? ''} subtitle={done === 'Room deleted' ? 'It no longer shows when people book a room.' : done === 'Room added' ? `${name.trim()} is open for booking.` : 'Your changes are saved.'} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.md },
  danger: { paddingTop: space.xs },
}));
