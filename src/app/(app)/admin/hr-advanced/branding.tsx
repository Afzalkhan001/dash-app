// Branding — the website's Config › Branding and Report Logo cards (dash.html:3540–3569):
//   PUT /tenants/:id {logoUrl, logoText}   the sidebar logo (data URL, PNG or JPG, at most 2 MB)
//   PUT /tenants/:id {logoUrl: null}       remove it
//   PUT /tenants/:id {reportLogoUrl}       the letterhead logo on downloaded PDF reports (null = reuse the sidebar logo)
// The file is sent exactly as picked (expo-document-picker + base64), never re-encoded, so a
// transparent PNG stays transparent; the website's size limit and recommended sizes are kept. Every
// save shows everyone in the company the new logo, so it goes through ConfirmSheet + SwipeToConfirm.
// Nobody is messaged. Gate: the Config page (super_admin, ceo, coo; features/hradvanced/access).

import { Image } from 'expo-image';
import { FileImage, ImagePlus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useUpdateTenant } from '@/api/company';
import { useCompanyAccess } from '@/features/company/gate';
import { canEditCompanyConfig } from '@/features/hradvanced/access';
import { isImageDataUrl, LOGO_TYPES, logoSource, MAX_LOGO_BYTES } from '@/features/hradvanced/company-model';
import { errorText, GateFallback } from '@/features/hradvanced/ui';
import { FileError, pickDocument } from '@/lib/files';
import { lightPalette, palette, radius, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActionRow, Banner, Button, Card, ConfirmSheet, NavHeader, PillField, Screen, SummaryCard, Text, toast } from '@/ui';

type Which = 'logo' | 'report';
type Pending = { which: Which; kind: 'save' | 'remove' } | null;

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const sizeOf = (dataUrl: string) => Math.round(((dataUrl.split(',')[1] ?? '').length * 3) / 4);

export default function BrandingScreen() {
  const { user, tenant, ready } = useCompanyAccess();
  const allowed = canEditCompanyConfig(user, tenant);
  const header = <NavHeader title="Branding" />;
  if (!allowed || !tenant) return <GateFallback pending={!ready} header={header} />;
  return <BrandingForm key={tenant.id} header={header} tenantId={tenant.id} name={String(tenant.name || 'your company')} logoText={String(tenant.logoText || '')} logoUrl={logoSource(tenant.logoUrl)} reportLogoUrl={logoSource(tenant.reportLogoUrl)} />;
}

function BrandingForm({ header, tenantId, name, logoText, logoUrl, reportLogoUrl }: { header: React.ReactNode; tenantId: string; name: string; logoText: string; logoUrl: string | null; reportLogoUrl: string | null }) {
  const update = useUpdateTenant();
  const [text, setText] = useState(logoText);
  const [logo, setLogo] = useState<string | null>(logoUrl);
  const [report, setReport] = useState<string | null>(reportLogoUrl);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickErr, setPickErr] = useState<string | null>(null);

  const brandingChanged = text.trim() !== logoText.trim() || logo !== logoUrl;
  const reportChanged = report !== reportLogoUrl;

  const pick = async (which: Which) => {
    setPickErr(null);
    try {
      const f = await pickDocument(LOGO_TYPES);
      if (!f) return;
      if (!LOGO_TYPES.includes(f.type) || !isImageDataUrl(f.dataUrl)) throw new FileError('Choose a PNG or JPG image.');
      if (f.size > MAX_LOGO_BYTES) throw new FileError('File too large. Max 2 MB.');
      if (which === 'logo') setLogo(f.dataUrl);
      else setReport(f.dataUrl);
    } catch (e) {
      setPickErr(errorText(e, 'Couldn’t read that file.'));
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setError(null);
    const patch =
      pending.which === 'logo'
        ? pending.kind === 'remove'
          ? { logoUrl: null }
          : { logoUrl: logo || null, logoText: text.trim() }
        : pending.kind === 'remove'
          ? { reportLogoUrl: null }
          : { reportLogoUrl: report || null };
    try {
      await update.mutateAsync({ tenantId, patch });
      if (pending.which === 'logo' && pending.kind === 'remove') setLogo(null);
      if (pending.which === 'report' && pending.kind === 'remove') setReport(null);
      toast.show(pending.kind === 'remove' ? 'Logo removed.' : pending.which === 'logo' ? 'Branding saved.' : 'Report logo saved.');
      setPending(null);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const shown = pending?.which === 'report' ? report : logo;

  return (
    <Screen header={header}>
      <Card>
        <View style={styles.stack}>
          <Text variant="heading">Sidebar logo</Text>
          <PillField label="Logo text" value={text} onChangeText={(v) => setText(v.slice(0, 40))} placeholder="e.g. DASH" hint="Shown on the website’s sidebar when there is no logo image." />
          <LogoPreview uri={logo} empty="No logo image yet" />
          <Text variant="caption" muted>
            PNG or JPG, at most 2 MB. Best at 240 × 60 px; a transparent PNG works best on the dark sidebar.
          </Text>
          <ActionRow>
            <Button title={logo ? 'Replace' : 'Choose image'} variant="ghost" icon={<ImagePlus />} onPress={() => void pick('logo')} />
            {logoUrl ? <Button title="Remove" variant="danger" icon={<Trash2 />} onPress={() => setPending({ which: 'logo', kind: 'remove' })} /> : null}
          </ActionRow>
          <Button title="Apply branding" disabled={!brandingChanged} onPress={() => setPending({ which: 'logo', kind: 'save' })} />
        </View>
      </Card>

      <Card>
        <View style={styles.stack}>
          <Text variant="heading">Report logo</Text>
          <Text variant="caption" muted>
            Printed at the top of every downloaded PDF report (bounty, assets, timesheets, tomorrow’s schedule and more). Leave it empty to reuse the sidebar logo.
          </Text>
          <LogoPreview uri={report} empty="Uses the sidebar logo" />
          <Text variant="caption" muted>
            PNG or JPG, at most 2 MB. Best at 300 × 90 px.
          </Text>
          <ActionRow>
            <Button title={report ? 'Replace' : 'Choose image'} variant="ghost" icon={<FileImage />} onPress={() => void pick('report')} />
            {reportLogoUrl ? <Button title="Remove" variant="danger" icon={<Trash2 />} onPress={() => setPending({ which: 'report', kind: 'remove' })} /> : null}
          </ActionRow>
          <Button title="Save report logo" disabled={!reportChanged} onPress={() => setPending({ which: 'report', kind: 'save' })} />
        </View>
      </Card>
      {pickErr ? <Banner tone="danger" title="Couldn’t use that file" message={pickErr} /> : null}

      <ConfirmSheet
        visible={!!pending}
        onClose={() => setPending(null)}
        title={pending?.kind === 'remove' ? (pending.which === 'logo' ? 'Remove the sidebar logo?' : 'Remove the report logo?') : pending?.which === 'logo' ? 'Apply this branding?' : 'Save this report logo?'}
        subtitle={name}
        confirmLabel={pending?.kind === 'remove' ? 'Swipe to remove' : 'Swipe to save'}
        onConfirm={() => void confirm()}
        loading={update.isPending}
        note="Everyone in the company sees it straight away. Nobody is messaged.">
        {pending?.kind === 'save' && shown ? <LogoPreview uri={shown} empty="" /> : null}
        <SummaryCard
          rows={
            pending?.which === 'logo'
              ? pending.kind === 'remove'
                ? [
                    { label: 'Sidebar', value: text.trim() ? `Shows “${text.trim()}” instead` : 'Shows no logo' },
                    { label: 'PDF reports', value: reportLogoUrl ? 'Keep the report logo' : 'No logo' },
                  ]
                : [
                    { label: 'Logo text', value: text.trim() || '—' },
                    { label: 'Logo image', value: logo ? `${logo === logoUrl ? 'Unchanged' : 'New'} · ${kb(sizeOf(logo))}` : 'None' },
                  ]
              : pending?.kind === 'remove'
                ? [{ label: 'PDF reports', value: logoUrl ? 'Use the sidebar logo' : 'No logo' }]
                : [{ label: 'Report logo', value: report ? `New · ${kb(sizeOf(report))}` : 'None (reuse the sidebar logo)' }]
          }
        />
        {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}

/** The logo on a light and a dark strip, as it will look on the page and on the dark sidebar. */
function LogoPreview({ uri, empty }: { uri: string | null; empty: string }) {
  if (!uri) {
    return empty ? (
      <View style={[styles.strip, styles.light, styles.emptyStrip]}>
        <Text variant="label" muted>
          {empty}
        </Text>
      </View>
    ) : null;
  }
  return (
    <View style={styles.previews} accessibilityLabel="Logo preview" accessible>
      <View style={[styles.strip, styles.light]}>
        <Image source={{ uri }} style={styles.img} contentFit="contain" />
      </View>
      <View style={[styles.strip, styles.dark]}>
        <Image source={{ uri }} style={styles.img} contentFit="contain" />
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  stack: { gap: space.md },
  previews: { gap: space.xs },
  strip: { height: 76, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: space.sm, borderWidth: 1, borderColor: palette.hairline },
  // Fixed on purpose: the website's white page and its dark sidebar, whatever the app's theme.
  light: { backgroundColor: lightPalette.surface },
  dark: { backgroundColor: lightPalette.ink },
  emptyStrip: { backgroundColor: palette.surfaceSunken, borderStyle: 'dashed' },
  img: { width: '100%', height: 60 },
}));
