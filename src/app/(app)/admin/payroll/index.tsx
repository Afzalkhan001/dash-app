// Payroll — the hub for Super Admin and HR (the website's HR → Payroll, PayrollAdminPanel dash.html
// :5289; Payroll runs :5145). Tabs become sections, each shown only when its module is on
// (features/payroll/access.ts): the latest run and the list of runs ('payroll'), Salaries and
// Structures ('salary'), Statutory & TDS ('tax').
//
//   GET  /hr/payroll/runs          the runs, newest first
//   POST /hr/payroll/runs          {month} — calculates a draft; it opens straight away
//   GET/PUT /hr/payroll/settings   where loss of pay comes from
//
// Running payroll only calculates a draft (it can be discarded); nothing is paid or shown to anyone
// until it is locked on the run screen. Nobody is messaged by anything here.

import { useRouter } from 'expo-router';
import { Banknote, Calculator, CalendarClock, FileSpreadsheet, Landmark, Layers, Users } from 'lucide-react-native';
import { useState } from 'react';

import { type LopSource, type PayrollRun, usePayrollRunActions, usePayrollRuns, usePayrollSettings } from '@/api/payroll';
import { useTodayIst } from '@/features/attendance/use-now';
import { errorText, GateFallback, monthName, noun, recentMonths, runStatus, usePayrollGate, usePayView } from '@/features/payroll/ui';
import { dateLabel } from '@/lib/dates';
import {
  AccountRow,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  NavHeader,
  Screen,
  SelectField,
  SelectTiles,
  Sheet,
  SummaryHero,
  Text,
  toast,
  useLayout,
} from '@/ui';

const LOP_LABEL: Record<LopSource, { title: string; sub: string }> = {
  unpaid_leave: { title: 'Approved unpaid leave only', sub: 'Days without attendance are still paid' },
  unpaid_leave_and_absence: { title: 'Unpaid leave and days with no attendance', sub: 'A working day with no clock-in is unpaid' },
};

export default function PayrollHub() {
  const router = useRouter();
  const today = useTodayIst();
  const { gates, pending, allowed } = usePayrollGate('any');
  const { money, eye } = usePayView();
  // At 320 dp (or large text) the long month name and the paise don't fit beside the figures.
  const { compact } = useLayout();
  const runs = usePayrollRuns(gates.runs);
  const settings = usePayrollSettings(gates.runs);
  const [runOpen, setRunOpen] = useState(false);
  const [lopOpen, setLopOpen] = useState(false);
  const header = <NavHeader title="Payroll" actions={allowed ? [eye] : undefined} />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const list: PayrollRun[] = Array.isArray(runs.data) ? runs.data : [];
  const latest = list[0] ?? null;
  const drafts = list.filter((r) => r.status === 'draft').length;
  const lop = settings.data?.lopSource;
  const open = (r: PayrollRun) => router.push(`/admin/payroll/runs/${r.id}`);

  return (
    <Screen header={header} onRefresh={() => Promise.all([runs.refetch(), settings.refetch()])}>
      {gates.runs ? (
        <>
          {runs.error && !runs.data ? (
            <Banner tone="danger" title="Couldn’t load payroll runs" message={errorText(runs.error)} action={{ label: 'Retry', onPress: () => void runs.refetch() }} />
          ) : latest ? (
            <SummaryHero
              icon={Banknote}
              module="pay"
              label={`${monthName(latest.month)} · ${runStatus(latest).label}`}
              value={latest.totals?.net ?? 0}
              currency="₹"
              decimals={compact ? 0 : 2}
              hideable
              hidden={money.hidden}
              onHiddenChange={(h) => (h !== money.hidden ? eye.onPress() : undefined)}
              sub={
                latest.totals
                  ? `Net pay · ${latest.totals.employees} ${noun(latest.totals.employees, 'person', 'people')}${latest.totals.warnings ? ` · ${latest.totals.warnings} with warnings` : ''}`
                  : 'Net pay'
              }
              onArrowPress={() => open(latest)}
              arrowLabel={`Open ${monthName(latest.month)}`}
              action={{ title: 'Run payroll', onPress: () => setRunOpen(true) }}
            />
          ) : (
            <SummaryHero
              icon={Banknote}
              module="pay"
              label="Payroll"
              figure={
                <Text variant="title">
                  {runs.isPending ? 'Loading…' : 'No payroll runs yet'}
                </Text>
              }
              sub="Set salaries first, then calculate a month. You can check every line before locking."
              action={{ title: 'Run payroll', onPress: () => setRunOpen(true), disabled: runs.isPending }}
            />
          )}

          <AccountRow
            icon={CalendarClock}
            module="pay"
            title="Loss of pay counts"
            sub={lop ? LOP_LABEL[lop].title : settings.error ? 'Couldn’t load' : 'Loading…'}
            onChange={lop ? () => setLopOpen(true) : undefined}
            actionAccessibilityLabel="Change what counts as loss of pay"
          />

          <ActivityList
            title="Payroll runs"
            loading={runs.isPending}
            empty={runs.error ? 'Couldn’t load the runs.' : 'No payroll runs yet. Set salaries first, then run a month.'}>
            {list.map((r) => {
              const st = runStatus(r);
              const t = r.totals;
              const who =
                r.status === 'locked' && r.locked_at
                  ? `Locked ${dateLabel(r.locked_at, today)}${r.locked_by_name ? ` by ${r.locked_by_name}` : ''}`
                  : `Draft · started by ${r.created_by_name || 'HR'}`;
              return (
                <ActivityRow
                  key={r.id}
                  module="pay"
                  icon={r.status === 'locked' ? Landmark : Calculator}
                  title={monthName(r.month, compact)}
                  subtitle={[t ? `${t.employees} ${noun(t.employees, 'person', 'people')}` : null, who].filter(Boolean).join(' · ')}
                  value={t ? money.inr(t.net, { decimals: false }) : '—'}
                  status={st}
                  chevron
                  onPress={() => open(r)}
                  accessibilityHint="Opens the run"
                />
              );
            })}
          </ActivityList>
          {drafts ? (
            <Text variant="caption" muted align="center">
              {`${drafts} ${noun(drafts, 'draft')} not locked yet. Employees see nothing until a month is locked.`}
            </Text>
          ) : null}
        </>
      ) : null}

      {gates.salaries || gates.statutory ? (
        <ActivityList title="Salaries and tax">
          {gates.salaries ? (
            <ActivityRow
              module="pay"
              icon={Users}
              title="Salaries"
              subtitle="Each person’s salary, revisions and tax profile"
              chevron
              onPress={() => router.push('/admin/payroll/salaries')}
            />
          ) : null}
          {gates.structures ? (
            <ActivityRow
              module="pay"
              icon={Layers}
              title="Salary structures"
              subtitle="How a CTC splits into Basic, HRA and the rest · try a CTC"
              chevron
              onPress={() => router.push('/admin/payroll/structures')}
            />
          ) : null}
          {gates.statutory ? (
            <ActivityRow
              module="pay"
              icon={FileSpreadsheet}
              title="Statutory and TDS"
              subtitle="PF, ESI, professional tax and income tax settings"
              chevron
              onPress={() => router.push('/admin/payroll/statutory')}
            />
          ) : null}
        </ActivityList>
      ) : null}

      <Text variant="caption" muted align="center">
        Nobody is messaged. Employees see a month’s payslip in DASH once it is locked.
      </Text>

      {gates.runs ? (
        <RunSheet
          visible={runOpen}
          onClose={() => setRunOpen(false)}
          thisMonth={today.slice(0, 7)}
          taken={list.map((r) => r.month)}
          onCreated={(r) => {
            setRunOpen(false);
            open(r);
          }}
        />
      ) : null}
      {gates.runs && lop ? <LopSheet key={lop} visible={lopOpen} current={lop} onClose={() => setLopOpen(false)} /> : null}
    </Screen>
  );
}

function RunSheet({ visible, onClose, thisMonth, taken, onCreated }: { visible: boolean; onClose: () => void; thisMonth: string; taken: string[]; onCreated: (r: PayrollRun) => void }) {
  const { create } = usePayrollRunActions();
  const months = recentMonths(thisMonth, 12).filter((m) => !taken.includes(m));
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : (months[0] ?? null);

  const go = async () => {
    if (!month) return;
    setError(null);
    try {
      const r = await create.mutateAsync(month);
      toast.show(`${monthName(month)} calculated. Check it, then lock it.`);
      setPicked(null);
      onCreated(r.run);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={create.isPending ? () => {} : onClose}
      title="Run payroll"
      subtitle="Calculates a draft from salaries, leave, attendance, approved claims and advances"
      footer={
        <>
          {error ? (
            <Banner
              tone="danger"
              title="Couldn’t run payroll"
              message={/statutory/i.test(error) ? `${error} Statutory settings are changed on the DASH website.` : error}
            />
          ) : null}
          <Button title={month ? `Calculate ${monthName(month)}` : 'Every recent month has a run'} onPress={() => void go()} loading={create.isPending} disabled={!month} />
        </>
      }>
      <SelectField
        label="Month"
        value={month}
        onChange={(v) => {
          setPicked(v);
          setError(null);
        }}
        options={months.map((m) => ({ value: m, label: monthName(m) }))}
        placeholder="No month left to run"
        hint={taken.length ? 'Months that already have a run are not listed. Future months can’t be run.' : 'Future months can’t be run.'}
      />
      <Text variant="caption" muted>
        Nothing is paid and nobody sees it until you lock it. A draft can be recalculated or discarded.
      </Text>
    </Sheet>
  );
}

function LopSheet({ visible, current, onClose }: { visible: boolean; current: LopSource; onClose: () => void }) {
  const { setLopSource } = usePayrollRunActions();
  const [value, setValue] = useState<LopSource>(current);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      await setLopSource.mutateAsync(value);
      toast.show('Saved. It applies the next time a draft is calculated.');
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={setLopSource.isPending ? () => {} : onClose}
      title="Loss of pay counts"
      subtitle="Which days are not paid"
      dirty={value !== current}
      footer={
        <>
          {error ? <Banner tone="danger" title="Couldn’t save" message={error} /> : null}
          <Button title="Save" onPress={() => void save()} loading={setLopSource.isPending} disabled={value === current} />
        </>
      }>
      <SelectTiles
        columns={2}
        value={value}
        onChange={setValue}
        accessibilityLabel="Loss of pay counts"
        options={(Object.keys(LOP_LABEL) as LopSource[]).map((k) => ({ value: k, label: k === 'unpaid_leave' ? 'Unpaid leave' : 'Leave + absence', sub: LOP_LABEL[k].sub }))}
      />
      <Text variant="caption" muted>
        {`${LOP_LABEL[value].title}. Locked months don’t change; drafts change when they are recalculated.`}
      </Text>
    </Sheet>
  );
}
