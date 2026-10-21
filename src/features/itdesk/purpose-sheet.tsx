// Add or edit a booking purpose (web: BookingPurposes modal, dash.html:21842–21957): name (≤ 40),
// one of nine colours, the two mandatory-field switches, a warning notice (≤ 400) and "available for
// new bookings". The server refuses a name that is taken (409) — its words are shown as they come.
// Delete is swiped; the server refuses (409) when a booking used the purpose: turn it off instead.

import { Check, Tags, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { type Purpose, type PurposeBody, usePurposeWrites } from '@/api/itdesk';
import { PURPOSE_SWATCHES } from '@/features/itdesk/format';
import { PurposeChip, ToggleRow } from '@/features/itdesk/ui';
import { themedStyles } from '@/theme/themed';
import { radius, space } from '@/theme/tokens';
import { Banner, Button, ConfirmSheet, Sheet, Text, TextField, toast } from '@/ui';

const BLANK: PurposeBody = { label: '', color: '#2563eb', bg: '#dbeafe', active: true, requiresClient: false, requiresRequirements: false, notice: '' };

/** Mount with a `key` per purpose (or 'new') so the form starts from that purpose. */
export function PurposeSheet({ visible, onClose, purpose }: { visible: boolean; onClose: () => void; purpose: Purpose | null }) {
  const w = usePurposeWrites();
  const [f, setF] = useState<PurposeBody>(() =>
    purpose
      ? { label: purpose.label, color: purpose.color || BLANK.color, bg: purpose.bg || BLANK.bg, active: purpose.active, requiresClient: purpose.requiresClient, requiresRequirements: purpose.requiresRequirements, notice: purpose.notice }
      : BLANK,
  );
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const set = <K extends keyof PurposeBody>(k: K) => (v: PurposeBody[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setError(null);
  };

  const save = () => {
    const label = f.label.trim();
    if (!label) return setError('Give the purpose a name.');
    w.save.mutate(
      { id: purpose?.id, body: { ...f, label, notice: f.notice.trim() } },
      {
        onSuccess: () => {
          toast.show(purpose ? 'Purpose updated' : 'Purpose added', 'success');
          onClose();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <>
      <Sheet
        visible={visible && !deleting}
        onClose={onClose}
        title={purpose ? 'Edit purpose' : 'Add a purpose'}
        subtitle="People choose one of these when they book a conference room."
        dirty={!!f.label.trim() && !purpose}
        footer={
          <View style={styles.buttons}>
            <Button title={purpose ? 'Save purpose' : 'Add purpose'} loading={w.save.isPending} disabled={!f.label.trim()} onPress={save} />
            {purpose ? <Button title="Delete purpose" variant="text" size="md" icon={<Trash2 />} onPress={() => setDeleting(true)} /> : null}
          </View>
        }>
        <View style={styles.body}>
          <TextField label="Name" value={f.label} onChangeText={set('label')} placeholder="e.g. Board review" maxLength={40} counter />
          <View style={styles.tight}>
            <Text variant="labelStrong" muted>
              Colour
            </Text>
            <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Colour">
              {PURPOSE_SWATCHES.map((sw) => {
                const on = f.color === sw.color;
                return (
                  <Pressable
                    key={sw.color}
                    onPress={() => setF((x) => ({ ...x, color: sw.color, bg: sw.bg }))}
                    accessibilityRole="radio"
                    accessibilityLabel={sw.name}
                    accessibilityState={{ checked: on }}
                    hitSlop={4}
                    style={[styles.swatch, { backgroundColor: sw.bg, borderColor: on ? sw.color : 'transparent' }]}>
                    {on ? <Check size={18} color={sw.color} strokeWidth={2.6} /> : <View style={[styles.dot, { backgroundColor: sw.color }]} />}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.preview}>
              <Text variant="caption" muted>
                Looks like
              </Text>
              <PurposeChip label={f.label.trim() || 'Purpose'} color={f.color} bg={f.bg} />
            </View>
          </View>
          <View>
            <ToggleRow title="Needs a client name" subtitle="The booking can’t be made without it. Super Admin and IT Admins get the details by email." value={f.requiresClient} onChange={set('requiresClient')} />
            <ToggleRow title="Needs special requirements" subtitle="Projector, whiteboard, video call set-up and so on." value={f.requiresRequirements} onChange={set('requiresRequirements')} />
            <ToggleRow title="Available for new bookings" subtitle="Off hides it from new bookings. Past bookings keep their label." value={f.active} onChange={set('active')} />
          </View>
          <TextField label="Warning notice (optional)" value={f.notice} onChangeText={set('notice')} placeholder="Shown to the person before they confirm" multiline maxLength={400} counter />
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
        </View>
      </Sheet>

      {purpose ? (
        <ConfirmSheet
          visible={visible && deleting}
          onClose={() => setDeleting(false)}
          title={`Delete ${purpose.label}?`}
          from={{ title: purpose.label, subtitle: purpose.active ? 'Shown for new bookings' : 'Hidden', icon: Tags, module: 'support' }}
          to={{ title: 'Deleted', subtitle: 'Can’t be undone', icon: Trash2, module: 'security' }}
          confirmLabel="Swipe to delete"
          loading={w.remove.isPending}
          onConfirm={() =>
            w.remove.mutate(purpose.id, {
              onSuccess: () => {
                toast.show(`${purpose.label} deleted`, 'success');
                setDeleting(false);
                onClose();
              },
              onError: (e) => {
                setDeleting(false);
                setError(e.message);
              },
            })
          }
          note="If any booking has used it, it can’t be deleted — turn it off instead. No one is notified."
        />
      ) : null}
    </>
  );
}

const styles = themedStyles(() => ({
  body: { gap: space.lg },
  tight: { gap: space.xs },
  buttons: { gap: space.xs },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  swatch: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 4 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingTop: space.xxs },
}));
