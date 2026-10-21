// Assets (web: AssetCatalog, dash.html:20140–20982) — the company's equipment for the IT Admin.
//
// NavHeader (filters, add) → SummaryHero (how many, total value, with people · in stock) → the website's
// KPIs as tiles that narrow the list (waiting to acknowledge, warranty ending in 60 days, warranty
// ended, no name found) → All / With people / In stock → categories (the website's grouping: the Mac
// family is one kind, case and space variants are one label) → search (asset ID, name, serial, employee
// number, name) → rows, 40 at a time. A row opens the asset, where assign / return / condition / delete are.
// The scan button in the search field reads an asset tag (barcode or QR: asset ID, serial or a link to it) and opens the asset.
// The filter sheet holds Location, Condition, Warranty status and the warranty-end range.
// Stays on the website: bulk upload from Excel, the template, Excel / PDF reports, "Delete all assets".

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ListFilter, Package, PackagePlus, ScanBarcode, Search, SearchX, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Asset, useAssets } from '@/api/itdesk';
import { useTodayIst } from '@/features/attendance/use-now';
import { QrScanner } from '@/features/deskqr/camera';
import { canSeeAssets } from '@/features/itdesk/access';
import {
  ACK_WORDS,
  ackState,
  ASSET_TAG_CODES,
  assetIcon,
  assetsForTag,
  assetKpis,
  assetStatus,
  categoryCounts,
  conditionTone,
  conditionWords,
  grouping,
  holderOf,
  isAssigned,
  matchesAsset,
  warrantyGone,
  warrantySoon,
  warrantyYmd,
} from '@/features/itdesk/format';
import { StatusRow, useAssetDirectory } from '@/features/itdesk/ui';
import { dateLabel } from '@/lib/dates';
import { inr, plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActivityList,
  Button,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  ErrorState,
  IconButton,
  NavHeader,
  Screen,
  Segmented,
  SelectField,
  Sheet,
  Skeleton,
  SkeletonList,
  StatGrid,
  StatTile,
  SummaryHero,
  Text,
  TextField,
} from '@/ui';

const PAGE = 40;
type Seg = 'all' | 'assigned' | 'available';
type Quick = 'ackWaiting' | 'soon' | 'expired' | 'noRecord';
const QUICK_WORDS: Record<Quick, string> = { ackWaiting: 'Waiting to acknowledge', soon: 'Warranty ends in 60 days', expired: 'Warranty ended', noRecord: 'No name found' };
type Filters = { location: string; condition: string; warrantyStatus: string; expFrom: string; expTo: string };
const NO_FILTERS: Filters = { location: '', condition: '', warrantyStatus: '', expFrom: '', expTo: '' };
const ANY = { value: '', label: 'Any' };

/** dash.html:20462 matchFlt */
function inFilters(a: Asset, f: Filters) {
  if (f.location && a.location !== f.location) return false;
  if (f.condition && a.condition !== f.condition) return false;
  if (f.warrantyStatus && a.warrantyStatus !== f.warrantyStatus) return false;
  if (f.expFrom || f.expTo) {
    const d = warrantyYmd(a.warrantyExpiry);
    if (!d) return false;
    if (f.expFrom && d < f.expFrom) return false;
    if (f.expTo && d > f.expTo) return false;
  }
  return true;
}

const isQuick = (v: unknown): v is Quick => v === 'ackWaiting' || v === 'soon' || v === 'expired' || v === 'noRecord';

export default function AssetsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const access = useAccess();
  const allowed = canSeeAssets(access);
  const today = useTodayIst();
  const assets = useAssets(allowed);
  const { dir } = useAssetDirectory(allowed);
  const [seg, setSeg] = useState<Seg>('all');
  const [quick, setQuick] = useState<Quick | null>(isQuick(params.view) ? params.view : null);
  const [cat, setCat] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [scanOpen, setScanOpen] = useState(false);

  if (access.user && !allowed) return <Redirect href="/" />;

  const list = assets.data ?? [];
  const g = grouping(list);
  const k = assetKpis(list, today);
  const holder = (a: Asset) => holderOf(a, dir);
  const noRecord = (a: Asset) => isAssigned(a) && !!dir && !holder(a);
  const noRecordCount = dir ? list.filter(noRecord).length : 0;
  const cats = categoryCounts(list, g);
  const kinds = cat
    ? [...new Set(list.filter((a) => g.catOf(a) === cat).map((a) => g.kindOf(a) || ''))].sort((x, y) => (x === '' ? 1 : y === '' ? -1 : x.localeCompare(y)))
    : [];

  const inQuick = (a: Asset) =>
    quick === 'ackWaiting'
      ? isAssigned(a) && !a.acknowledged && a.ackToken
      : quick === 'soon'
        ? warrantySoon(a, today)
        : quick === 'expired'
          ? warrantyGone(a, today)
          : quick === 'noRecord'
            ? noRecord(a)
            : true;
  const visible = list.filter(
    (a) =>
      (seg === 'all' || assetStatus(a) === seg || (seg === 'available' && !isAssigned(a))) &&
      inQuick(a) &&
      (!cat || g.catOf(a) === cat) &&
      (kind === null || (g.kindOf(a) || '') === kind) &&
      inFilters(a, filters) &&
      matchesAsset(a, q, holder(a)),
  );
  const filterCount = Object.values(filters).filter(Boolean).length;
  const reset = () => setShown(PAGE);

  const locations = [...new Set(list.map((a) => a.location).filter(Boolean))].sort();
  const conditions = [...new Set(list.map((a) => a.condition).filter(Boolean))].sort();
  const chips: { key: keyof Filters; label: string }[] = [
    ...(filters.location ? [{ key: 'location' as const, label: filters.location }] : []),
    ...(filters.condition ? [{ key: 'condition' as const, label: conditionWords(filters.condition) }] : []),
    ...(filters.warrantyStatus ? [{ key: 'warrantyStatus' as const, label: `Warranty ${filters.warrantyStatus.toLowerCase()}` }] : []),
    ...(filters.expFrom ? [{ key: 'expFrom' as const, label: `Ends from ${dateLabel(filters.expFrom, today)}` }] : []),
    ...(filters.expTo ? [{ key: 'expTo' as const, label: `Ends by ${dateLabel(filters.expTo, today)}` }] : []),
  ];
  const narrowed = !!q.trim() || filterCount > 0 || !!quick || !!cat || seg !== 'all';

  // One pill, for what needs a look: no name found, an acknowledgement waiting, or a condition that
  // isn't Good. A "Good" pill on most rows said nothing and took the names' width.
  const pill = (a: Asset) => {
    if (noRecord(a)) return { label: 'No name found', tone: 'failed' as const };
    const ack = ackState(a);
    if (ack === 'waiting') return { label: ACK_WORDS.waiting.label, tone: ACK_WORDS.waiting.tone };
    if (a.condition === 'Good') return null;
    return { label: conditionWords(a.condition), tone: conditionTone(a.condition) };
  };

  // A scanned tag opens its asset; a tag shared by several assets (or a serial typed twice) narrows the
  // list to them. An unknown tag keeps the camera open with a plain message.
  const onTag = (data: string) => {
    if (!assets.data) return 'The assets are still loading. Try again in a moment.';
    const { assets: hits, term } = assetsForTag(list, data);
    if (!hits.length) return `No asset has the tag “${data.trim().slice(0, 40)}”. Try another, or close and search.`;
    setScanOpen(false);
    if (hits.length === 1) {
      router.push(`/admin/it-desk/assets/${encodeURIComponent(hits[0]!.id)}`);
      return;
    }
    setSeg('all');
    setQuick(null);
    setCat(null);
    setKind(null);
    setFilters(NO_FILTERS);
    setQ(term);
    reset();
  };

  const tiles: { key: Quick; label: string; value: number }[] = [
    { key: 'ackWaiting', label: 'Waiting to acknowledge', value: k.ackWaiting },
    { key: 'soon', label: 'Warranty ends in 60 days', value: k.soon },
    { key: 'expired', label: 'Warranty ended', value: k.expired },
    ...(noRecordCount ? [{ key: 'noRecord' as const, label: 'No name found', value: noRecordCount }] : []),
  ];

  return (
    <Screen
      header={
        <NavHeader
          title="Assets"
          actions={[
            {
              key: 'filter',
              icon: ListFilter,
              label: filterCount ? `Filters, ${filterCount} on` : 'Filters',
              dot: filterCount > 0,
              onPress: () => {
                setDraft(filters);
                setFilterOpen(true);
              },
            },
            { key: 'add', icon: PackagePlus, label: 'Add an asset', onPress: () => router.push('/admin/it-desk/assets/new') },
          ]}
        />
      }
      onRefresh={() => assets.refetch()}>
      {assets.data ? (
        <SummaryHero
          icon={Package}
          module="support"
          label="Company equipment"
          value={k.total}
          info={{ label: 'Total value', value: inr(k.value, { decimals: false }) }}
          sub={`${plural(k.assigned, 'asset')} with people · ${k.available} in stock`}
        />
      ) : (
        <Skeleton height={176} radius={radius.xxl} />
      )}

      {assets.data && list.length ? (
        <StatGrid columns={2}>
          {tiles.map((t) => (
            <StatTile
              key={t.key}
              variant="light"
              label={t.label}
              value={t.value}
              valueColor={quick === t.key ? palette.primaryText : undefined}
              caption={quick === t.key ? 'Showing these' : undefined}
              onPress={() => {
                setQuick(quick === t.key ? null : t.key);
                reset();
              }}
            />
          ))}
        </StatGrid>
      ) : null}

      <Segmented<Seg>
        options={[
          { key: 'all', label: 'All' },
          { key: 'assigned', label: 'With people' },
          { key: 'available', label: 'In stock' },
        ]}
        value={seg}
        onChange={(v) => {
          setSeg(v);
          reset();
        }}
      />

      {cats.length > 1 ? (
        <ChipRow>
          <Chip
            label="All types"
            selected={!cat}
            onPress={() => {
              setCat(null);
              setKind(null);
              reset();
            }}
          />
          {cats.map((c) => (
            <Chip
              key={c.cat}
              label={c.cat}
              count={c.total}
              selected={cat === c.cat}
              onPress={() => {
                setCat(cat === c.cat ? null : c.cat);
                setKind(null);
                reset();
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      {cat && kinds.length > 1 ? (
        <ChipRow>
          {kinds.map((t) => (
            <Chip
              key={t || 'none'}
              label={t || 'No type'}
              selected={kind === t}
              onPress={() => {
                setKind(kind === t ? null : t);
                reset();
              }}
            />
          ))}
        </ChipRow>
      ) : null}

      <TextField
        value={q}
        onChangeText={(v) => {
          setQ(v);
          reset();
        }}
        placeholder="Search or scan an asset"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search assets"
        left={<Search size={18} color={palette.textMuted} />}
        right={
          q ? (
            <IconButton accessibilityLabel="Clear search" size={32} tone="surface" onPress={() => setQ('')}>
              <X size={16} color={palette.textMuted} />
            </IconButton>
          ) : (
            <IconButton accessibilityLabel="Scan an asset tag" size={32} tone="surface" onPress={() => setScanOpen(true)}>
              <ScanBarcode size={18} color={palette.textMuted} />
            </IconButton>
          )
        }
      />

      {quick || chips.length ? (
        <ChipRow>
          {quick ? <Chip label={QUICK_WORDS[quick]} selected icon={<X />} onPress={() => setQuick(null)} /> : null}
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} selected icon={<X />} onPress={() => setFilters((f) => ({ ...f, [c.key]: '' }))} />
          ))}
        </ChipRow>
      ) : null}

      <View style={styles.list}>
        {visible.length ? (
          <>
            <Text variant="caption" muted>
              {visible.length === list.length ? plural(list.length, 'asset') : `${visible.length} of ${list.length} assets`}
            </Text>
            <ActivityList>
              {visible.slice(0, shown).map((a) => {
                const who = holder(a);
                return (
                  <StatusRow
                    key={a.id}
                    module="support"
                    icon={assetIcon(a.assetType, a.category)}
                    title={a.name}
                    subtitle={isAssigned(a) ? (who ? `With ${who}` : `Employee ${a.assignedToEmpNo}`) : 'In stock'}
                    note={[a.assetId, a.serial].filter(Boolean).join(' · ') || undefined}
                    status={pill(a)}
                    chevron
                    onPress={() => router.push(`/admin/it-desk/assets/${encodeURIComponent(a.id)}`)}
                  />
                );
              })}
            </ActivityList>
            {visible.length > shown ? <Button title={`Show ${Math.min(PAGE, visible.length - shown)} more`} variant="ghost" size="md" onPress={() => setShown((n) => n + PAGE)} /> : null}
          </>
        ) : !assets.data && !assets.isError ? (
          <SkeletonList rows={6} avatar />
        ) : assets.isError && !assets.data ? (
          <ErrorState message={assets.error?.message ?? ''} onRetry={() => void assets.refetch()} />
        ) : narrowed ? (
          <EmptyState
            icon={<SearchX color={palette.textMuted} />}
            title="Nothing matches"
            message="Try another search or clear the filters."
            action={
              <Button
                title="Show everything"
                variant="accent"
                size="md"
                onPress={() => {
                  setQ('');
                  setFilters(NO_FILTERS);
                  setQuick(null);
                  setCat(null);
                  setKind(null);
                  setSeg('all');
                }}
              />
            }
          />
        ) : (
          <EmptyState
            icon={<Package color={palette.textMuted} />}
            title="No assets yet"
            message="Add the first one, or upload a spreadsheet under More › Import & export."
            action={<Button title="Add an asset" variant="accent" size="md" icon={<PackagePlus />} onPress={() => router.push('/admin/it-desk/assets/new')} />}
          />
        )}
      </View>

      <QrScanner
        visible={scanOpen}
        title="Scan an asset tag"
        hint="Point the camera at the asset’s barcode or QR label."
        barcodeTypes={[...ASSET_TAG_CODES]}
        onScanned={onTag}
        onClose={() => setScanOpen(false)}
      />

      <Sheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filters"
        footer={
          <View style={styles.sheetButtons}>
            <Button
              title="Show assets"
              onPress={() => {
                setFilters(draft);
                reset();
                setFilterOpen(false);
              }}
            />
            <Button title="Clear filters" variant="text" size="md" onPress={() => setDraft(NO_FILTERS)} />
          </View>
        }>
        <View style={styles.fields}>
          <SelectField label="Location" value={draft.location} options={[ANY, ...locations.map((v) => ({ value: v, label: v }))]} onChange={(v) => setDraft((d) => ({ ...d, location: v }))} />
          <SelectField
            label="Condition"
            value={draft.condition}
            options={[ANY, ...conditions.map((v) => ({ value: v, label: conditionWords(v) }))]}
            onChange={(v) => setDraft((d) => ({ ...d, condition: v }))}
          />
          <SelectField
            label="Warranty"
            value={draft.warrantyStatus}
            options={[ANY, { value: 'Active', label: 'Active' }, { value: 'Expired', label: 'Expired' }]}
            onChange={(v) => setDraft((d) => ({ ...d, warrantyStatus: v }))}
          />
          <DateField label="Warranty ends on or after" value={draft.expFrom || null} onChange={(v) => setDraft((d) => ({ ...d, expFrom: v }))} placeholder="Any day" />
          <DateField label="Warranty ends on or before" value={draft.expTo || null} onChange={(v) => setDraft((d) => ({ ...d, expTo: v }))} placeholder="Any day" />
          {draft.expFrom || draft.expTo ? <Button title="Any warranty date" variant="text" size="sm" onPress={() => setDraft((d) => ({ ...d, expFrom: '', expTo: '' }))} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { gap: space.sm },
  fields: { gap: space.md },
  sheetButtons: { gap: space.xs },
}));
