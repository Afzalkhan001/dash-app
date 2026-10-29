// Profile pieces from the website's VendorDashboard "My Profile" tab (dash.html ~32236): set/change
// password (SetVendorPasswordModal), "Request a change" for verified fields (POST /vendor/change-requests
// — one sheet; when a group has several changeable fields the vendor picks one with chips inside it, so
// there is never a menu sheet before the form), the change-request history and the documents list.

import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, EyeOff, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, type TextInputProps, View } from 'react-native';

import { isApiError } from '@/api/client';
import { type ChangeRequest, requestVendorChange, type Vendor, VENDOR_ME_KEY, type VendorDocument, vendorSetPassword } from '@/api/vendor';
import { changeFieldLabel, docLabel, docStatus } from '@/features/vendor/constants';
import { dateIN } from '@/features/vendor/format';
import { Field, useLastValue, useOpenCount } from '@/features/vendor/ui';
import { font, palette, radius, space } from '@/theme/tokens';
import { FIELD_LABEL_INSET, ActionRow, Banner, Button, Chip, ChipRow, haptic, ModuleBadge, Sheet, StatusPill, Text, TextField } from '@/ui';

import { themedStyles } from '@/theme/themed';
// ── Password ───────────────────────────────────────────────────────────────────
// Each opening gets a fresh form (keyed by the open count). The Sheet lives inside the form so Cancel /
// Save sit in its pinned footer and a backdrop or handle tap asks before discarding typed passwords.
export function PasswordSheet({ visible, hasPassword, onClose, onDone }: { visible: boolean; hasPassword: boolean; onClose: () => void; onDone: () => void }) {
  const session = useOpenCount(visible);
  return <PasswordForm key={session} visible={visible} hasPassword={hasPassword} onClose={onClose} onDone={onDone} />;
}

function PasswordForm({ visible, hasPassword, onClose, onDone }: { visible: boolean; hasPassword: boolean; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw1Err, setPw1Err] = useState<string | null>(null);
  const [pw2Err, setPw2Err] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setPw1Err(null);
    setPw2Err(null);
    if (pw1.length < 6) {
      haptic.warning();
      return setPw1Err('Password must be at least 6 characters.');
    }
    if (pw1 !== pw2) {
      haptic.warning();
      return setPw2Err('Passwords do not match.');
    }
    setBusy(true);
    const r = await vendorSetPassword(pw1);
    setBusy(false);
    if (isApiError(r)) {
      haptic.error();
      return setError(r.error);
    }
    haptic.success();
    await qc.invalidateQueries({ queryKey: VENDOR_ME_KEY });
    onDone();
  }

  const eye = (
    <Pressable
      hitSlop={14}
      onPress={() => setShow((s) => !s)}
      accessibilityRole="button"
      accessibilityLabel={show ? 'Hide password' : 'Show password'}
      style={{ flexShrink: 0 }}>
      {show ? <EyeOff size={20} color={palette.textMuted} /> : <Eye size={20} color={palette.textMuted} />}
    </Pressable>
  );
  const common: TextInputProps = {
    secureTextEntry: !show,
    textContentType: 'newPassword',
    autoComplete: 'new-password',
    autoCapitalize: 'none',
    autoCorrect: false,
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={hasPassword ? 'Change password' : 'Set a password'}
      subtitle="Sign in with your number and a password."
      dirty={!!pw1 || !!pw2}
      footer={
        <ActionRow context="sheet">
          <Button title="Cancel" variant="accent" onPress={onClose} disabled={busy} />
          <Button title="Save" onPress={save} loading={busy} disabled={!pw1 || !pw2} />
        </ActionRow>
      }>
      <TextField
        label="New password"
        value={pw1}
        onChangeText={(t) => {
          setPw1(t);
          setPw1Err(null);
        }}
        placeholder="At least 6 characters"
        right={eye}
        error={pw1Err}
        {...common}
      />
      <TextField
        label="Confirm password"
        value={pw2}
        onChangeText={(t) => {
          setPw2(t);
          setPw2Err(null);
        }}
        placeholder="Re-enter password"
        right={eye}
        error={pw2Err}
        {...common}
      />
      {error ? <Banner tone="danger" title="Couldn’t save your password" message={error} /> : null}
    </Sheet>
  );
}

// ── Request a change ───────────────────────────────────────────────────────────
const FIELD_INPUT: Record<string, TextInputProps> = {
  pan: { autoCapitalize: 'characters', autoCorrect: false, placeholder: 'ABCDE1234F' },
  gstin: { autoCapitalize: 'characters', autoCorrect: false, placeholder: '29ABCDE1234F1Z5' },
  ifsc: { autoCapitalize: 'characters', autoCorrect: false, placeholder: 'HDFC0001234' },
  accountNumber: { keyboardType: 'number-pad', autoCorrect: false },
};

// Same shape as the password sheet: a fresh form per opening (and per set of fields), with the Sheet
// inside it so Cancel / Send request are pinned in the footer and typed text is not dropped by a stray
// tap. `fields` is the changeable fields of one group (e.g. the four bank fields); null = closed.
export function ChangeRequestSheet({ fields, onClose, onDone }: { fields: string[] | null; onClose: () => void; onDone: (message: string) => void }) {
  const shown = useLastValue(fields);
  const session = useOpenCount(!!fields);
  return <ChangeForm key={`${session}:${(shown ?? []).join(',')}`} visible={!!fields} fields={shown ?? []} onClose={onClose} onDone={onDone} />;
}

function ChangeForm({
  visible,
  fields,
  onClose,
  onDone,
}: {
  visible: boolean;
  fields: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const qc = useQueryClient();
  const choices = (Array.isArray(fields) ? fields : []).filter((x): x is string => typeof x === 'string' && !!x);
  const [field, setField] = useState(choices.length === 1 ? choices[0]! : '');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!field || !value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await requestVendorChange({ field, newValue: value, reason });
    setBusy(false);
    if (isApiError(r)) {
      haptic.error();
      return setError(r.error);
    }
    haptic.success();
    await qc.invalidateQueries({ queryKey: ['vendor', 'change-requests'] });
    onDone(r.message || 'Sent. Our Accounts team will check it.');
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Request a change"
      subtitle="Our Accounts team checks it before it changes."
      dirty={!!value.trim() || !!reason.trim()}
      footer={
        choices.length ? (
          <ActionRow context="sheet">
            <Button title="Cancel" variant="accent" onPress={onClose} disabled={busy} />
            <Button title="Send request" onPress={send} loading={busy} disabled={!field || !value.trim()} />
          </ActionRow>
        ) : undefined
      }>
      {choices.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            What do you want to change?
          </Text>
          <ChipRow wrap>
            {choices.map((c) => (
              <Chip
                key={c}
                label={changeFieldLabel(c)}
                selected={field === c}
                onPress={() => {
                  if (c !== field) setValue('');
                  setField(c);
                  setError(null);
                }}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}
      {field ? (
        <>
          <Field
            label={choices.length > 1 ? 'New value' : `New ${changeFieldLabel(field)}`}
            required
            value={value}
            onChangeText={setValue}
            {...FIELD_INPUT[field]}
          />
          <Field label="Reason (optional)" value={reason} onChangeText={setReason} multiline placeholder="Why is this changing?" />
          {error ? <Banner tone="danger" title="Couldn’t send" message={error} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ── Change request history ────────────────────────────────────────────────────────
export function ChangeRequestItem({ r }: { r: ChangeRequest }) {
  const tone = r.status === 'approved' ? 'done' : r.status === 'rejected' ? 'failed' : 'pending';
  const label =
    r.status === 'pending'
      ? 'Waiting'
      : r.status === 'approved'
        ? 'Approved'
        : r.status === 'rejected'
          ? 'Rejected'
          : String(r.status ?? '');
  return (
    <View style={styles.item}>
      <View style={styles.itemHead}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          {changeFieldLabel(r.field)}
        </Text>
        <Text variant="caption" muted tabular numberOfLines={1} style={{ flexShrink: 0 }}>
          {dateIN(r.requested_at)}
        </Text>
      </View>
      <Text variant="label" muted>
        {r.prev_value || '—'} → <Text variant="labelStrong">{r.new_value || '—'}</Text>
      </Text>
      {label ? <StatusPill label={label} tone={tone} /> : null}
      {r.review_note ? (
        <Text variant="label" muted style={{ fontFamily: font.serifItalic }}>
          “{r.review_note}”
        </Text>
      ) : null}
    </View>
  );
}

// ── Documents ──────────────────────────────────────────────────────────────────
// One pressable row per document (opens the viewer); the status sits under the name so long labels
// such as "Needs a new copy" never squeeze the name.
export function DocumentItem({ doc, onView }: { doc: VendorDocument; onView: () => void }) {
  const chip = docStatus(doc.status) ?? { label: 'Waiting', tone: 'pending' as const };
  const pill = doc.status === 'pending' ? { label: 'Waiting', tone: 'pending' as const } : chip;
  const name = docLabel(doc.docType, doc.label);
  const meta = [doc.generated ? 'Signed online' : doc.fileName, doc.uploadedAt ? dateIN(doc.uploadedAt) : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onView}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${pill.label}. Opens the document`}
      style={({ pressed }) => [styles.doc, pressed && { backgroundColor: palette.pressedTint }]}>
      <ModuleBadge module="vendor" icon={FileText} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {name}
        </Text>
        {meta ? (
          <Text variant="caption" muted numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {/* Accounts' note: amber only when it asks for a new copy; otherwise a quiet muted quote (up to 3
            lines), so "Auto-fetched from Digio…" on every verified file doesn't read as a warning. */}
        {doc.remarks ? (
          <Text
            variant="label"
            color={doc.status === 'correction_required' ? palette.warningInk : palette.textMuted}
            numberOfLines={3}
            style={{ fontFamily: font.serifItalic }}>
            “{doc.remarks}”
          </Text>
        ) : null}
        <StatusPill label={pill.label} tone={pill.tone} />
      </View>
      <ChevronRight size={18} color={palette.textFaint} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}

// "PAN linked to Aadhaar" exactly as the website words it — blank until it has been established.
export function panAadhaarText(v: Vendor) {
  const st = v.tax?.panAadhaarCheck?.status;
  if (st === 'linked') return 'Yes, verified';
  if (st === 'not_linked') return 'No. Please link your PAN with Aadhaar.';
  if (st === 'not_applicable') return 'Not needed for this type of PAN';
  const b = v.tax?.panLinkedToAadhaar;
  if (b === null || b === undefined) return '';
  return b ? 'Yes' : 'No';
}

const styles = themedStyles(() => ({
  item: { gap: 6, paddingVertical: space.sm, paddingHorizontal: space.md },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minHeight: 72,
    borderRadius: radius.md,
  },
}));
