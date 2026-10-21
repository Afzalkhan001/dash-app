// Clients from a sheet — ClientsView "Bulk Upload CSV" (dash.html:23373–23389) for anyone on Clients.
// Columns name, channelName, email, phone (any order, any case). Each client is added as yours
// (managerId / managerName = you), the same as the website; you see only the clients you added.
// The phone also reads .xlsx, not only .csv.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Briefcase, FileSpreadsheet } from 'lucide-react-native';
import { useState } from 'react';

import { api } from '@/api/client';
import { saveClients, type SimpleResult } from '@/features/excel/api';
import { useExcelAccess } from '@/features/excel/gate';
import { type ClientRow, hasError, parseClients } from '@/features/excel/parse';
import { TEMPLATES } from '@/features/excel/templates';
import { PickCard, type PreviewItem, PreviewList, ResultCard, SavingBanner, TemplateCard, useSheetPicker } from '@/features/excel/ui';
import { isMyClient } from '@/features/work/access';
import { plural } from '@/lib/format';
import { Banner, Button, ConfirmSheet, NavHeader, Screen, SkeletonList, SummaryCard, toast } from '@/ui';

export default function ClientsImport() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, gates, ready } = useExcelAccess();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SimpleResult | null>(null);

  const picker = useSheetPicker(async (p) => {
    const all = await api.get<{ name?: string; managerId?: string; managerName?: string }[]>('/clients');
    const mine = (Array.isArray(all) ? all : []).filter((c) => (user ? isMyClient(c, { id: user.id, name: user.name }) : false));
    const parsed = parseClients(p.book, mine);
    if (!parsed.length) throw new Error('No rows with a name were found. The first row must be the headers (name, channelName, email, phone).');
    setRows(parsed);
    setLeft(new Set());
    setResult(null);
  }, 'clients');

  if (ready && !gates.imports.clients) return <Redirect href="/" />;

  const items: PreviewItem[] = (rows ?? []).map((c) => ({
    key: c.key,
    line: c.line,
    title: c.name,
    subtitle: c.channelName || c.email || c.phone || undefined,
    issues: c.issues,
    skipped: left.has(c.key),
    fields: [
      { label: 'Name', value: c.name },
      { label: 'Channel', value: c.channelName },
      { label: 'Email', value: c.email },
      { label: 'Phone', value: c.phone },
    ],
  }));
  const todo = (rows ?? []).filter((c) => !hasError(c.issues) && !left.has(c.key));

  const run = async () => {
    if (!user) return;
    setSaving({ done: 0, total: todo.length });
    try {
      const r = await saveClients(todo, { id: user.id, name: user.name ?? '' }, (done, total) => setSaving({ done, total }));
      setResult(r);
      setRows(null);
      picker.reset();
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['work', 'clients'] });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The upload failed.', 'danger');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen
      header={<NavHeader title="Clients from a sheet" />}
      footer={rows?.length ? <Button title={`Add ${plural(todo.length, 'client')}`} icon={<Briefcase />} disabled={!todo.length || !!saving} onPress={() => setConfirm(true)} /> : undefined}>
      {!ready ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <Banner tone="info" message="Clients are added as yours. You see and book for the clients you added." />
          {result ? (
            <ResultCard title="Clients added" lines={[`${plural(result.added, 'client')} added.`]} failures={result.failures} doneLabel="Open Clients" onDone={() => router.push('/admin/work/clients')} />
          ) : null}
          <TemplateCard template={TEMPLATES.clients} note="One client per row. Only the name is required." />
          <PickCard fileName={picker.fileName} busy={picker.busy} onPick={picker.pick} onSample={picker.sample} />
          {saving ? <SavingBanner done={saving.done} total={saving.total} noun="clients" /> : null}
          {rows?.length ? (
            <PreviewList
              items={items}
              noun={['client', 'clients']}
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
        title="Add clients"
        from={{ title: picker.fileName || 'Your sheet', subtitle: plural(todo.length, 'row'), icon: FileSpreadsheet, module: 'tasks' }}
        to={{ title: 'Your clients', subtitle: user?.name ?? '', icon: Briefcase, module: 'tasks' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to add clients"
        loading={!!saving}
        onConfirm={run}
        note="No one is messaged. The clients are not contacted.">
        <SummaryCard
          rows={[
            { label: 'Clients to add', value: todo.length },
            { label: 'Left out', value: (rows ?? []).length - todo.length },
          ]}
        />
      </ConfirmSheet>
    </Screen>
  );
}
