// Petty cash ledger — the website's PettyCashLedger (dash.html:17243), Accounts › Bill Approvals'
// read-only reconciliation: per petty cash request that the requester confirmed as received, how much
// was given, how much bills cover and how much is still to come. Built from data the website's page
// already loads (no extra route):
//   GET /petty_cash_requests, /petty_cash_bills (api/accounts useAccountsPetty)
//   GET /petty_cash_bill_submissions (useAllSubmissions; laid against requests oldest-first, as the web)
//   GET /reimbursements/accounts-all (the "Claims" tab: paid back against a receipt, not petty cash)
// Gate: pettyCashAccountsInBillApprovals (accounts, super_admin) on accounts-bill-review. Rejected bills
// are never counted. Nobody is messaged.
// A row opens its sheet: the figures, each bill with its receipt (GET …/receipt, the web's
// PettyCashReceiptLink) and the request's History (the web's PettyCashHistoryModal); a claim opens
// its bill (ReceiptButton) and history (ReimbursementHistoryModal).

import { BookOpenCheck, ReceiptText, Search } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useAccountsPetty, useAccountsReimbursements, useAllSubmissions } from '@/api/accounts';
import type { Reimbursement } from '@/api/reimbursements';
import { useTodayIst } from '@/features/attendance/use-now';
import { HistoryTimeline } from '@/features/petty-cash/components';
import { historyEvents, pettyCashRef } from '@/features/petty-cash/logic';
import { useReceiptViewer } from '@/features/petty-cash/receipt';
import { reimbursementEvents } from '@/features/reimbursements/format';
import { ReceiptButton } from '@/features/reimbursements/receipt-viewer';
import { Timeline } from '@/features/reimbursements/timeline';
import { GridView } from '@/features/grids/data-grid';
import { GridGateFallback, gridCsvColumns, RowSheet, ShareCsvButton, useGridGate, useZoom } from '@/features/grids/grid-ui';
import {
  buildLedger,
  claimColumns,
  type DatePreset,
  filterClaims,
  filterLedger,
  inRange,
  ledgerColumns,
  ledgerTotals,
  type LedgerRow,
  receivedClaims,
  rupees,
  submissionsAsBills,
} from '@/features/grids/model';
import { dateLabel, istDateOf } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, Card, Chip, ChipRow, DateField, EmptyState, ErrorState, NavHeader, PillField, Screen, SectionHeader, Segmented, SkeletonList, StatGrid, StatTile, SummaryCard, Text } from '@/ui';

type Tab = 'open' | 'done' | 'claims';
const PRESETS: { key: DatePreset; label: string }[] = [
  { key: '', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Pick dates' },
];

export default function PettyLedgerScreen() {
  const today = useTodayIst();
  const { allowed, pending } = useGridGate('ledger');
  const { zoom, actions } = useZoom(0);
  const petty = useAccountsPetty(allowed);
  const subs = useAllSubmissions({}, allowed);
  const claims = useAccountsReimbursements(allowed);
  const [tab, setTab] = useState<Tab>('open');
  const [preset, setPreset] = useState<DatePreset>('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<LedgerRow | null>(null);
  const [openClaim, setOpenClaim] = useState<Reimbursement | null>(null);
  const receipts = useReceiptViewer();
  const header = <NavHeader title="Petty cash ledger" actions={allowed ? actions : undefined} />;
  if (!allowed) return <GridGateFallback pending={pending} header={header} />;

  const requests = petty.data?.requests ?? [];
  const bills = [...(petty.data?.bills ?? []).map((b) => ({ ...b, submission: false as const })), ...submissionsAsBills(requests, Array.isArray(subs.data) ? subs.data : [])];
  const needle = query.trim().toLowerCase();
  const day = (iso: string) => istDateOf(iso);
  const all = filterLedger(buildLedger(requests, bills), needle).filter((L) => inRange(L.r.createdAt, preset, today, day, from, to));
  const openRows = all.filter((L) => !L.complete);
  const doneRows = all.filter((L) => L.complete);
  const claimRows = filterClaims(receivedClaims(Array.isArray(claims.data) ? claims.data : []), needle).filter((m) => inRange(m.created_at, preset, today, day, from, to));
  const newest = (a: LedgerRow, b: LedgerRow) => String(b.r.createdAt ?? '').localeCompare(String(a.r.createdAt ?? ''));
  const rows = (tab === 'done' ? doneRows : openRows).slice().sort(newest);
  const t = ledgerTotals(all);
  const lc = ledgerColumns(today);
  const cc = claimColumns(today);
  const loading = petty.isPending || subs.isPending;
  const error = petty.error ?? subs.error;
  const claimTotal = claimRows.reduce((s, m) => s + (Number(m.amount) || 0), 0);

  const filtered = !!(needle || preset);
  const clearFilters = () => {
    setQuery('');
    setPreset('');
    setFrom('');
    setTo('');
  };

  const top = (
    <>
      <StatGrid columns={2}>
        <StatTile variant="light" label="Money given" value={rupees(t.raised)} caption={`${all.length} ${all.length === 1 ? 'request' : 'requests'}`} module="pettyCash" />
        <StatTile variant="light" label="Bills in" value={rupees(t.submitted)} caption="Approved and waiting review" valueColor={palette.successInk} />
        <StatTile variant="light" label="Bills to come" value={rupees(t.outstanding)} caption="Still to be covered" valueColor={t.outstanding > 0 ? palette.warningInk : undefined} />
        <StatTile variant="light" label="Covered" value={doneRows.length} caption="Fully covered by bills" />
      </StatGrid>
      <Segmented
        options={[
          { key: 'open', label: 'Still open', badge: openRows.length },
          { key: 'done', label: 'Covered', badge: doneRows.length },
          { key: 'claims', label: 'Claims', badge: claimRows.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <PillField icon={Search} value={query} onChangeText={setQuery} placeholder="Search by name or code" accessibilityLabel="Search the ledger" autoCorrect={false} />
      <ChipRow>
        {PRESETS.map((p) => (
          <Chip key={p.key || 'all'} label={p.label} selected={p.key === preset} onPress={() => setPreset(p.key)} />
        ))}
      </ChipRow>
      {preset === 'custom' ? (
        // Date fields always stack (DESIGN §7.14): a date needs ~186 dp, more than half a phone.
        <View style={styles.range}>
          <DateField label="From" value={from} onChange={setFrom} maximumDate={to || today} />
          <DateField label="To" value={to} onChange={setTo} minimumDate={from || undefined} maximumDate={today} />
        </View>
      ) : null}
      {filtered ? <Button title="Clear filters" variant="text" onPress={clearFilters} /> : null}
      <Text variant="caption" muted>
        {tab === 'claims'
          ? `Expense claims paid back and confirmed received: ${rupees(claimTotal)}. They are repaid against a receipt, so they are not in the figures above.`
          : 'Requests whose payment the requester confirmed as received. Dates are the day each request was raised. Rejected bills are not counted.'}
      </Text>
      {error && !petty.data ? <Banner tone="danger" title="Couldn’t load the ledger" message={error.message} action={{ label: 'Retry', onPress: () => void Promise.all([petty.refetch(), subs.refetch()]) }} /> : null}
    </>
  );

  // An empty tab says why and offers the next step: clear the filters, or look at the other tab.
  const emptyNode = (title: string, what: string, next?: { label: string; onPress: () => void } | null) =>
    loading ? (
      <SkeletonList rows={6} tone="surface" />
    ) : error ? (
      <ErrorState message={error.message} onRetry={() => void petty.refetch()} />
    ) : (
      <EmptyState
        icon={<BookOpenCheck color={moduleTone.pettyCash.fg} strokeWidth={1.8} />}
        title={filtered ? 'Nothing matches' : title}
        message={filtered ? 'Try another search or date range.' : what}
        action={
          filtered ? (
            <Button title="Clear filters" variant="accent" size="md" onPress={clearFilters} />
          ) : next ? (
            <Button title={next.label} variant="accent" size="md" onPress={next.onPress} />
          ) : undefined
        }
      />
    );

  const refresh = () => Promise.all([petty.refetch(), subs.refetch(), claims.refetch()]);

  return (
    <Screen scroll={false} header={header} animate={false} contentStyle={styles.bleed}>
      {tab === 'claims' ? (
        <GridView
          key="claims"
          rows={claimRows}
          rowKey={(m) => m.id}
          first={cc.first}
          columns={cc.columns}
          zoom={zoom}
          lines={2}
          onRowPress={setOpenClaim}
          top={top}
          onRefresh={refresh}
          totals={claimRows.length > 1 ? { first: 'Total', cells: { amount: { text: rupees(claimTotal), strong: true } } } : null}
          empty={
            claims.isPending ? (
              <SkeletonList rows={4} tone="surface" />
            ) : claims.error && !claims.data ? (
              <ErrorState message={claims.error.message} onRetry={() => void claims.refetch()} />
            ) : (
              emptyNode('No claims yet', 'No expense claim has been confirmed as received yet.')
            )
          }
          bottom={<ShareCsvButton fileName={`claims-received-${today}`} rows={claimRows} columns={gridCsvColumns(cc.first, cc.columns)} />}
        />
      ) : (
        <GridView
          key={tab}
          rows={rows}
          rowKey={(L) => L.r.id}
          first={lc.first}
          columns={lc.columns}
          zoom={zoom}
          lines={2}
          onRowPress={setOpen}
          rowLabel={(L) => `${L.r.employeeName}: given ${rupees(L.raised)}, bills in ${rupees(L.submitted)}, to come ${rupees(L.outstanding)}`}
          top={top}
          onRefresh={refresh}
          totals={
            rows.length > 1
              ? {
                  first: 'Total',
                  cells: (() => {
                    const s = ledgerTotals(rows);
                    return {
                      raised: { text: rupees(s.raised), strong: true },
                      submitted: { text: rupees(s.submitted), strong: true },
                      awaiting: { text: rupees(s.awaiting), strong: true },
                      rejected: { text: rupees(s.rejected), strong: true },
                      outstanding: { text: rupees(s.outstanding), strong: true },
                      over: { text: rupees(s.over), strong: true },
                    };
                  })(),
                }
              : null
          }
          empty={
            tab === 'done'
              ? emptyNode('Nothing covered yet', 'No request has been fully covered by bills yet.', openRows.length ? { label: 'Show still open', onPress: () => setTab('open') } : null)
              : emptyNode('Nothing outstanding', 'Every request is covered by its bills.', doneRows.length ? { label: 'Show covered', onPress: () => setTab('done') } : null)
          }
          bottom={<ShareCsvButton fileName={`petty-cash-ledger-${tab === 'done' ? 'covered' : 'open'}-${today}`} rows={rows} columns={gridCsvColumns(lc.first, lc.columns)} />}
        />
      )}
      <RowSheet row={open} title={open?.r.employeeName ?? ''} subtitle={open?.r.projectName || open?.r.kekaCode} columns={lc.columns} onClose={() => setOpen(null)}>
        {open ? (
          <>
            {open.bills.length ? (
              <ActivityList title={`Bills (${open.bills.length})`}>
                {open.bills.map((b) => {
                  const busy = receipts.busyId === b.id;
                  const st =
                    b.status === 'rejected'
                      ? { label: 'Not counted', tone: 'failed' as const }
                      : b.status === 'pending'
                        ? { label: 'Waiting review', tone: 'pending' as const }
                        : { label: 'Counted', tone: 'done' as const };
                  const why = b.status === 'rejected' && 'rejectionReason' in b && b.rejectionReason ? `Rejected: ${b.rejectionReason}` : null;
                  return (
                    <ActivityRow
                      key={b.id}
                      module="pettyCash"
                      icon={ReceiptText}
                      title={b.description || 'Bill'}
                      subtitle={[`Bill no. ${pettyCashRef('bill', b)}`, b.createdAt ? dateLabel(b.createdAt, today) : null, why].filter(Boolean).join(' · ')}
                      note={b.hasFile ? (busy ? 'Opening receipt…' : 'View receipt') : null}
                      value={rupees(b.amount)}
                      status={st}
                      chevron={!!b.hasFile}
                      onPress={b.hasFile ? () => void receipts.open(b.submission ? 'submission' : 'bill', b.id) : undefined}
                    />
                  );
                })}
              </ActivityList>
            ) : (
              <SummaryCard title="Bills (0)" rows={[{ key: 'none', label: 'No bills yet', value: 'Nothing submitted against this request' }]} />
            )}
            <View style={styles.gap}>
              <SectionHeader title="History" />
              <Card tone="frostStrong">
                <HistoryTimeline events={historyEvents(open.r, today)} today={today} />
              </Card>
            </View>
            {receipts.sheet}
          </>
        ) : null}
      </RowSheet>
      <RowSheet row={openClaim} title={openClaim?.employee_name ?? ''} subtitle={openClaim?.project_name || openClaim?.keka_code} columns={cc.columns} onClose={() => setOpenClaim(null)}>
        {openClaim ? (
          <>
            <ReceiptButton id={openClaim.id} variant="row" />
            <View style={styles.gap}>
              <SectionHeader title="History" />
              <Card tone="frostStrong">
                <Timeline events={reimbursementEvents(openClaim, false, today)} today={today} />
              </Card>
            </View>
          </>
        ) : null}
      </RowSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  bleed: { paddingHorizontal: 0 },
  gap: { gap: space.sm },
  range: { gap: space.md },
}));
