// Edit my profile — one sheet with the same fields, in the same shape, as the web's My Profile →
// Edit Profile (dash.html ProfileView saveProfile ~L29043): phone (written to both phone and mobile),
// bank account number (digits only), IFSC (upper-case, 11 characters), bio and up to three work
// links. Name and job role are managed by HR and are not editable here, as on the web; the server
// would drop role / employee no. / department / email from a self-edit anyway (lib/authz.js
// filterUserWrite).
//
// One column of Payno pill fields (PillField, each with a thin leading icon; the bio stays a multi-line
// field), in the order the profile shows them (contact, bank, about). Cancel + Save pinned at
// the bottom; Save wakes up once something has changed. The phone error sits under its field, a
// failed save is one danger Banner right above Save, a saved one closes the sheet with a "Profile
// saved." toast, and closing with edits asks "Discard changes?". (useSaveMyProfile gives the
// save success / error haptic itself, so the sheet does not add a second one.)
// While a save is running the sheet can't be closed, so a failure is never lost. Only the work links
// already filled in are shown (at least one); "Add another link" reveals the next, up to three. The
// form still holds all three, and empty ones are dropped on save, exactly as before.

import { Hash, Landmark, Link2, Phone, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type ProfileRecord, useSaveMyProfile } from '@/api/people';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { FIELD_LABEL_INSET, ActionRow, Banner, Button, haptic, PillField, Sheet, Text, TextField, toast } from '@/ui';
type Form = { phone: string; bio: string; links: string[]; bank: string; ifsc: string };

const MAX_LINKS = 3;

function initialForm(p: ProfileRecord | null | undefined): Form {
  const raw: unknown = p?.workLinks;
  const links = Array.isArray(raw) ? raw.map((l) => String(l || '')) : [];
  return {
    phone: String(p?.phone || p?.mobile || ''),
    bio: String(p?.bio || ''),
    links: [...links, '', '', ''].slice(0, MAX_LINKS),
    bank: String(p?.bankAccountNumber || ''),
    ifsc: String(p?.bankIfscCode || ''),
  };
}

/** How many link fields to show at first: up to the last one that has something in it, at least one. */
const filledLinkSlots = (links: string[]) => Math.max(1, links.reduce((n, l, i) => (l.trim() ? i + 1 : n), 0));

const sameForm = (a: Form, b: Form) =>
  a.phone === b.phone && a.bio === b.bio && a.bank === b.bank && a.ifsc === b.ifsc && a.links.every((l, i) => l === b.links[i]);

// While a save is in flight the backdrop, handle and Android back do nothing.
const keepOpen = () => {};

// Mount with a fresh `key` each time it opens, so the form starts from the saved values.
export function ProfileEditSheet({ visible, onClose, profile }: { visible: boolean; onClose: () => void; profile: ProfileRecord | null | undefined }) {
  const save = useSaveMyProfile();
  const [initial] = useState<Form>(() => initialForm(profile));
  const [form, setForm] = useState<Form>(initial);
  const [linkSlots, setLinkSlots] = useState(() => filledLinkSlots(initial.links));
  const [linkAdded, setLinkAdded] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedPhone = initial.phone.trim();
  const dirty = !sameForm(form, initial);
  const set = (patch: Partial<Form>) => {
    setSaveError(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  const submit = async () => {
    if (save.isPending || !dirty) return;
    const phone = form.phone.trim();
    // Sign-in by WhatsApp uses this number, so a half-typed new one is caught before it is saved.
    const digits = phone.replace(/\D/g, '');
    if (phone && phone !== savedPhone && (digits.length < 10 || digits.length > 15)) {
      haptic.warning();
      setPhoneError('Enter a full mobile number (10 digits).');
      return;
    }
    setPhoneError(null);
    setSaveError(null);
    try {
      await save.mutateAsync({
        phone,
        mobile: phone,
        bio: form.bio,
        workLinks: form.links.map((l) => l.trim()).filter(Boolean),
        bankAccountNumber: form.bank.trim(),
        bankIfscCode: form.ifsc.trim().toUpperCase(),
      });
      onClose();
      toast.show('Profile saved.');
    } catch (e) {
      setSaveError(e instanceof Error && e.message ? e.message : 'Try again.');
    }
  };

  const saving = save.isPending;

  return (
    <Sheet
      visible={visible}
      onClose={saving ? keepOpen : onClose}
      dirty={dirty && !saving}
      title="Edit profile"
      subtitle="Name and job role are set by HR."
      footer={
        <>
          {saveError ? <Banner tone="danger" title="Couldn’t save your profile" message={saveError} /> : null}
          <ActionRow context="sheet">
            <Button title="Cancel" variant="accent" onPress={onClose} />
            <Button title="Save" variant="primary" onPress={() => void submit()} loading={saving} disabled={!dirty} />
          </ActionRow>
        </>
      }>
      <PillField
        icon={Phone}
        label="Phone"
        value={form.phone}
        onChangeText={(v) => {
          setPhoneError(null);
          set({ phone: v });
        }}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder="e.g. 9876543210"
        error={phoneError}
        hint="Also used to sign in with WhatsApp."
      />
      <PillField
        icon={Landmark}
        label="Bank account number"
        value={form.bank}
        onChangeText={(v) => set({ bank: v.replace(/\D/g, '') })}
        keyboardType="number-pad"
        placeholder="e.g. 123456789012"
      />
      <PillField
        icon={Hash}
        label="IFSC code"
        value={form.ifsc}
        onChangeText={(v) => set({ ifsc: v.toUpperCase() })}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={11}
        placeholder="e.g. HDFC0001234"
        hint="11 characters, as on your cheque book."
      />
      <TextField label="Bio" value={form.bio} onChangeText={(v) => set({ bio: v })} placeholder="A line or two about you" multiline />

      <View style={styles.group}>
        <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
          Work links (up to {MAX_LINKS})
        </Text>
        {form.links.slice(0, linkSlots).map((l, i) => (
          <PillField
            key={i}
            icon={Link2}
            value={l}
            onChangeText={(v) => set({ links: form.links.map((x, j) => (j === i ? v : x)) })}
            placeholder={`Link ${i + 1} — e.g. https://…`}
            accessibilityLabel={`Work link ${i + 1}`}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={linkAdded && i === linkSlots - 1}
          />
        ))}
        {linkSlots < MAX_LINKS ? (
          <Button
            title="Add another link"
            variant="text"
            size="sm"
            icon={<Plus />}
            disabled={saving}
            onPress={() => {
              setLinkAdded(true);
              setLinkSlots((n) => Math.min(MAX_LINKS, n + 1));
            }}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.xs },
}));
