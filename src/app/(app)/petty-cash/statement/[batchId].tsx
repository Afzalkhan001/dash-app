// Expense report for one set of bills — the website's "Statement of Expenses" (PettyCashStatementModal,
// dash.html ~L16427, data from GET /petty_cash_bill_submissions/statement/:batchId). One section per
// project code: petty cash received / spent / balance, spending by expense type, the payments received
// (when there is more than one), every bill, and any bills Accounts rejected.
// /petty-cash/statement/_?request=<id> shows the bills claimed in an automatic "extra" request.
// "Share report" exports the same printable page the website prints, as an HTML file.
// Accounts (accounts domain): a bill the server marks `canReject` opens a menu with "Reject this bill"
// (POST /petty_cash_bill_submissions/:id/reject, reason required). The employee is emailed; a bill inside
// an extra claim shrinks or closes that claim, and the toast says by how much.
// Layout: a light summary hero (total spent, bills and when they were sent), then per project a
// SummaryCard of money in / spent / left over, spending by expense type, payments, and the bills.

import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Ban, FileSpreadsheet, Paperclip, ReceiptText, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { rejectSubmission } from '@/api/accounts';
import { unwrap } from '@/api/client';
import { useMyTenant } from '@/api/me';
import { type PettyCashExcess, type PettyCashStatementLine, type PettyCashStatementSheet, usePettyCashStatement } from '@/api/petty-cash';
import { ReasonConfirmSheet } from '@/features/accounts/ui';
import { useInvalidateAccounts } from '@/features/accounts/use-items';
import { useTodayIst } from '@/features/attendance/use-now';
import { openDataUrl } from '@/features/bounty/files';
import { PettyIdleFooter } from '@/features/petty-cash/components';
import { PettyExcessBanner } from '@/features/petty-cash/lists';
import { amount, list, money, rowMoney, shortDate, statementHtml } from '@/features/petty-cash/logic';
import { useReceiptViewer } from '@/features/petty-cash/receipt';
import { plural } from '@/lib/format';
import { palette, radius } from '@/theme/tokens';
import {
  ActionBar,
  ActivityList,
  ActivityRow,
  Button,
  EmptyState,
  ErrorState,
  IconBadge,
  MenuSheet,
  NavHeader,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonList,
  SummaryCard,
  SummaryHero,
  toast,
  useLayout,
} from '@/ui';

function parseNotice(raw?: string): PettyCashExcess[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
  } catch {
    return [];
  }
}

function StatementSheetView({
  st,
  today,
  onReceipt,
  busyId,
  onLine,
}: {
  st: PettyCashStatementSheet;
  today: string;
  onReceipt: (id: string) => void;
  busyId: string | null;
  /** Accounts: a bill the server lets them reject opens the line menu instead. */
  onLine?: (line: PettyCashStatementLine) => void;
}) {
  const { gap } = useLayout();
  // Every line is listed (as the hero's bill count and the shared report count them); one without an
  // id just can't open its receipt.
  const lines = list(st.lines).filter(Boolean);
  const active = lines.filter((l) => l.status !== 'rejected');
  const rejected = lines.filter((l) => l.status === 'rejected');
  const heads = list(st.heads).filter((h) => !!h && amount(h.total));
  const inflow = list(st.inflow).filter(Boolean);
  // One payment is just the "received" row again, so its date and reference go under that row; only
  // several payments get their own card.
  const onlyPayment = inflow.length === 1 ? inflow[0] : null;
  const balance = amount(st.balance);
  return (
    <View style={{ gap }}>
      <SectionHeader overline={st.kekaCode || undefined} title={st.projectName || st.kekaCode || 'Expense report'} />
      <SummaryCard
        rows={[
          {
            key: 'in',
            label: 'Petty cash received',
            value: money(st.advance),
            hint: onlyPayment ? [shortDate(onlyPayment.date, today), onlyPayment.reference ? `Reference ${onlyPayment.reference}` : null].filter(Boolean).join(' · ') : null,
          },
          { key: 'spent', label: 'Spent', value: money(st.total) },
          { key: 'from', label: 'From', value: `${shortDate(st.startDate, today)} · ${plural(st.days || 1, 'day')}` },
        ]}
        total={{ label: balance < 0 ? 'Spent over the petty cash' : 'Left over', value: money(Math.abs(balance)) }}
      />

      {heads.length ? (
        <SummaryCard
          title="By expense type"
          rows={heads.map((h, i) => ({ key: h.id || String(i), label: h.name || 'Expense type', value: money(h.total) }))}
          total={heads.length > 1 ? { label: 'Total', value: money(st.total) } : null}
        />
      ) : null}

      {inflow.length > 1 ? (
        <SummaryCard
          title="Payments received"
          rows={inflow.map((i, k) => ({
            key: `${i.date}-${k}`,
            label: shortDate(i.date, today),
            value: money(i.amount),
            hint: i.reference ? `Reference ${i.reference}` : null,
          }))}
        />
      ) : null}

      <ActivityList title={`Bills · ${active.length}`} empty="No bills are counted here.">
        {active.map((l, i) => {
          const busy = !!l.id && busyId === l.id;
          const canOpen = !!l.id && !!l.hasFile;
          const rejectable = !!l.id && !!l.canReject && !!onLine;
          return (
            <ActivityRow
              key={l.id || `${l.voucherNumber || 'line'}-${i}`}
              module="pettyCash"
              icon={l.hasFile ? Paperclip : ReceiptText}
              title={[l.description, l.paidTo].filter(Boolean).join(' — ') || 'Bill'}
              subtitle={[l.head, l.date ? shortDate(l.date, today) : null].filter(Boolean).join(' · ') || null}
              note={[l.voucherNumber ? `Bill no. ${l.voucherNumber}` : null, canOpen ? (busy ? 'Opening receipt…' : 'Receipt attached') : null, rejectable ? 'Tap to check or reject' : null].filter(Boolean).join(' · ') || null}
              value={rowMoney(l.amount)}
              chevron={canOpen || rejectable}
              onPress={rejectable ? () => onLine!(l) : canOpen ? () => onReceipt(l.id) : undefined}
            />
          );
        })}
      </ActivityList>

      {rejected.length ? (
        <ActivityList title="Rejected by Accounts">
          {rejected.map((l, i) => (
            <ActivityRow
              key={l.id || `${l.voucherNumber || 'line'}-${i}`}
              left={
                <IconBadge bg={palette.dangerSoft}>
                  <ReceiptText size={20} color={palette.dangerInk} strokeWidth={1.8} />
                </IconBadge>
              }
              title={[l.description, l.paidTo].filter(Boolean).join(' — ') || 'Bill'}
              // Three lines at most: what, why, then who rejected it and the bill number.
              subtitle={l.rejectionReason || 'No reason given'}
              note={[`By ${l.rejectedByName || 'Accounts'}${l.rejectedAt ? ` on ${shortDate(l.rejectedAt, today)}` : ''}`, l.voucherNumber ? `Bill no. ${l.voucherNumber}` : null].filter(Boolean).join(' · ')}
              value={rowMoney(l.amount)}
              valueColor={palette.textMuted}
              status={{ label: 'Not counted', tone: 'failed' }}
            />
          ))}
        </ActivityList>
      ) : null}
    </View>
  );
}

export default function PettyCashStatementScreen() {
  const { batchId, request, notice } = useLocalSearchParams<{ batchId: string; request?: string; notice?: string }>();
  const statementQ = usePettyCashStatement(batchId && batchId !== '_' ? batchId : '', request || undefined);
  const tenant = useMyTenant().data;
  const today = useTodayIst();
  const { compact } = useLayout();
  const receipts = useReceiptViewer();
  const [sharing, setSharing] = useState(false);
  const [line, setLine] = useState<PettyCashStatementLine | null>(null);
  const [rejecting, setRejecting] = useState<PettyCashStatementLine | null>(null);
  const [reason, setReason] = useState('');
  const invalidateAccounts = useInvalidateAccounts();
  const reject = useMutation({
    mutationFn: (l: PettyCashStatementLine) => unwrap(rejectSubmission(l.id, reason.trim())),
    onSuccess: (r) => {
      setRejecting(null);
      const c = r?.claim;
      toast.show(c ? (c.closed ? `Bill rejected. The extra claim of ${money(c.before)} is closed.` : `Bill rejected. Extra claim ${money(c.before)} → ${money(c.after)}.`) : 'Bill rejected. It’s no longer counted.');
    },
    onError: (e) => toast.show((e instanceof Error && e.message) || 'Couldn’t reject the bill.', 'danger'),
    onSettled: () => {
      void statementQ.refetch();
      void invalidateAccounts();
    },
  });
  const excess = parseNotice(notice);
  const data = statementQ.data;
  const sheets = list(data?.statements).filter(Boolean);
  const employee = data?.employee;

  const share = async () => {
    if (!data || sharing) return;
    setSharing(true);
    try {
      const html = statementHtml(data, tenant);
      const day = String(sheets[0]?.submittedAt || '').slice(0, 10);
      await openDataUrl(`data:text/html,${encodeURIComponent(html)}`, `Expense-report${/^\d{4}-\d{2}-\d{2}$/.test(day) ? `-${day}` : ''}.html`);
    } catch (e) {
      Alert.alert('Share report', e instanceof Error ? e.message : 'Could not prepare the report.');
    } finally {
      setSharing(false);
    }
  };

  const totalSpent = sheets.reduce((s, st) => s + amount(st.total), 0);
  const allLines = sheets.flatMap((st) => list(st.lines).filter(Boolean));
  const rejectedCount = allLines.filter((l) => l.status === 'rejected').length;
  const submittedAt = sheets.map((st) => st.submittedAt || '').sort().pop();
  const loading = statementQ.isLoading;
  const ready = !!data && sheets.length > 0;

  return (
    <>
      <Screen
        header={<NavHeader title={request ? 'Bills in this claim' : 'Expense report'} />}
        footer={
          // The idle footer keeps Screen's tree while loading, so the bar arriving with the data
          // doesn't remount the content (and replay its entrance).
          ready ? (
            <ActionBar>
              <Button title="Share report" icon={<Share2 />} loading={sharing} onPress={() => void share()} />
            </ActionBar>
          ) : (
            <PettyIdleFooter />
          )
        }
        onRefresh={() => statementQ.refetch()}>
        {excess.length ? <PettyExcessBanner excess={excess} /> : null}

        {loading ? (
          <Skeleton height={compact ? 196 : 208} radius={radius.xxl} />
        ) : statementQ.error && !data ? (
          <ErrorState message={statementQ.error.message} onRetry={() => void statementQ.refetch()} />
        ) : ready ? (
          <SummaryHero
            icon={FileSpreadsheet}
            module="pettyCash"
            label={request ? 'Bills in this extra claim' : 'Total spent'}
            value={totalSpent}
            currency="₹"
            info={{
              label: plural(allLines.length - rejectedCount, 'bill'),
              value: rejectedCount ? `${rejectedCount} rejected` : undefined,
            }}
            sub={[employee?.name, submittedAt ? `Sent ${shortDate(submittedAt, today)}` : null].filter(Boolean).join(' · ') || undefined}
          />
        ) : (
          <EmptyState icon={<FileSpreadsheet color={palette.textMuted} />} title="Report not found" message="There are no bills here you can see." />
        )}

        {loading ? <SkeletonList rows={3} /> : null}

        {ready
          ? sheets.map((st, i) => (
              <StatementSheetView key={`${st.kekaCode}-${i}`} st={st} today={today} busyId={receipts.busyId} onReceipt={(id) => void receipts.open('submission', id)} onLine={setLine} />
            ))
          : null}
      </Screen>
      {receipts.sheet}
      <MenuSheet
        visible={!!line}
        onClose={() => setLine(null)}
        title={line ? [line.description, line.paidTo].filter(Boolean).join(' — ') || 'Bill' : undefined}
        subtitle={line ? `${money(line.amount)}${line.voucherNumber ? ` · Bill no. ${line.voucherNumber}` : ''}` : undefined}
        items={[
          ...(line?.hasFile
            ? [
                {
                  key: 'view',
                  label: 'View the receipt',
                  icon: Paperclip,
                  onPress: () => {
                    const id = line.id;
                    setLine(null);
                    void receipts.open('submission', id);
                  },
                },
              ]
            : []),
          {
            key: 'reject',
            label: 'Reject this bill',
            icon: Ban,
            tone: 'danger' as const,
            hint: 'The employee is emailed your reason',
            onPress: () => {
              const l = line;
              setLine(null);
              setReason('');
              setTimeout(() => setRejecting(l), 400);
            },
          },
        ]}
      />
      <ReasonConfirmSheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this bill?"
        rows={rejecting ? [{ key: 'b', label: 'Bill', value: [rejecting.description, rejecting.paidTo].filter(Boolean).join(' — ') || 'Bill' }, { key: 'a', label: 'Amount', value: money(rejecting.amount) }] : []}
        reason={reason}
        onReason={setReason}
        minLength={1}
        placeholder="e.g. Parking was part of the location fee."
        note={`${employee?.name || 'The employee'} is emailed your reason. The bill stops counting; if it is part of an extra claim, that claim shrinks. It can’t be undone.`}
        confirmLabel="Swipe to reject"
        busy={reject.isPending}
        onConfirm={() => rejecting && reject.mutate(rejecting)}
      />
    </>
  );
}
