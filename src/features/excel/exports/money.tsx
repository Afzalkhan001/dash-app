// Excel downloads about money:
//   Payroll register   GET /hr/payroll/runs/:id/register.csv (dash.html:5118; hr_payroll.js:512, audited as
//                      an export) turned into an .xlsx. The demo can't download, so it builds the same
//                      columns from the run's lines (GET /hr/payroll/runs/:id), as the server does.
//   Subscriptions      SubscriptionsHub exportSheet (:11597): Subscriptions, Payments <range>, By Department
//   Vendor master      exportVendorMaster (:25802): approved vendors, never bank details
//   Bounty coins       BountyReportsView exportExcel (:13410): Summary + Transactions (Master Admin: top-ups only)

import { useState } from 'react';
import { View } from 'react-native';

import { api, authHeaders, isApiError, isDemoSession } from '@/api/client';
import { type PayrollItem, type PayrollRun, registerCsvPath, usePayrollRuns } from '@/api/payroll';
import { API_URL } from '@/config';
import { useTodayIst } from '@/features/attendance/use-now';
import { useApiList } from '@/features/excel/api';
import type { ExportDef } from '@/features/excel/catalog';
import { ChoiceCard, ExportShell, type Range, RangeCard } from '@/features/excel/export-shell';
import { fyRange, xDate, xStamp } from '@/features/excel/format';
import { useExcelAccess } from '@/features/excel/gate';
import { LEDGER_TYPES } from '@/features/bountyadmin/logic';
import { monthYear } from '@/lib/dates';
import { inr } from '@/lib/format';
import { type Cell, letterheadRows, objectsToRows, readCsvText, sheetMatrix } from '@/lib/xlsx';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ActivityList, ActivityRow, EmptyState, SelectField } from '@/ui';

const R = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

// ── Payroll register ─────────────────────────────────────────────────────────
/** The register exactly as hr_payroll.js builds it (earning and deduction codes as columns). */
function registerFromItems(run: PayrollRun, items: PayrollItem[]): Cell[][] {
  const code = (x: { code: string }, adj: string) => (x.code === 'ADJ' ? adj : x.code);
  const eCodes = [...new Set(items.flatMap((i) => (i.earnings || []).map((e) => code(e, 'ADJ+'))))];
  const dCodes = [...new Set(items.flatMap((i) => (i.deductions || []).map((d) => code(d, 'ADJ-'))))];
  const sum = (arr: { code: string; amount: number }[] | undefined, c: string, adj: string) => (arr || []).filter((x) => code(x, adj) === c).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const head = ['Employee', 'Department', 'Days in month', 'LOP days', 'Payable days', ...eCodes, 'Gross', 'Reimbursements', ...dCodes, 'Total deductions', 'Net pay', 'Status'];
  const rows = [...items]
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    .map((i) => [
      i.employee_name,
      i.department || '',
      i.days_in_month,
      Number(i.lop_days) + Number(i.pre_start_days || 0),
      i.payable_days,
      ...eCodes.map((c) => R(sum(i.earnings, c, 'ADJ+'))),
      R(i.gross),
      R(i.reimbursement_total || 0),
      ...dCodes.map((c) => R(sum(i.deductions, c, 'ADJ-'))),
      R(i.total_deductions),
      R(i.net),
      run.status,
    ]);
  return [head, ...rows];
}

export function PayrollExport({ def }: { def: ExportDef }) {
  const { ready } = useExcelAccess();
  const runs = usePayrollRuns(ready);
  const [runId, setRunId] = useState<string | null>(null);
  const list = runs.data ?? [];
  const run = list.find((r) => r.id === runId) ?? list[0] ?? null;
  return (
    <ExportShell
      def={def}
      ready={ready && !runs.isPending}
      intro="The salary register for one payroll month: days, LOP, every earning and deduction, gross, reimbursements and net pay for each person. Downloading is recorded in the activity audit."
      sensitive="This file holds everyone’s pay. Share it only with the people who process payroll, and delete it from the phone when you are done."
      count={run?.totals?.employees ?? null}
      countNoun={['person', 'people']}
      disabled={!run ? 'There is no payroll run yet.' : false}
      build={async () => {
        if (!run) return null;
        let rows: Cell[][];
        if (isDemoSession()) {
          const r = await api.get<{ run: PayrollRun; items: PayrollItem[] }>(`/hr/payroll/runs/${encodeURIComponent(run.id)}`);
          if (isApiError(r)) throw new Error(r.error);
          rows = registerFromItems(r.run ?? run, Array.isArray(r.items) ? r.items : []);
        } else {
          const res = await fetch(`${API_URL}${registerCsvPath(run.id)}`, { headers: authHeaders() }).catch(() => null);
          if (!res) throw new Error('Cannot reach DASH. Check your internet connection and try again.');
          const text = await res.text();
          if (!res.ok) {
            let msg = `The register could not be downloaded (${res.status}).`;
            try {
              msg = JSON.parse(text).error || msg;
            } catch {}
            throw new Error(msg);
          }
          rows = sheetMatrix(readCsvText(text)) as Cell[][];
        }
        return { fileName: `salary-register-${run.month}`, sheets: [{ name: `Register ${run.month}`, rows, cols: [24, 18, 8, 8, 8] }] };
      }}>
      {list.length ? (
        <ActivityList title="Payroll month">
          {list.slice(0, 24).map((r) => (
            <ActivityRow
              key={r.id}
              title={monthYear(r.month)}
              subtitle={r.totals ? `${r.totals.employees} people · net ${inr(r.totals.net)}` : undefined}
              status={r.id === run?.id ? { label: 'Chosen', tone: 'info' } : { label: r.status === 'locked' ? 'Locked' : 'Draft', tone: r.status === 'locked' ? 'done' : 'pending' }}
              onPress={() => setRunId(r.id)}
              accessibilityHint="Chooses this month"
            />
          ))}
        </ActivityList>
      ) : (
        <EmptyState title="No payroll runs" message="Start a payroll month in Payroll first." />
      )}
    </ExportShell>
  );
}

// ── Subscriptions ────────────────────────────────────────────────────────────
type Sub = Record<string, any>;

export function SubscriptionsExport({ def }: { def: ExportDef }) {
  const { ready, user } = useExcelAccess();
  const today = useTodayIst();
  const uid = encodeURIComponent(user?.id ?? '');
  const [range, setRange] = useState<Range>(() => fyRange(today));
  const [status, setStatus] = useState<'all' | 'active' | 'not_using' | 'cancelled'>('all');
  const [dept, setDept] = useState('');
  const subs = useApiList<Sub>(`/subscriptions?actorId=${uid}`, { enabled: ready, field: 'subscriptions' });
  const visible = (subs.data ?? []).filter((s) => (status === 'all' || s.status === status) && (!dept || s.department === dept));
  const depts = [...new Set((subs.data ?? []).map((s) => String(s.department || '')).filter(Boolean))].sort();
  return (
    <ExportShell
      def={def}
      ready={ready && !subs.isPending}
      intro="Three sheets, as on the website: the subscriptions you choose, every payment in the dates, and spend by department (monthly, yearly, not-used waste and spend in the dates)."
      count={visible.length}
      countNoun={['subscription', 'subscriptions']}
      disabled={subs.isError ? 'Subscriptions could not be loaded.' : false}
      build={async () => {
        const [p, s] = await Promise.all([
          api.get<{ payments?: Sub[] }>(`/subscriptions/payments?actorId=${uid}&from=${range.from}&to=${range.to}`),
          api.get<{ byDepartment?: Sub[] }>(`/subscriptions/summary?actorId=${uid}&from=${range.from}&to=${range.to}`),
        ]);
        if (isApiError(p)) throw new Error(p.error);
        const payments = Array.isArray(p.payments) ? p.payments : [];
        const summary = !isApiError(s) && Array.isArray(s?.byDepartment) ? s.byDepartment : null;
        const sheets = [
          {
            name: 'Subscriptions',
            rows: objectsToRows(
              visible.map((x) => ({
                Name: x.name,
                Department: x.department,
                Plan: x.plan,
                Period: x.periodLabel,
                Status: x.statusLabel,
                'Amount (INR)': x.amountInr,
                'Amount (USD)': x.amountUsd,
                'Per Month (INR)': x.monthlyInr,
                'Per Year (INR)': x.yearlyInr,
                'Renewal Date': x.renewalDate,
                'Keka Code': x.kekaCode,
                'Account Email': x.accountEmail,
                Payee: x.payee,
                'Payment Mode': x.paymentMode,
                Owner: x.owner,
                Comments: x.comments,
              })),
            ),
          },
          {
            name: `Payments ${range.from} to ${range.to}`,
            rows: objectsToRows(
              payments.map((x) => ({ Date: x.paidOn, Software: x.name, Department: x.department, Plan: x.plan, 'Amount (INR)': x.amountInr, 'Amount (USD)': x.amountUsd, 'Keka Code': x.kekaCode, Comments: x.comments })),
              ['Date', 'Software', 'Department', 'Plan', 'Amount (INR)', 'Amount (USD)', 'Keka Code', 'Comments'],
            ),
          },
          ...(summary
            ? [
                {
                  name: 'By Department',
                  rows: objectsToRows(
                    summary.map((d) => ({
                      Department: d.department,
                      Active: d.activeCount,
                      'Not Using': d.notUsingCount,
                      'Per Month (INR)': d.monthlyInr,
                      'Per Year (INR)': d.yearlyInr,
                      'Not-Using Waste / Month (INR)': d.wastedMonthlyInr,
                      [`Spent ${range.from} to ${range.to} (INR)`]: d.spendInRangeInr,
                    })),
                  ),
                },
              ]
            : []),
        ];
        return { fileName: `DASH_Subscriptions_${today}`, sheets };
      }}>
      <ChoiceCard
        title="Which subscriptions"
        value={status}
        onChange={setStatus}
        options={[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'not_using', label: 'Not using' },
          { key: 'cancelled', label: 'Cancelled' },
        ]}
      />
      {depts.length ? (
        <View style={styles.pad}>
          <SelectField label="Department" value={dept} onChange={setDept} options={[{ value: '', label: 'Every department' }, ...depts.map((d) => ({ value: d, label: d }))]} />
        </View>
      ) : null}
      <RangeCard title="Payment dates" value={range} onChange={setRange} today={today} presets={['fy', 'month', 'last', '30']} />
    </ExportShell>
  );
}

// ── Vendor master ────────────────────────────────────────────────────────────
const PAN_AADHAAR_LABEL: Record<string, string> = { linked: 'Linked', not_linked: 'Not linked', not_applicable: 'Not applicable', unchecked: 'Not checked' };

export function VendorsExport({ def }: { def: ExportDef }) {
  const { ready, access } = useExcelAccess();
  const today = useTodayIst();
  const [gst, setGst] = useState<'all' | 'registered' | 'not_registered'>('all');
  const [aadhaar, setAadhaar] = useState<'all' | 'linked' | 'not_linked'>('all');
  const qs = `status=approved${gst !== 'all' ? `&gst=${gst}` : ''}${aadhaar !== 'all' ? `&aadhaar=${aadhaar}` : ''}`;
  const vendors = useApiList<Sub>(`/accounts/vendors?${qs}`, { enabled: ready, field: 'vendors' });
  const rows = vendors.data ?? [];
  const filterText = [gst !== 'all' ? (gst === 'registered' ? 'GST active' : 'GST inactive') : '', aadhaar !== 'all' ? (aadhaar === 'linked' ? 'PAN linked' : 'PAN not linked') : ''].filter(Boolean).join(', ');
  return (
    <ExportShell
      def={def}
      ready={ready && !vendors.isPending}
      intro="Approved vendors: vendor ID, legal and trade name, contact, email, Tamada contact, PAN and its Aadhaar link, GST, MSME and approval date. Bank details are never included."
      count={rows.length}
      countNoun={['vendor', 'vendors']}
      disabled={!rows.length ? 'No approved vendor matches.' : false}
      build={() => {
        const head = ['Vendor ID', 'Vendor', 'Trade Name', 'Contact Person', 'Contact Number', 'Email', 'Tamada POC', 'PAN', 'Aadhaar PAN', 'GST', 'GSTIN', 'MSME', 'Approved On'];
        const body = rows.map((v) => [
          v.vendorCode || '',
          v.legalEntityName || '',
          v.tradeName && v.tradeName !== v.legalEntityName ? v.tradeName : '',
          v.contactPerson || '',
          v.contactNumber || '',
          v.email || '',
          v.pocEmail || '',
          v.pan || '',
          PAN_AADHAAR_LABEL[v.panAadhaar] || '',
          v.gstStatus === 'registered' ? 'Active' : v.gstStatus === 'not_registered' ? 'Inactive' : '—',
          v.gstStatus === 'registered' ? v.gstin || '' : '',
          v.msmeRegistered ? 'Yes' : 'No',
          v.approvedAt ? xDate(v.approvedAt) : '',
        ]);
        const sub = `Generated: ${xStamp(new Date().toISOString())}   ·   ${rows.length} vendor${rows.length === 1 ? '' : 's'}${filterText ? `   ·   Filter: ${filterText}` : ''}`;
        const cols = head.map((h, i) => Math.min(40, Math.max(h.length + 2, ...body.map((r) => String(r[i] || '').length + 2))));
        return { fileName: `Vendor_Master_${today}`, sheets: [{ name: 'Vendor Master', rows: [...letterheadRows(access.tenant, 'Vendor Master', sub), head, ...body], cols }] };
      }}>
      <ChoiceCard
        title="GST"
        value={gst}
        onChange={setGst}
        options={[
          { key: 'all', label: 'All' },
          { key: 'registered', label: 'GST active' },
          { key: 'not_registered', label: 'GST inactive' },
        ]}
      />
      <ChoiceCard
        title="PAN – Aadhaar link"
        value={aadhaar}
        onChange={setAadhaar}
        options={[
          { key: 'all', label: 'All' },
          { key: 'linked', label: 'Linked' },
          { key: 'not_linked', label: 'Not linked' },
        ]}
      />
    </ExportShell>
  );
}

// ── Bounty coins ─────────────────────────────────────────────────────────────
type Txn = { id: string; createdAt?: string; type: string; amount: number; fromWalletId?: string; fromWalletName?: string; toWalletId?: string; toWalletName?: string; taskId?: string; taskName?: string; balanceAfter?: number; performedBy?: string; approvedBy?: string; reason?: string };

export function BountyExport({ def }: { def: ExportDef }) {
  const { ready, user, access } = useExcelAccess();
  const today = useTodayIst();
  const isMaster = user?.role === 'master_admin';
  const [range, setRange] = useState<Range>({ from: '', to: '' });
  const [type, setType] = useState('');
  const params = new URLSearchParams();
  if (range.from) params.set('dateFrom', range.from);
  if (range.to) params.set('dateTo', range.to);
  if (isMaster) params.set('type', 'COMPANY_CREDIT');
  else if (type) params.set('type', type);
  if (user?.tenantId) params.set('tenantId', user.tenantId);
  const txns = useApiList<Txn>(`/bounty_transactions?${params.toString()}`, { enabled: ready });
  const list = [...(txns.data ?? [])].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return (
    <ExportShell
      def={def}
      ready={ready && !txns.isPending}
      intro={isMaster ? 'Coins added to companies (top-ups) with totals, one row per credit.' : 'A summary (coins added, distributed, reserved, released and rewards paid) and every coin transaction in the dates.'}
      count={list.length}
      countNoun={['transaction', 'transactions']}
      build={() => {
        const sumOf = (t: string) => list.filter((x) => x.type === t).reduce((n, x) => n + (Number(x.amount) || 0), 0);
        const summary: Cell[][] = [
          ...letterheadRows(access.tenant, 'Bounty Coins Report', `Generated: ${xStamp(new Date().toISOString())}`),
          ['Total Coins Added', sumOf('COMPANY_CREDIT')],
          ['Total Distributed', sumOf('COIN_DISTRIBUTION')],
          ['Total Reserved', sumOf('BOUNTY_RESERVE')],
          ['Total Released', sumOf('BOUNTY_RELEASE')],
          ['Total Rewards Paid', sumOf('BOUNTY_REWARD_TRANSFER')],
        ];
        const head = ['Transaction ID', 'Date & Time', 'Type', 'From', 'To', 'Task ID', 'Task Name', 'Credit', 'Debit', 'Balance', 'Performed By', 'Approved By', 'Notes'];
        const rows = list.map((t) => [
          t.id,
          xStamp(t.createdAt),
          String(t.type || '').replace(/_/g, ' '),
          t.fromWalletName || (t.type === 'COMPANY_CREDIT' ? t.performedBy : '') || '—',
          t.toWalletName || '',
          t.taskId || '',
          t.taskName || '',
          t.toWalletId ? t.amount : '',
          t.fromWalletId && t.type !== 'BOUNTY_REWARD_TRANSFER' ? t.amount : '',
          t.balanceAfter ?? '',
          t.performedBy || '',
          t.approvedBy || '',
          t.reason || '',
        ]);
        return {
          fileName: `Bounty_Report_${today}`,
          sheets: [
            { name: 'Summary', rows: summary, cols: [24, 14] },
            { name: 'Transactions', rows: [head, ...rows], cols: [22, 20, 20, 20, 20, 14, 24, 8, 8, 9, 18, 18, 30] },
          ],
        };
      }}>
      <RangeCard value={range} onChange={setRange} today={today} presets={['all', 'month', 'last', 'fy']} />
      {!isMaster ? (
        <View style={styles.pad}>
          <SelectField label="Type" value={type} onChange={setType} options={[{ value: '', label: 'Every type' }, ...LEDGER_TYPES.filter((t) => t.value).map((t) => ({ value: t.value, label: t.label }))]} />
        </View>
      ) : null}
    </ExportShell>
  );
}

const styles = themedStyles(() => ({ pad: { gap: space.sm } }));
