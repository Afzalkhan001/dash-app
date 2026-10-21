// Projects (Keka codes) from a sheet — ProjectsView "Bulk Upload" (dash.html:22660–22720) for Super
// Admin and Config project creators. Metadata 1–3 make the Keka code when the sheet has none; the name
// is Metadata 3. Every row becomes an active project (POST /projects, 10 at a time). Codes are never
// deleted from the app, so the preview warns about a code that is already in the list.

import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { FileSpreadsheet, FolderKanban } from 'lucide-react-native';
import { useState } from 'react';

import { api } from '@/api/client';
import { fetchRosterLists, type SimpleResult, saveProjects } from '@/features/excel/api';
import { useExcelAccess } from '@/features/excel/gate';
import { hasError, parseProjects, type ProjRow } from '@/features/excel/parse';
import { TEMPLATES } from '@/features/excel/templates';
import { PickCard, type PreviewItem, PreviewList, ResultCard, SavingBanner, TemplateCard, useSheetPicker } from '@/features/excel/ui';
import { useTodayIst } from '@/features/attendance/use-now';
import { plural } from '@/lib/format';
import { Banner, Button, ConfirmSheet, NavHeader, Screen, SkeletonList, SummaryCard, toast } from '@/ui';

export default function ProjectsImport() {
  const router = useRouter();
  const qc = useQueryClient();
  const today = useTodayIst();
  const { gates, ready } = useExcelAccess();
  const [rows, setRows] = useState<ProjRow[] | null>(null);
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SimpleResult | null>(null);

  const picker = useSheetPicker(async (p) => {
    const [lists, projects] = await Promise.all([fetchRosterLists(), api.get<{ kekaCode?: string; name?: string }[]>('/projects')]);
    const parsed = parseProjects(p.book, Array.isArray(projects) ? projects : [], [...lists.users, ...lists.whitelist]);
    if (!parsed.length) throw new Error('No rows with Metadata 1, 2 or 3 were found in the first sheet.');
    setRows(parsed);
    setLeft(new Set());
    setResult(null);
  }, 'projects');

  if (ready && !gates.imports.projects) return <Redirect href="/" />;

  const items: PreviewItem[] = (rows ?? []).map((p) => ({
    key: p.key,
    line: p.line,
    title: p.name,
    subtitle: p.kekaCode,
    issues: p.issues,
    skipped: left.has(p.key),
    fields: [
      { label: 'Project name', value: p.name },
      { label: 'Metadata 1', value: p.meta1 },
      { label: 'Metadata 2', value: p.meta2 },
      { label: 'Metadata 3', value: p.meta3 },
      { label: 'Keka code', value: p.kekaCode },
      { label: 'Cost code owner', value: p.costCodeOwner },
      { label: 'Employee number', value: p.empNo },
      { label: 'Date', value: p.date },
      { label: 'Status', value: 'Active' },
    ],
  }));
  const todo = (rows ?? []).filter((p) => !hasError(p.issues) && !left.has(p.key));

  const run = async () => {
    setSaving({ done: 0, total: todo.length });
    try {
      const r = await saveProjects(todo, today, (done, total) => setSaving({ done, total }));
      setResult(r);
      setRows(null);
      picker.reset();
      setConfirm(false);
      // Project lists are cached by many screens (work, claims, petty cash, attendance): refresh them all.
      qc.invalidateQueries();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The upload failed.', 'danger');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen
      header={<NavHeader title="Projects from a sheet" />}
      footer={rows?.length ? <Button title={`Add ${plural(todo.length, 'project')}`} icon={<FolderKanban />} disabled={!todo.length || !!saving} onPress={() => setConfirm(true)} /> : undefined}>
      {!ready ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <Banner tone="info" message="Adds Keka codes as active projects. A code is never deleted from DASH; turn one off from Projects when it is finished." />
          {result ? (
            <ResultCard
              title="Projects added"
              lines={[`${plural(result.added, 'project')} added to Projects.`]}
              failures={result.failures}
              doneLabel="Open Projects"
              onDone={() => router.push('/admin/work/projects')}
            />
          ) : null}
          <TemplateCard template={TEMPLATES.projects} note="Metadata 1, 2 and 3 make the Keka code (joined with _) when the Keka Code cell is empty. The project is named after Metadata 3." />
          <PickCard fileName={picker.fileName} busy={picker.busy} onPick={picker.pick} onSample={picker.sample} />
          {saving ? <SavingBanner done={saving.done} total={saving.total} noun="projects" /> : null}
          {rows?.length ? (
            <PreviewList
              items={items}
              noun={['project', 'projects']}
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
        title="Add projects"
        from={{ title: picker.fileName || 'Your sheet', subtitle: plural(todo.length, 'row'), icon: FileSpreadsheet, module: 'tasks' }}
        to={{ title: 'Projects', subtitle: 'Offered for new work at once', icon: FolderKanban, module: 'tasks' }}
        detailsTitle="What happens"
        confirmLabel="Swipe to add projects"
        loading={!!saving}
        onConfirm={run}
        note="No one is messaged. Cost code owners see their codes in Projects.">
        <SummaryCard
          rows={[
            { label: 'Projects to add', value: todo.length },
            { label: 'With a warning', value: todo.filter((p) => p.issues.some((i) => i.level === 'warning')).length },
            { label: 'Left out', value: (rows ?? []).length - todo.length },
          ]}
        />
      </ConfirmSheet>
    </Screen>
  );
}
