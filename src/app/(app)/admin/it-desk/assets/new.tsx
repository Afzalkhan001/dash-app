// Add an asset (web: the Add Asset modal, dash.html:20855–20880). The same fields and defaults
// (Hyderabad, Electronics, warranty Active, condition Fair) plus Comments; name and serial number are
// required. The Asset ID must not be used by another asset in the company: checked here against the
// list first, and the server refuses it too (409). It is added in stock — assigning it is a separate
// step on the asset (which messages the person) — or, with "Allocate to a third party now", straight to
// a vendor, client or contractor (who is e-mailed only if an e-mail is given). Serial number and asset
// ID can be scanned from the label. Bulk add from a spreadsheet is under More › Import & export.

import { Redirect, useRouter } from 'expo-router';
import { Building2, PackagePlus, ScanBarcode } from 'lucide-react-native';
import { useState } from 'react';

import { assetIdTaken, assetIdTakenMessage, type AssetForm, TP_BLANK, type TpInput, tpCommentsLabel, tpEmailOk, tpProblem, useAssets, useAssetWrites } from '@/api/itdesk';
import { QrScanner } from '@/features/deskqr/camera';
import { canSeeAssets } from '@/features/itdesk/access';
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_TAG_CODES, conditionIcon, conditionWords } from '@/features/itdesk/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { FIELD_LABEL_INSET, ActionBar, Banner, Button, Card, DateField, IconButton, NavHeader, Screen, Segmented, SelectField, SelectTiles, SuccessSheet, SwitchRow, Text, TextField } from '@/ui';

const BLANK: AssetForm = {
  assetId: '',
  name: '',
  description: '',
  location: 'Hyderabad',
  category: 'Electronics',
  assetType: '',
  purchaseDate: '',
  warrantyStatus: 'Active',
  warrantyExpiry: '',
  condition: 'Fair',
  serial: '',
  price: '',
  comments: '',
};

export default function NewAssetScreen() {
  const router = useRouter();
  const access = useAccess();
  const allowed = canSeeAssets(access);
  const { create } = useAssetWrites();
  const assets = useAssets(allowed);
  const [f, setF] = useState<AssetForm>(BLANK);
  const [allocNow, setAllocNow] = useState(false);
  const [tp, setTp] = useState<TpInput>(TP_BLANK);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; name: string; to: string } | null>(null);
  const [scanFor, setScanFor] = useState<'serial' | 'assetId' | null>(null);

  if (access.user && !allowed) return <Redirect href="/" />;

  const set = (k: keyof AssetForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const nameErr = tried && !f.name.trim() ? 'Give the asset a name' : null;
  const serialErr = tried && !f.serial.trim() ? 'Enter the serial number' : null;
  const priceBad = !!f.price.trim() && !(Number(f.price) >= 0);
  // Once added, the refreshed list holds this very asset: no clash to show behind the success sheet.
  const clash = made ? null : assetIdTaken(assets.data ?? [], f.assetId);
  const idErr = clash ? assetIdTakenMessage(f.assetId, clash) : null;
  const tpBad = allocNow ? tpProblem(tp) : '';
  const blocker =
    !f.name.trim() || !f.serial.trim()
      ? 'Name and serial number are needed'
      : priceBad
        ? 'Value must be a number'
        : idErr
          ? 'This Asset ID is already used'
          : tpBad
            ? tpBad
            : null;
  const setTpField = (k: keyof TpInput) => (v: string) => setTp((x) => ({ ...x, [k]: v }));

  const scanButton = (k: 'serial' | 'assetId', what: string) => (
    <IconButton accessibilityLabel={`Scan the ${what}`} size={32} tone="surface" onPress={() => setScanFor(k)}>
      <ScanBarcode size={18} color={palette.textMuted} />
    </IconButton>
  );

  const save = () => {
    setTried(true);
    setError(null);
    if (blocker) return;
    create.mutate(
      { ...f, allocate: allocNow ? tp : null },
      {
        onSuccess: (id) => setMade({ id, name: f.name.trim(), to: allocNow ? tp.name.trim() : '' }),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen
      header={<NavHeader title="Add an asset" />}
      footer={
        <ActionBar note={tried ? blocker : null}>
          <Button title="Add asset" icon={<PackagePlus />} loading={create.isPending} onPress={save} />
        </ActionBar>
      }>
      <Card style={styles.group}>
        <TextField label="Name" value={f.name} onChangeText={set('name')} placeholder="e.g. MacBook Air" error={nameErr} maxLength={120} />
        <TextField label="Serial number" value={f.serial} onChangeText={set('serial')} placeholder="e.g. SN-2025-001" autoCapitalize="characters" autoCorrect={false} error={serialErr} right={scanButton('serial', 'serial number')} />
        <TextField
          label="Asset ID (optional)"
          value={f.assetId}
          onChangeText={set('assetId')}
          placeholder="e.g. TM-LAP-031"
          autoCapitalize="characters"
          autoCorrect={false}
          right={scanButton('assetId', 'asset ID')}
          error={idErr}
        />
      </Card>

      <Card style={styles.group}>
        <SelectField label="Category" value={f.category} options={ASSET_CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={set('category')} />
        <TextField label="Type" value={f.assetType} onChangeText={set('assetType')} placeholder="e.g. Mac, Monitor" hint="Assets of the same type are grouped together." />
        <TextField label="Location" value={f.location} onChangeText={set('location')} placeholder="e.g. Hyderabad" />
        <Text variant="labelStrong" muted numberOfLines={1} style={FIELD_LABEL_INSET}>
          Condition
        </Text>
        <SelectTiles value={f.condition} onChange={set('condition')} accessibilityLabel="Condition" options={ASSET_CONDITIONS.map((c) => ({ value: c, label: conditionWords(c), icon: conditionIcon(c) }))} />
      </Card>

      <Card style={styles.group}>
        <DateField label="Bought on" value={f.purchaseDate || null} onChange={set('purchaseDate')} placeholder="Choose a date" />
        <TextField
          label="Value (₹)"
          value={f.price}
          onChangeText={(v) => set('price')(v.replace(/[^\d.]/g, ''))}
          placeholder="e.g. 76000"
          keyboardType="decimal-pad"
          error={priceBad ? 'Enter a number' : null}
        />
        <Text variant="labelStrong" muted numberOfLines={1} style={FIELD_LABEL_INSET}>
          Warranty
        </Text>
        <Segmented
          options={[
            { key: 'Active', label: 'Active' },
            { key: 'Expired', label: 'Expired' },
          ]}
          value={f.warrantyStatus === 'Expired' ? 'Expired' : 'Active'}
          onChange={set('warrantyStatus')}
        />
        <DateField label="Warranty ends on" value={f.warrantyExpiry || null} onChange={set('warrantyExpiry')} placeholder="Choose a date" />
      </Card>

      <Card style={styles.group}>
        <TextField label="Description (optional)" value={f.description} onChangeText={set('description')} placeholder="Specs, model details or any notes" multiline maxLength={500} counter />
        <TextField label="Comments (optional)" value={f.comments} onChangeText={set('comments')} placeholder="Shown in the asset list" maxLength={300} />
      </Card>

      <Card style={styles.group}>
        <SwitchRow
          flush
          icon={Building2}
          module="support"
          title="Allocate to a third party now"
          subtitle="A vendor, client or contractor outside DASH"
          value={allocNow}
          onChange={setAllocNow}
        />
        {allocNow ? (
          <>
            <TextField
              label="Allocated to (person or company)"
              value={tp.name}
              onChangeText={setTpField('name')}
              placeholder="e.g. Ravi Kumar"
              autoCapitalize="words"
              maxLength={120}
              error={tried && tp.name.trim().length < 2 ? 'Say who the asset is allocated to.' : null}
            />
            <TextField label="Organisation (optional)" value={tp.org} onChangeText={setTpField('org')} placeholder="e.g. Sai Studios" autoCapitalize="words" maxLength={120} />
            <TextField label="Phone (optional)" value={tp.phone} onChangeText={setTpField('phone')} placeholder="e.g. 9876543210" keyboardType="phone-pad" maxLength={30} />
            <TextField
              label="E-mail (optional)"
              value={tp.email}
              onChangeText={setTpField('email')}
              placeholder="e.g. ravi@saistudios.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={120}
              hint="If given, they are e-mailed that the asset was assigned to them."
              error={tpEmailOk(tp) ? null : 'That does not look like an e-mail address.'}
            />
            <TextField label="Remarks (optional)" value={tp.note} onChangeText={setTpField('note')} placeholder="e.g. for the shoot, return by 30 Oct" maxLength={300} />
            {tp.name.trim() ? <Banner tone="warning" title="Comments will read" message={tpCommentsLabel(tp) + (f.comments.trim() ? ` · ${f.comments.trim()}` : '')} /> : null}
          </>
        ) : null}
      </Card>

      {error ? <Banner tone="danger" title="Couldn’t add the asset" message={error} /> : null}

      <QrScanner
        visible={!!scanFor}
        title={scanFor === 'assetId' ? 'Scan the asset ID' : 'Scan the serial number'}
        hint="Point the camera at the barcode or QR label."
        barcodeTypes={[...ASSET_TAG_CODES]}
        onScanned={(data) => {
          const v = data.trim().slice(0, 120);
          if (!v) return 'That label was empty. Try again.';
          if (scanFor) set(scanFor)(v);
          setScanFor(null);
        }}
        onClose={() => setScanFor(null)}
      />

      <SuccessSheet
        visible={!!made}
        onClose={() => router.back()}
        title="Asset added"
        subtitle={made?.to ? `${made.name} is with ${made.to}. Return it from its page when it comes back.` : `${made?.name ?? 'It'} is in stock. Assign it from its page.`}
        secondaryLabel="Add another"
        onSecondary={() => {
          setMade(null);
          setF(BLANK);
          setAllocNow(false);
          setTp(TP_BLANK);
          setTried(false);
        }}
        primaryLabel="Open asset"
        onPrimary={() => made && router.replace(`/admin/it-desk/assets/${encodeURIComponent(made.id)}`)}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  group: { gap: space.md },
}));
