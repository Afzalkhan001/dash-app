// "What is waiting on me?" — one picture shared by the Inbox tab badge, Home and the Inbox screen.
// Each queue is gated the way its own screen gates it today, so nobody fires a request the server
// refuses and nobody sees a queue they didn't see before:
//   HR queues      useAccess().approvals — the kinds the web's ApprovalsPanel shows this person
//   Project claims a role reimbursements.js serves, owning a project code (isKekaCodeOwner, via /projects),
//                  or anyone whose Expense claims screen lists claims for them to approve (GET
//                  /reimbursements/keka-all, read from that screen's cache — the old Approvals tab's
//                  rule, e.g. a super admin who sees the company's claims without owning a code)
//   Petty cash     the old Petty cash Approvals tab's rule: a petty cash role, and Accounts, a project
//                  code owner, or someone with a request waiting on them (features/petty-cash/logic)
//   Visitors       everyone but master_admin / announcement_viewer / visitor_manager (dash.html navFor)
// Only what is waiting is read here; Past decisions fetches the other statuses when opened.

import { focusManager, onlineManager, type Query, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  canSeeVisitors,
  type HrKindKey,
  hrListQuery,
  INBOX_POLL_MS,
  kekaIsPending,
  kekaQuery,
  useKekaOwnership,
  visitorsQuery,
} from '@/api/inbox';
import { useKekaProjects, usePettyCashOverview } from '@/api/petty-cash';
import { useKekaReimbursements } from '@/api/reimbursements';
import { useSession } from '@/auth/session';
import { type InboxItem, KIND_COPY, timeValue } from '@/features/inbox/format';
import { awaitingMyApproval, isKekaCodeOwner, isPettyCashApprover, list, roleSeesPettyCash } from '@/features/petty-cash/logic';
import { useAccess } from '@/lib/use-access';

type QueueBase = { label: string; pending: number | null; error: boolean };
export type InboxQueue =
  | (QueueBase & { type: 'hr'; key: HrKindKey })
  | (QueueBase & { type: 'keka'; key: 'keka' })
  | (QueueBase & { type: 'petty'; key: 'petty' })
  | (QueueBase & { type: 'visitors'; key: 'visitors' });
export type InboxQueueKey = InboxQueue['key'];

const rowsOf = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []).filter((r): r is T => !!r && typeof r === 'object');
const enc = encodeURIComponent;
// A name from the server, or the fallback when it is missing or not text.
const nameOr = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);

export function useInboxSummary() {
  const user = useSession((s) => s.user);
  const userId = user?.id;
  const access = useAccess();
  // Guard every list we read: the persisted cache can hold whatever an older app version stored.
  const kinds = Array.isArray(access.approvals) ? access.approvals : [];

  // HR approvals.
  const hr = useQueries({ queries: kinds.map((k) => hrListQuery(k.key, 'pending', userId)) });

  // Claims against project codes I own — or, for anyone else the old Approvals tab served, the claims
  // Expense claims already found for me to approve (cache only: never fetched from here).
  const kekaOwner = useKekaOwnership();
  const hadApprovals = useKekaReimbursements(false);
  const kekaOn = kekaOwner.data?.owns === true || rowsOf(hadApprovals.data).length > 0;
  const keka = useQuery(kekaQuery(userId, { enabled: kekaOn }));

  // Petty cash waiting on me — the same reads and rules as the old Petty cash Approvals tab. The
  // project list only matters to someone with an employee number (isKekaCodeOwner matches on it), and
  // the overview is only fetched for people who can approve; a cached one still counts.
  const pettyRole = roleSeesPettyCash(user);
  const pettyAdmin = isPettyCashApprover(user);
  const hasEmpNo = !!(user?.employeeNumber || user?.kekaCode);
  const pettyProjects = useKekaProjects(pettyRole && !pettyAdmin && hasEmpNo);
  const pettyOwner = pettyAdmin || isKekaCodeOwner(user, list(pettyProjects.data));
  const petty = usePettyCashOverview(pettyRole && pettyOwner);
  const pettyWaiting = petty.data ? awaitingMyApproval(user, list(petty.data.requests)) : [];
  const pettyOn = pettyRole && (pettyOwner || pettyWaiting.length > 0);

  // Visitors waiting for me at reception.
  const visitorsOn = canSeeVisitors(user);
  const visitors = useQuery(visitorsQuery(userId, { enabled: visitorsOn }));

  const queues: InboxQueue[] = kinds.map((k, i): InboxQueue => {
    const q = hr[i];
    return { type: 'hr', key: k.key, label: KIND_COPY[k.key].chip, pending: Array.isArray(q?.data) ? q.data.length : null, error: !!q?.isError };
  });
  if (kekaOn) {
    queues.push({
      type: 'keka',
      key: 'keka',
      label: KIND_COPY.keka.chip,
      pending: Array.isArray(keka.data) ? keka.data.filter((r) => !!r && kekaIsPending(r, userId)).length : null,
      error: keka.isError,
    });
  }
  if (pettyOn) {
    queues.push({ type: 'petty', key: 'petty', label: KIND_COPY.petty.chip, pending: petty.data ? pettyWaiting.length : null, error: petty.isError });
  }
  if (visitorsOn) {
    queues.push({
      type: 'visitors',
      key: 'visitors',
      label: KIND_COPY.visitors.chip,
      pending: Array.isArray(visitors.data) ? visitors.data.length : null,
      error: visitors.isError,
    });
  }

  // Everything waiting, as one list: visitors first (they are standing at reception), then newest first.
  const items: InboxItem[] = [];
  kinds.forEach((k, i) => {
    for (const r of rowsOf(hr[i]?.data)) {
      if (!r.id) continue;
      items.push({ kind: k.key, key: `${k.key}:${r.id}`, id: r.id, at: r.created_at ?? '', who: nameOr(r.employee_name, 'Employee'), href: `/inbox/${k.key}/${enc(r.id)}?status=pending`, record: r });
    }
  });
  if (kekaOn) {
    for (const r of rowsOf(keka.data)) {
      if (!r.id || !kekaIsPending(r, userId)) continue;
      items.push({ kind: 'keka', key: `keka:${r.id}`, id: r.id, at: r.created_at ?? '', who: nameOr(r.employee_name, 'Employee'), href: `/inbox/keka/${enc(r.id)}`, record: r });
    }
  }
  if (pettyOn) {
    for (const r of pettyWaiting) {
      if (!r.id) continue;
      items.push({ kind: 'petty', key: `petty:${r.id}`, id: r.id, at: r.createdAt ?? '', who: nameOr(r.employeeName, 'Employee'), href: `/inbox/petty/${enc(r.id)}`, record: r });
    }
  }
  if (visitorsOn) {
    for (const v of rowsOf(visitors.data)) {
      if (!v.id) continue;
      items.push({ kind: 'visitors', key: `visitors:${v.id}`, id: v.id, at: v.createdAt ?? '', who: nameOr(v.visitorName, 'Visitor'), href: `/inbox/visitors/${enc(v.id)}`, record: v });
    }
  }
  items.sort((a, b) => Number(b.kind === 'visitors') - Number(a.kind === 'visitors') || timeValue(b.at) - timeValue(a.at));

  const total = queues.reduce((n, q) => n + (q.pending ?? 0), 0);
  const discovering = access.loading || kekaOwner.isLoading || pettyProjects.isLoading;
  // Ready once we know which queues this person has and each has answered (or failed) once.
  const ready = !discovering && queues.every((q) => q.pending !== null || q.error);
  // Every queue failed and none has anything cached (offline on a first run, say).
  const failed = queues.length > 0 && queues.every((q) => q.error && q.pending === null);

  return {
    queues,
    /** Everything waiting on me, ready to list (visitors first, then newest first). */
    items,
    total,
    ready,
    failed,
    // Still finding out which queues this person has (first load only; the cache answers after that).
    discovering,
    visitors,
    refetchAccess: access.refetch,
  };
}

// ── Polling ──────────────────────────────────────────────────────────────────
// The pending counts refresh once a minute while anything showing the count is mounted. One timer
// for the whole app: TanStack runs `refetchInterval` per observer, and the count is shown in several
// places at once (tab bar, Home), each of which would otherwise poll on its own clock. Petty cash is
// not polled: its read first runs the server's over-spend catch-up, so it refreshes the way the Petty
// cash screen does (on focus, on return to the app, on pull to refresh).
const isCountQuery = (q: Query) => {
  const k = q.queryKey;
  return k[0] === 'inbox' && ((k[1] === 'hr' && k[3] === 'pending') || k[1] === 'keka' || k[1] === 'visitors');
};

let pollers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function useInboxPolling() {
  const qc = useQueryClient();
  useEffect(() => {
    pollers += 1;
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        // Same rule as refetchInterval: not while the app is in the background or offline.
        if (!focusManager.isFocused() || !onlineManager.isOnline()) return;
        void qc.refetchQueries({ type: 'active', predicate: isCountQuery }, { cancelRefetch: false });
      }, INBOX_POLL_MS);
    }
    return () => {
      pollers = Math.max(0, pollers - 1);
      if (!pollers && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }, [qc]);
}
