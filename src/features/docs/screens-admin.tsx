// Admin reports: the bounty coins report, the user activity audit and one asset's report.

import { Redirect } from 'expo-router';
import { Coins, FileSearch, Laptop } from 'lucide-react-native';
import { useState } from 'react';

import { type LedgerTxn, useLedger } from '@/api/bountyadmin';
import { type AuditRow, exportAudit } from '@/api/company';
import { useAssets } from '@/api/itdesk';
import { useTodayIst } from '@/features/attendance/use-now';
import { LEDGER_TYPES, ledgerFrom, ledgerTypeLabel, roleLabel } from '@/features/bountyadmin/logic';
import { canAssetPdf, canAuditPdf, canBountyPdf } from '@/features/docs/access';
import { DocScreen } from '@/features/docs/doc-screen';
import { assetDoc, auditDoc, bountyDoc, bountySummary, pdfDate } from '@/features/docs/templates';
import { plural } from '@/lib/format';
import { letterheadOf } from '@/lib/pdf';
import { useAccess } from '@/lib/use-access';
import { Button, DateField, FieldMessage, FieldPair, SelectField } from '@/ui';

// ── Bounty coins report ──────────────────────────────────────────────────────
export function BountyPdfScreen() {
  const access = useAccess();
  const today = useTodayIst();
  const allowed = canBountyPdf(access);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('');
  const q = useLedger({ dateFrom: from || undefined, dateTo: to || undefined, type: type || undefined }, allowed);
  if (!allowed) return <Redirect href="/" />;

  const txns: LedgerTxn[] = q.data ?? [];
  const x = bountySummary(txns);
  const range = from || to ? `${from ? pdfDate(from) : 'Start'} – ${to ? pdfDate(to) : 'today'}` : '';
  const doc = q.data ? bountyDoc({ txns, typeLabel: ledgerTypeLabel, fromLabel: ledgerFrom, letterhead: letterheadOf(access.tenant), today, range, by: access.user?.name }) : null;
  return (
    <DocScreen
      title="Bounty report"
      icon={Coins}
      module="bounty"
      heroLabel="Transactions in the report"
      value={q.data ? txns.length : undefined}
      unit={txns.length === 1 ? 'transaction' : 'transactions'}
      sub={q.data ? `Coins added ${Number(x.added).toLocaleString('en-IN')} · Given ${Number(x.distributed).toLocaleString('en-IN')} · Rewards ${Number(x.rewards).toLocaleString('en-IN')}` : undefined}
      loading={q.isPending}
      error={q.isError && !q.data ? q.error?.message || 'Couldn’t load the ledger.' : null}
      onRetry={() => void q.refetch()}
      onRefresh={() => q.refetch()}
      controls={
        <>
          <FieldPair>
            <DateField label="From" value={from} onChange={setFrom} maximumDate={today} placeholder="Any date" />
            <DateField label="To" value={to} onChange={setTo} maximumDate={today} placeholder="Any date" />
          </FieldPair>
          <SelectField label="Type" value={type} options={[{ value: '', label: 'Every type' }, ...LEDGER_TYPES]} onChange={setType} />
        </>
      }
      doc={doc}
    />
  );
}

// ── User activity audit ──────────────────────────────────────────────────────
export function AuditPdfScreen() {
  const access = useAccess();
  const today = useTodayIst();
  const allowed = canAuditPdf(access);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!allowed) return <Redirect href="/" />;

  const bad = from && to && from > to ? 'The start date must be on or before the end date.' : null;
  // POST /audit_log/export is itself a recorded download (server.js:7380), so it runs only on a tap.
  const load = async () => {
    if (!access.user || bad) return;
    setBusy(true);
    setError(null);
    try {
      setRows(await exportAudit(access.user.id, { dateFrom: from || undefined, dateTo: to || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t get the activities.');
    } finally {
      setBusy(false);
    }
  };
  const doc = rows ? auditDoc({ rows, roleLabel, letterhead: letterheadOf(access.tenant), today, by: access.user?.name }) : null;
  return (
    <DocScreen
      title="Audit report"
      icon={FileSearch}
      module="security"
      heroLabel="User activity audit"
      value={rows ? rows.length : undefined}
      unit={rows?.length === 1 ? 'activity' : 'activities'}
      sub={rows ? `${pdfDate(from) || 'Start'} – ${pdfDate(to) || 'today'}` : 'Pick the dates, then get the report'}
      error={error}
      onRetry={() => void load()}
      empty={!rows ? { title: 'Nothing loaded yet', message: 'Getting the report is recorded in the audit, like a download on the website.' } : rows.length ? null : { title: 'No activity', message: 'Nothing was recorded in these dates.' }}
      controls={
        <>
          <FieldPair>
            <DateField
              label="From"
              value={from}
              onChange={(v) => {
                setFrom(v);
                setRows(null);
              }}
              maximumDate={today}
            />
            <DateField
              label="To"
              value={to}
              onChange={(v) => {
                setTo(v);
                setRows(null);
              }}
              maximumDate={today}
            />
          </FieldPair>
          <FieldMessage error={bad} />
          {!rows ? <Button title="Get the report" loading={busy} disabled={!!bad} onPress={() => void load()} /> : null}
        </>
      }
      note={rows ? `${plural(rows.length, 'activity', 'activities')} · the download is recorded in the audit.` : null}
      doc={doc}
    />
  );
}

// ── One asset ────────────────────────────────────────────────────────────────
export function AssetPdfScreen({ id }: { id?: string }) {
  const access = useAccess();
  const today = useTodayIst();
  const allowed = canAssetPdf(access);
  const q = useAssets(allowed);
  const [pick, setPick] = useState(id || '');
  const [now] = useState(() => new Date());
  if (!allowed) return <Redirect href="/" />;

  const list = Array.isArray(q.data) ? q.data : [];
  const a = list.find((x) => x.id === pick) ?? list[0] ?? null;
  const doc = a ? assetDoc(a, { letterhead: letterheadOf(access.tenant), today, now, by: access.user?.name }) : null;
  return (
    <DocScreen
      title="Asset report"
      icon={Laptop}
      module="support"
      heroLabel={a ? a.name : 'Asset'}
      value={a ? (a.history?.length ?? 0) : undefined}
      unit={(a?.history?.length ?? 0) === 1 ? 'hand-over' : 'hand-overs'}
      sub={a ? [a.serial, a.assignedTo ? `With ${a.assignedTo}` : 'Not assigned'].filter(Boolean).join(' · ') : undefined}
      loading={q.isPending}
      error={q.isError && !q.data ? q.error?.message || 'Couldn’t load the assets.' : null}
      onRetry={() => void q.refetch()}
      onRefresh={() => q.refetch()}
      empty={q.data && !list.length ? { title: 'No assets yet' } : null}
      controls={
        list.length ? (
          <SelectField label="Asset" value={a?.id ?? ''} options={list.map((x) => ({ value: x.id, label: [x.name, x.serial].filter(Boolean).join(' · ') }))} onChange={setPick} />
        ) : null
      }
      doc={doc}
    />
  );
}
