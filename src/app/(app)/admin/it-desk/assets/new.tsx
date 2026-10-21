// Add an asset (web: the Add Asset modal, dash.html:20731–20758). The same fields and defaults
// (Hyderabad, Electronics, warranty Active, condition Fair); name and serial number are required.
// It is added in stock — assigning it is a separate step on the asset (which messages the person).
// Serial number and asset ID can be scanned from the label. No one is messaged by adding it. Bulk add from a spreadsheet stays on the website.

import { Redirect, useRouter } from 'expo-router';
import { PackagePlus, ScanBarcode } from 'lucide-react-native';
import { useState } from 'react';

import { type AssetForm, useAssetWrites } from '@/api/itdesk';
import { QrScanner } from '@/features/deskqr/camera';
import { canSeeAssets } from '@/features/itdesk/access';
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_TAG_CODES, conditionIcon, conditionWords } from '@/features/itdesk/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { FIELD_LABEL_INSET, ActionBar, Banner, Button, Card, DateField, IconButton, NavHeader, Screen, Segmented, SelectField, SelectTiles, SuccessSheet, Text, TextField } from '@/ui';

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
};

export default function NewAssetScreen() {
  const router = useRouter();
  const access = useAccess();
  const allowed = canSeeAssets(access);
  const { create } = useAssetWrites();
  const [f, setF] = useState<AssetForm>(BLANK);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; name: string } | null>(null);
  const [scanFor, setScanFor] = useState<'serial' | 'assetId' | null>(null);

  if (access.user && !allowed) return <Redirect href="/" />;

  const set = (k: keyof AssetForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const nameErr = tried && !f.name.trim() ? 'Give the asset a name' : null;
  const serialErr = tried && !f.serial.trim() ? 'Enter the serial number' : null;
  const priceBad = !!f.price.trim() && !(Number(f.price) >= 0);
  const blocker = !f.name.trim() || !f.serial.trim() ? 'Name and serial number are needed' : priceBad ? 'Value must be a number' : null;

  const scanButton = (k: 'serial' | 'assetId', what: string) => (
    <IconButton accessibilityLabel={`Scan the ${what}`} size={32} tone="surface" onPress={() => setScanFor(k)}>
      <ScanBarcode size={18} color={palette.textMuted} />
    </IconButton>
  );

  const save = () => {
    setTried(true);
    setError(null);
    if (blocker) return;
    create.mutate(f, {
      onSuccess: (id) => setMade({ id, name: f.name.trim() }),
      onError: (e) => setError(e.message),
    });
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
        <TextField label="Asset ID (optional)" value={f.assetId} onChangeText={set('assetId')} placeholder="e.g. TM-LAP-031" autoCapitalize="characters" autoCorrect={false} right={scanButton('assetId', 'asset ID')} />
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
        subtitle={`${made?.name ?? 'It'} is in stock. Assign it from its page.`}
        secondaryLabel="Add another"
        onSecondary={() => {
          setMade(null);
          setF(BLANK);
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
