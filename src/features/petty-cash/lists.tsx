// The petty cash lists, shared by the main screen (latest few) and the pushed "See all" screens:
// my requests, my bills, my expense reports, and the one notice about bills that went over the
// petty cash. All read the one overview query and render as the kit's ActivityList (a title, a "See
// all" link or a filter pill, and one frosted card of rows). Rows never hold buttons: a request opens
// its own screen, a bill opens its receipt (or a small menu when it also has an expense report, or can
// still be withdrawn).

import { useRouter } from 'expo-router';
import { FileSpreadsheet, Paperclip, TriangleAlert, Undo2 } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';

import type { PettyCashExcess, PettyCashOverview, PettyCashRequest, PettyCashSubmission } from '@/api/petty-cash';
import { useTodayIst } from '@/features/attendance/use-now';
import { ActivityList, Banner, type MenuItem, MenuSheet, Text } from '@/ui';

import { PettyCashBillRow, PettyCashRequestRow, PettyStatementRow } from './components';
import { billBatches, canWithdrawBill, isAuthorized, list, money, myRequests, pettyCashPool, pettyCashRef } from './logic';
import { useReceiptViewer } from './receipt';
import { useWithdrawBill } from './withdraw';

type ListHead = {
  /** Section title over the card ("My requests"). */
  title?: string;
  /** The muted "See all" link. */
  onSeeAll?: () => void;
  /** One control instead of the link (a FilterPill). */
  right?: ReactNode;
  /** A muted line inside the card when the filter leaves nothing. */
  empty?: string;
};

// ── My requests ──────────────────────────────────────────────────────────────
/**
 * My requests (newest first) as one ActivityList; `limit` shows only the latest few, `filter` keeps
 * some of them. Renders nothing when I have none (or the filter leaves none and there is no `empty`).
 */
export function PettyRequestsCard({
  data,
  meId,
  limit,
  filter,
  title,
  onSeeAll,
  right,
  empty,
}: { data: PettyCashOverview | null | undefined; meId?: string; limit?: number; filter?: (r: PettyCashRequest) => boolean } & ListHead) {
  const router = useRouter();
  const today = useTodayIst();
  const requests = list(data?.requests).filter(Boolean);
  const subs = list(data?.subs);
  const mine = myRequests(meId, requests);
  const kept = filter ? mine.filter(filter) : mine;
  const rows = limit ? kept.slice(0, limit) : kept;
  if (!mine.length) return null;
  return (
    <ActivityList title={title} onSeeAll={onSeeAll} seeAllAccessibilityLabel="See all my requests" right={right} empty={empty}>
      {rows.map((r) => (
        <PettyCashRequestRow
          key={r.id}
          r={r}
          meId={meId}
          today={today}
          pool={isAuthorized(r) ? pettyCashPool(requests, subs, r) : null}
          onPress={() => router.push(`/petty-cash/request/${encodeURIComponent(r.id)}`)}
        />
      ))}
    </ActivityList>
  );
}

// ── Bills that went over the petty cash ─────────────────────────────────────
/** One warning, one short line per project code. Renders nothing when there is nothing over. */
export function PettyExcessBanner({ excess }: { excess: PettyCashExcess[] | null | undefined }) {
  const rows = list(excess).filter((x) => !!x && typeof x === 'object');
  if (!rows.length) return null;
  return (
    <Banner tone="warning" icon={TriangleAlert} title="Your bills are more than your petty cash">
      {rows.map((x, i) => (
        <Text key={x.requestId || i} variant="label">
          {x.kekaCode || 'Petty cash'}: <Text variant="labelStrong">{money(x.amount)}</Text> extra sent to{' '}
          {x.selfOwned ? 'Accounts' : `${x.ownerName || 'the project owner'} to approve`}.
        </Text>
      ))}
    </Banner>
  );
}

// ── My bills ─────────────────────────────────────────────────────────────────
/**
 * Every bill I added (or those `filter` keeps). A bill opens its receipt; with an expense report as
 * well, or while it can still be withdrawn, a small menu asks which.
 */
export function PettyBillsCard({
  data,
  filter,
  title,
  onSeeAll,
  right,
  empty,
}: { data: PettyCashOverview | null | undefined; filter?: (b: PettyCashSubmission) => boolean } & ListHead) {
  const router = useRouter();
  const today = useTodayIst();
  const receipts = useReceiptViewer();
  const withdraw = useWithdrawBill();
  // The menu's bill outlives its visibility, so the sheet keeps its title and rows while it fades out.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<PettyCashSubmission | null>(null);
  const requests = list(data?.requests).filter(Boolean);
  const all = list(data?.subs)
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const subs = filter ? all.filter(filter) : all;
  const byId = new Map(requests.map((r) => [r.id, r]));

  const actionsFor = (b: PettyCashSubmission): MenuItem[] => {
    const items: MenuItem[] = [];
    if (b.hasFile) {
      items.push({ key: 'receipt', label: 'View receipt', icon: Paperclip, hint: b.fileName || undefined, onPress: () => void receipts.open('submission', b.id, b.fileName) });
    }
    if (b.batchId) {
      const batch = b.batchId;
      items.push({ key: 'report', label: 'Expense report', icon: FileSpreadsheet, hint: 'For the bills sent with this one', onPress: () => router.push(`/petty-cash/statement/${encodeURIComponent(batch)}`) });
    }
    if (canWithdrawBill(b, b.excessRequestId ? byId.get(b.excessRequestId) : null)) {
      // The confirm sheet rises once the menu has gone (as the expense report's Reject does).
      items.push({ key: 'withdraw', label: 'Withdraw this bill', icon: Undo2, tone: 'danger', hint: 'Sent by mistake? It stops counting', onPress: () => setTimeout(() => withdraw.ask(b), 400) });
    }
    return items;
  };
  // One thing to do → do it (a withdrawal is always asked about in the menu); two → ask which.
  const pressFor = (b: PettyCashSubmission) => {
    const items = actionsFor(b);
    if (!items.length) return undefined;
    if (items.length === 1 && items[0]!.key !== 'withdraw') return items[0]!.onPress;
    return () => {
      setMenuFor(b);
      setMenuOpen(true);
    };
  };

  if (!all.length) return null;
  return (
    <>
      <ActivityList title={title} onSeeAll={onSeeAll} right={right} empty={empty}>
        {subs.map((b) => (
          <PettyCashBillRow
            key={b.id}
            b={b}
            busy={receipts.busyId === b.id}
            today={today}
            excessRequest={b.excessRequestId ? byId.get(b.excessRequestId) : null}
            onPress={pressFor(b)}
          />
        ))}
      </ActivityList>
      <MenuSheet
        visible={menuOpen && !!menuFor}
        onClose={() => setMenuOpen(false)}
        title={menuFor ? menuFor.description || menuFor.departmentName || 'Bill' : undefined}
        subtitle={menuFor ? `Bill no. ${pettyCashRef('bill', menuFor)} · ${money(menuFor.amount)}` : undefined}
        items={menuFor ? actionsFor(menuFor) : []}
      />
      {receipts.sheet}
      {withdraw.sheet}
    </>
  );
}

// ── My expense reports (one per time I sent bills) ───────────────────────────
export function PettyReportsCard({ data, title }: { data: PettyCashOverview | null | undefined; title?: string }) {
  const router = useRouter();
  const today = useTodayIst();
  const batches = billBatches(list(data?.subs));
  if (!batches.length) return null;
  return (
    <ActivityList title={title}>
      {batches.map((b) => (
        <PettyStatementRow key={b.batchId} batch={b} today={today} onPress={() => router.push(`/petty-cash/statement/${encodeURIComponent(b.batchId)}`)} />
      ))}
    </ActivityList>
  );
}
