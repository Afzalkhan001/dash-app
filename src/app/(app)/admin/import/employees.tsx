// Employees from a sheet — the website's "Bulk Upload & Update" (dash.html:5998–6557) for Super Admin,
// HR, IT Admin and Admin on the Roster.
//   Add new     The Keka template. Rows already on the roster (by employee ID, else email) are
//               updated: a filled cell fills in or replaces, a blank never clears. New people are added
//               as invitations ("Not signed up") and DASH emails each of them a welcome.
//               Departments the sheet names that don't exist yet are created first.
//   Update      Matched by employee ID only; only the filled cells change; never adds anyone.
// The roster is re-read when the file is checked and again just before saving (the website does both).

import { Redirect, useRouter } from 'expo-router';
import { FileSpreadsheet, Users } from 'lucide-react-native';
import { useState } from 'react';

import { applyUpdates, type EmpResult, fetchRosterLists, saveEmployees, type UpdResult } from '@/features/excel/api';
import { useExcelAccess } from '@/features/excel/gate';
import { type EmpRow, hasError, newDepartmentNames, parseEmployees, parseUpdates, type UpdRow, updFieldLabel } from '@/features/excel/parse';
import { TEMPLATES } from '@/features/excel/templates';
import { PickCard, type PreviewItem, PreviewList, ResultCard, SavingBanner, TemplateCard, useSheetPicker } from '@/features/excel/ui';
import { useInvalidatePeople } from '@/api/people';
import { plural } from '@/lib/format';
import { Banner, Button, ConfirmSheet, NavHeader, Screen, Segmented, SkeletonList, SummaryCard, toast } from '@/ui';

type Tab = 'add' | 'update';

export default function EmployeesImport() {
  const router = useRouter();
  const { user, gates, ready } = useExcelAccess();
  const invalidate = useInvalidatePeople();
  const [tab, setTab] = useState<Tab>('add');

  const [rows, setRows] = useState<EmpRow[] | null>(null);
  const [upd, setUpd] = useState<UpdRow[] | null>(null);
  const [newDepts, setNewDepts] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ kind: Tab; add?: EmpResult; upd?: UpdResult } | null>(null);

  const addPicker = useSheetPicker(async (p) => {
    const lists = await fetchRosterLists();
    const parsed = parseEmployees(p.book, lists.departments, lists.users, lists.whitelist);
    if (!parsed.length) throw new Error('No rows with a name and a work email were found in the first sheet.');
    setRows(parsed);
    setNewDepts(newDepartmentNames(parsed, lists.departments));
    setResult(null);
  }, 'employees');
  const updPicker = useSheetPicker(async (p) => {
    const lists = await fetchRosterLists();
    const parsed = parseUpdates(p.book, lists.departments, lists.users, lists.whitelist);
    if (!parsed.length) throw new Error('No rows with an employee ID were found in the first sheet.');
    setUpd(parsed);
    setResult(null);
  }, 'updates');

  if (ready && !gates.imports.employees) return <Redirect href="/" />;

  const toggle = (key: string) =>
    setRows((rs) => (rs ?? []).map((r) => (r.key !== key || hasError(r.issues) ? r : { ...r, action: r.action === 'skip' ? (r.match ? 'update' : 'create') : 'skip' })));

  const addItems: PreviewItem[] = (rows ?? []).map((r) => ({
    key: r.key,
    line: r.line,
    title: r.name,
    subtitle: [r.employeeNumber || 'No ID', r.deptName || 'No department'].join(' · '),
    issues: r.match ? [{ level: 'info', text: `Already on the roster as ${r.match.name || 'this person'} (matched by ${r.match.by === 'email' ? 'email' : 'employee ID'}${r.match.source === 'whitelist' ? ', not signed up yet' : ''}). Filled cells update them.` }, ...r.issues] : r.issues,
    status: r.action === 'skip' ? undefined : r.match ? { label: 'Update', tone: 'neutral' } : { label: 'New', tone: 'done' },
    skipped: r.action === 'skip',
    fields: [
      { label: 'Employee ID', value: r.employeeNumber },
      { label: 'Work email', value: r.email },
      { label: 'Gender', value: r.gender },
      { label: 'Mobile', value: r.mobile },
      { label: 'Location', value: r.location },
      { label: 'Department', value: r.deptName },
      { label: 'Job title', value: r.jobTitle },
      { label: 'Reporting manager', value: r.reportingManager },
      { label: 'Date joined', value: r.dateJoined },
      { label: 'Date of birth', value: r.dob },
      { label: 'Blood group', value: r.bloodGroup },
    ],
  }));
  const updItems: PreviewItem[] = (upd ?? []).map((r) => ({
    key: r.key,
    line: r.line,
    title: r.matchedName || r.name || r.empNo,
    subtitle: `${r.empNo} · ${plural(Object.keys(r.patch).length, 'change')}`,
    issues: r.issues,
    status: hasError(r.issues) ? undefined : { label: 'Update', tone: 'neutral' },
    fields: [{ label: 'Employee ID', value: r.empNo }, ...Object.entries(r.patch).map(([k, v]) => ({ label: updFieldLabel(k), value: v }))],
  }));

  const creating = (rows ?? []).filter((r) => r.action === 'create').length;
  const updating = (rows ?? []).filter((r) => r.action === 'update').length;
  const leftOut = (rows ?? []).length - creating - updating;
  const updReady = (upd ?? []).filter((r) => !hasError(r.issues));

  const run = async () => {
    setSaving({ done: 0, total: tab === 'add' ? creating + updating : updReady.length });
    try {
      if (tab === 'add') {
        const r = await saveEmployees(rows ?? [], addPicker.fileName || 'Employees.xlsx', user?.tenantId ?? null, (done, total) => setSaving({ done, total }));
        setResult({ kind: 'add', add: r });
        setRows(null);
        addPicker.reset();
      } else {
        const r = await applyUpdates(updReady, (done, total) => setSaving({ done, total }));
        setResult({ kind: 'update', upd: r });
        setUpd(null);
        updPicker.reset();
      }
      setConfirm(false);
      invalidate();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'The upload failed. Nothing more was saved.', 'danger');
    } finally {
      setSaving(null);
    }
  };

  const hasRows = tab === 'add' ? !!rows?.length : !!upd?.length;
  const canSave = tab === 'add' ? creating + updating > 0 : updReady.length > 0;
  const picker = tab === 'add' ? addPicker : updPicker;

  return (
    <Screen
      header={<NavHeader title="Employees from a sheet" />}
      footer={
        hasRows && !result ? (
          <Button
            title={tab === 'add' ? `Save ${plural(creating + updating, 'employee')}` : `Update ${plural(updReady.length, 'employee')}`}
            icon={<Users />}
            disabled={!canSave || !!saving}
            onPress={() => setConfirm(true)}
          />
        ) : undefined
      }>
      {!ready ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <Segmented
            options={[
              { key: 'add', label: 'Add new' },
              { key: 'update', label: 'Update' },
            ]}
            value={tab}
            onChange={(k) => {
              setTab(k as Tab);
              setResult(null);
            }}
          />
          <Banner
            tone="info"
            message={
              tab === 'add'
                ? 'Adds new employees and, for anyone already on the roster, fills in what the sheet has. A blank cell never clears a field.'
                : 'Changes people already on the roster, matched by employee ID. Leave a cell blank to keep that field as it is. Nobody is added.'
            }
          />
          {result?.kind === 'add' && result.add ? (
            <ResultCard
              title="Employees saved"
              lines={[
                `${plural(result.add.added, 'new employee')} added. They show as “Not signed up” until they sign in.`,
                `${plural(result.add.updated, 'employee')} already on the roster updated.`,
                ...(result.add.skipped ? [`${plural(result.add.skipped, 'row')} left out.`] : []),
                ...(result.add.departments.length ? [`New departments: ${result.add.departments.join(', ')}.`] : []),
                ...(result.add.batchSaved ? [] : ['The upload could not be added to Upload history.']),
              ]}
              failures={result.add.failures}
              doneLabel="Open the roster"
              onDone={() => router.push('/admin/people')}
            />
          ) : null}
          {result?.kind === 'update' && result.upd ? (
            <ResultCard
              title="Roster updated"
              lines={[
                `${plural(result.upd.matched, 'employee')} updated.`,
                ...(result.upd.skipped ? [`${plural(result.upd.skipped, 'row')} skipped (nothing to change or not found).`] : []),
                ...(result.upd.notFound.length ? [`Not on the roster: ${result.upd.notFound.join(', ')}.`] : []),
              ]}
              failures={result.upd.failures}
            />
          ) : null}
          <TemplateCard
            template={tab === 'add' ? TEMPLATES.employees : TEMPLATES.updates}
            note={tab === 'add' ? 'Keka-compatible: one row per person. Name and work email are required.' : 'Employee ID is required. The name is only there so you can tell rows apart; it is never saved.'}
          />
          <PickCard fileName={picker.fileName} busy={picker.busy} onPick={picker.pick} onSample={picker.sample} />
          {saving ? <SavingBanner done={saving.done} total={saving.total} noun="employees" /> : null}
          {tab === 'add' && rows?.length ? (
            <>
              {newDepts.length ? <Banner tone="warning" title={`${plural(newDepts.length, 'new department')} will be created`} message={newDepts.join(', ')} /> : null}
              <PreviewList items={addItems} noun={['employee', 'employees']} onToggleSkip={toggle} />
            </>
          ) : null}
          {tab === 'update' && upd?.length ? <PreviewList items={updItems} noun={['employee', 'employees']} /> : null}
        </>
      )}
      <ConfirmSheet
        visible={confirm}
        onClose={() => (saving ? undefined : setConfirm(false))}
        title={tab === 'add' ? 'Save employees' : 'Update employees'}
        from={{ title: picker.fileName || 'Your sheet', subtitle: tab === 'add' ? plural(creating + updating, 'row') : plural(updReady.length, 'row'), icon: FileSpreadsheet, module: 'people' }}
        to={{ title: 'Employee roster', subtitle: 'Everyone sees the changes', icon: Users, module: 'people' }}
        detailsTitle="What happens"
        confirmLabel={tab === 'add' ? 'Swipe to save' : 'Swipe to update'}
        loading={!!saving}
        onConfirm={run}
        note={
          tab === 'add'
            ? creating
              ? `DASH emails a welcome to each of the ${plural(creating, 'new employee')}, and sends a WhatsApp welcome to those with a mobile number. People already on the roster are not messaged.`
              : 'No one is messaged: everyone in the sheet is already on the roster.'
            : 'No one is messaged.'
        }>
        {tab === 'add' ? (
          <SummaryCard
            rows={[
              { label: 'New employees', value: creating },
              { label: 'Already on the roster', value: updating, hint: 'Filled cells update them' },
              { label: 'Left out', value: leftOut },
              { label: 'New departments', value: newDepts.length ? newDepts.join(', ') : 'None' },
            ]}
          />
        ) : (
          <SummaryCard
            rows={[
              { label: 'Employees to update', value: updReady.length },
              { label: 'Left out', value: (upd ?? []).length - updReady.length },
            ]}
          />
        )}
      </ConfirmSheet>
    </Screen>
  );
}
