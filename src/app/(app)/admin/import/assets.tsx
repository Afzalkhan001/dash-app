// Assets from a sheet — AssetCatalog "Bulk Add Inventory" (dash.html:20239–20313) for the IT Admin.
// The 14-column template; an employee number makes the asset "assigned" to whoever has that number
// on the roster (accounts first, then invitations). Saved one by one (POST /assets), then the file is
// added to Upload history (POST /upload_batches) so it can be downloaded again.
// The website sends no acknowledgement email for bulk-added assets, and neither does this.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { FileSpreadsheet, Package } from 'lucide-react-native';
import { useState } from 'react';

import { api } from '@/api/client';
import { fetchRosterLists, saveAssets, type SimpleResult } from '@/features/excel/api';
import { useExcelAccess } from '@/features/excel/gate';
import { type AssetRow, hasError, parseAssets } from '@/features/excel/parse';
import { TEMPLATES } from '@/features/excel/templates';
import { PickCard, type PreviewItem, PreviewList, ResultCard, SavingBanner, TemplateCard, useSheetPicker } from '@/features/excel/ui';
import { inr, plural } from '@/lib/format';
import { Banner, Button, ConfirmSheet, NavHeader, Screen, SkeletonList, SummaryCard, toast } from '@/ui';

export default function AssetsImport() {
  const router = useRouter();
  const qc = useQueryClient();
  const { gates, ready } = useExcelAccess();
  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SimpleResult | null>(null);

  const picker = useSheetPicker(async (p) => {
    const [lists, assets] = await Promise.all([fetchRosterLists(), api.get<{ serial?: string; assetId?: string }[]>('/assets')]);
    // USERS before WHITELIST, as the website matches the employee number.
    const parsed = parseAssets(p.book, [...lists.users, ...lists.whitelist], Array.isArray(assets) ? assets : [], new Date().toISOString(), Date.now());
    if (!parsed.length) throw new Error('No rows with an asset name were found in the first sheet.');
    setRows(parsed);
    setLeft(new Set());
    setResult(null);
  }, 'assets');

  if (ready && !gates.imports.assets) return <Redirect href="/" />;

  const items: PreviewItem[] = (rows ?? []).map(({ key, line, body: a, issues }) => ({
    key,
    line,
    title: a.name,
    subtitle: [a.assetType || a.category, a.assignedTo || (a.assignedToEmpNo ? `#${a.assignedToEmpNo}` : 'Not assigned')].join(' · '),
    issues,
    skipped: left.has(key),
    status: a.status === 'assigned' ? { label: 'Assigned', tone: 'neutral' } : { label: 'In store', tone: 'done' },
    fields: [
      { label: 'Asset ID', value: a.assetId },
      { label: 'Description', value: a.description },
      { label: 'Location', value: a.location },
      { label: 'Category', value: a.category },
      { label: 'Type', value: a.assetType },
      { label: 'Purchased on', value: a.purchaseDate },
      { label: 'Warranty', value: [a.warrantyStatus, a.warrantyExpiry].filter(Boolean).join(' · ') },
      { label: 'Condition', value: a.condition },
      { label: 'Assigned to', value: a.assignedTo ? `${a.assignedTo} (${a.assignedToEmpNo})` : a.assignedToEmpNo },
      { label: 'Assigned on', value: a.assignmentDate },
      { label: 'Serial number', value: a.serial },
      { label: 'Value', value: inr(a.price) },
    ],
  }));
  const todo = (rows ?? []).filter((r) => !hasError(r.issues) && !left.has(r.key));
  const value = todo.reduce((s, r) => s + (r.body.price || 0), 0);

  const run = async () => {
    setSaving({ done: 0, total: todo.length });
    try {
      const r = await saveAssets(todo, picker.fileName || 'Assets.xlsx', (done, total) => setSaving({ done, total }));
      setResult(r);
      setRows(null);
      picker.reset();
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['itdesk', 'assets'] });
      qc.invalidateQueries({ queryKey: ['people', 'assets'] });
      qc.invalidateQueries({ queryKey: ['excel', 'batches'] });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The upload failed.', 'danger');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen
      header={<NavHeader title="Assets from a sheet" />}
      footer={rows?.length ? <Button title={`Add ${plural(todo.length, 'asset')}`} icon={<Package />} disabled={!todo.length || !!saving} onPress={() => setConfirm(true)} /> : undefined}>
      {!ready ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <Banner tone="info" message="Adds equipment to Assets. A row with an employee number is saved as assigned to that person; leave it blank to keep the asset in store." />
          {result ? (
            <ResultCard
              title="Assets added"
              lines={[`${plural(result.added, 'asset')} added to Assets.`, ...(result.batchSaved === false ? ['The file could not be added to Upload history.'] : [])]}
              failures={result.failures}
              doneLabel="Open Assets"
              onDone={() => router.push('/admin/it-desk/assets')}
            />
          ) : null}
          <TemplateCard template={TEMPLATES.assets} note="Asset name is required. Dates as YYYY-MM-DD; value in rupees." />
          <PickCard fileName={picker.fileName} busy={picker.busy} onPick={picker.pick} onSample={picker.sample} />
          {saving ? <SavingBanner done={saving.done} total={saving.total} noun="assets" /> : null}
          {rows?.length ? (
            <PreviewList
              items={items}
              noun={['asset', 'assets']}
              onToggleSkip={(k) =>
                setLeft((s) => {
                  const n = new Set(s);
                  if (n.has(k)) n.delete(k);
                  else n.add(k);
                  return n;
                })
              }
            />
          ) : null}
        </>
      )}
      <ConfirmSheet
        visible={confirm}
        onClose={() => (saving ? undefined : setConfirm(false))}
        title="Add assets"
        from={{ title: picker.fileName || 'Your sheet', subtitle: plural(todo.length, 'row'), icon: FileSpreadsheet, module: 'support' }}
        to={{ title: 'Assets', subtitle: 'Asset register', icon: Package, module: 'support' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to add assets"
        loading={!!saving}
        onConfirm={run}
        note="No one is messaged. Send an acknowledgement link from the asset later if you need one.">
        <SummaryCard
          rows={[
            { label: 'Assets to add', value: todo.length },
            { label: 'Assigned to someone', value: todo.filter((r) => r.body.status === 'assigned').length },
            { label: 'In store', value: todo.filter((r) => r.body.status === 'available').length },
            { label: 'Left out', value: (rows ?? []).length - todo.length },
          ]}
          total={{ label: 'Total value', value: inr(value) }}
        />
      </ConfirmSheet>
    </Screen>
  );
}
