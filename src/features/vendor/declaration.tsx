// A generated declaration (tax declaration / non-GST): read the wording the server writes from the
// vendor's saved answers, then e-sign it — the website's VPDeclaration (dash.html ~31173). The row is
// the name, one line of help and one button; the sheet is the text, three short fields, one consent
// tick and "Sign".
// The draft is saved first so the preview matches what is on screen; if that save fails, the
// preview would be built from stale data, so it stops there with the real error.

import { useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react-native';
import { useEffect, useEffectEvent, useState } from 'react';
import { View } from 'react-native';

import { type ApiResult, isApiError } from '@/api/client';
import { type DeclarationPreview, type DeclarationType, getDeclarationPreview, signDeclaration, type Vendor, VENDOR_ME_KEY, type VendorDocument } from '@/api/vendor';
import { DOC_HINT, DOC_LABEL } from '@/features/vendor/constants';
import { CheckRow, Field, InfoRows, useOpenCount } from '@/features/vendor/ui';
import { palette, radius, space } from '@/theme/tokens';
import { ActionRow, Banner, Button, haptic, Sheet, Skeleton, StatusPill, Text } from '@/ui';

import { themedStyles } from '@/theme/themed';
type Props = {
  docType: DeclarationType;
  vendor: Vendor;
  signed?: VendorDocument;
  onBeforeLoad?: () => Promise<boolean>;
  defaultSignatoryName?: string;
};

export function DeclarationRow({ docType, vendor, signed, onBeforeLoad, defaultSignatoryName }: Props) {
  const [open, setOpen] = useState(false);
  const session = useOpenCount(open);
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong">
            {DOC_LABEL[docType]}
            <Text variant="bodyStrong" color={palette.dangerInk}>
              {' *'}
            </Text>
          </Text>
          <Text variant="caption" muted>
            {DOC_HINT[docType]}
          </Text>
          {signed?.reference ? (
            <Text variant="caption" color={palette.successInk} tabular>
              Signed · ref {signed.reference}
            </Text>
          ) : null}
        </View>
        {signed ? <StatusPill label="Signed" tone="done" /> : null}
      </View>
      <Button
        title={signed ? 'Read or sign again' : 'Read and sign'}
        variant={signed ? 'ghost' : 'accent'}
        size="md"
        icon={<PenLine />}
        onPress={() => setOpen(true)}
        style={{ alignSelf: 'flex-start' }}
      />
      {/* A fresh sheet per opening (keyed by the open count); it loads the preview when it mounts. */}
      {session ? (
        <DeclarationSheet
          key={session}
          visible={open}
          docType={docType}
          vendor={vendor}
          onBeforeLoad={onBeforeLoad}
          defaultSignatoryName={defaultSignatoryName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

// The Sheet lives inside the form so Cancel / Sign declaration sit in its pinned footer, and a backdrop
// or handle tap asks before discarding a typed signatory name, designation or place.
function DeclarationSheet({
  visible,
  docType,
  vendor,
  onBeforeLoad,
  defaultSignatoryName,
  onClose,
}: Omit<Props, 'signed'> & { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<DeclarationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialName] = useState(defaultSignatoryName || vendor.business?.contactPerson || '');
  const [initialDesignation] = useState(vendor.business?.designation || '');
  const [name, setName] = useState(initialName);
  const [designation, setDesignation] = useState(initialDesignation);
  const [place, setPlace] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loads once when the sheet opens, like the website's load(): save the draft, then preview.
  const prepare = useEffectEvent(async (): Promise<ApiResult<DeclarationPreview> | 'not-saved'> => {
    if (onBeforeLoad && !(await onBeforeLoad())) return 'not-saved';
    return getDeclarationPreview(docType);
  });

  useEffect(() => {
    let alive = true;
    void prepare().then((r) => {
      if (!alive) return;
      if (r === 'not-saved') {
        setLoadError('We couldn’t save your answers, so the form can’t be prepared. Close this to see why.');
      } else if (isApiError(r)) setLoadError(r.error);
      else setPreview(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function sign() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await signDeclaration(docType, { signatoryName: name, designation, place, agreed });
    setBusy(false);
    if (isApiError(r)) {
      haptic.error();
      return setError(r.error);
    }
    haptic.success();
    await qc.invalidateQueries({ queryKey: VENDOR_ME_KEY });
    onClose();
  }

  const title = DOC_LABEL[docType];

  if (!preview && !loadError) {
    return (
      <Sheet visible={visible} onClose={onClose} title={title}>
        <View style={{ gap: space.sm }} accessibilityLabel="Preparing the declaration" accessibilityRole="progressbar">
          <Skeleton height={22} width="70%" radius={6} />
          <Skeleton height={160} radius={radius.md} />
          <Skeleton height={80} radius={radius.md} />
        </View>
      </Sheet>
    );
  }

  if (!preview) {
    return (
      <Sheet visible={visible} onClose={onClose} title={title} footer={<Button title="Close" variant="accent" onPress={onClose} />}>
        <Banner tone="danger" title="Couldn’t prepare the form" message={loadError ?? 'Could not prepare this form.'} />
      </Sheet>
    );
  }

  const canSign = agreed && !!name.trim() && !!place.trim();
  const dirty = !!place.trim() || name !== initialName || designation !== initialDesignation;
  const facts = (Array.isArray(preview.facts) ? preview.facts : []).filter((f): f is [string, string] => Array.isArray(f) && f.length >= 2);
  const lines = (Array.isArray(preview.lines) ? preview.lines : []).filter((l): l is string => typeof l === 'string' && !!l);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      dirty={dirty}
      footer={
        <ActionRow context="sheet">
          <Button title="Cancel" variant="accent" onPress={onClose} disabled={busy} />
          <Button title="Sign" onPress={sign} loading={busy} disabled={!canSign} />
        </ActionRow>
      }>
      <View style={{ gap: 2 }}>
        <Text variant="heading" accessibilityRole="header">
          {preview.title || DOC_LABEL[docType]}
        </Text>
        {preview.addressedTo ? (
          <Text variant="label" muted>
            Addressed to {preview.addressedTo}
          </Text>
        ) : null}
      </View>
      {facts.length ? (
        <View style={styles.facts}>
          <InfoRows rows={facts.map(([k, val]) => ({ label: String(k), value: val == null ? '' : String(val) }))} />
        </View>
      ) : null}
      {lines.length ? (
        <View style={{ gap: space.xs }}>
          {lines.map((l, i) => (
            <Text key={i} variant="label" color={palette.text}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
      <Text variant="caption" muted>
        Something wrong? Close this and fix it in the form.
      </Text>
      <Field label="Name of person signing" required value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Designation (optional)" value={designation} onChangeText={setDesignation} autoCapitalize="words" />
      <Field label="Place" required value={place} onChangeText={setPlace} placeholder="e.g. Hyderabad" autoCapitalize="words" />
      <CheckRow checked={agreed} onChange={setAgreed}>
        <Text variant="label">
          I confirm the information above is true and correct to the best of my knowledge, that I am authorised to sign on behalf of{' '}
          <Text variant="labelStrong">{vendor.business?.legalEntityName || 'this entity'}</Text>, and I agree to sign this declaration electronically.
        </Text>
      </CheckRow>
      <Text variant="caption" muted>
        We save your name, the time and your IP address with it.
      </Text>
      {error ? <Banner tone="danger" title="Couldn’t sign" message={error} /> : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  row: { gap: space.sm, paddingVertical: space.xs },
  rowHead: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  facts: { backgroundColor: palette.surface, borderRadius: radius.md, paddingHorizontal: space.md, borderWidth: 1, borderColor: palette.glassLine },
}));
