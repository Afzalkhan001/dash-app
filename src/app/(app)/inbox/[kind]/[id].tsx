// One thing from the Inbox: everything needed to decide it, and the decision in the sticky bar —
// "Swipe to approve" over a frosted Reject button. `kind` is an HR approval kind (regularization,
// leave, wfh, comp_off, reimbursements, loans), 'keka' for a claim against a project code the person
// owns, 'petty' for petty cash waiting on them, or 'visitors' for someone at reception. The calls are
// exactly the ones their own screens make:
//   HR:          POST <decide> { decision, note } — rejecting needs a reason of 3+ characters,
//                approving sends an empty note, like the web (hr_common.js readDecision).
//   Project:     POST /reimbursements/:id/keka-approve {} — the swipe is the confirm the web asks for;
//                POST /reimbursements/:id/keka-reject { reason } — reason required.
//   Petty cash:  POST /petty_cash_requests/:id/approve {} (the swipe is the confirm, as on the Petty
//                cash screen); POST /petty_cash_requests/:id/reject { reason } — reason optional.
//   Visitors:    POST /visitors/:id/decide { decision } (useDecideVisit) — the server takes no note,
//                so Turn away asks first, as the Visitors screen does. The bar says "Let in" /
//                "Turn away" here: you approve a request, not a person.
//
// Every kind reads the same way (docs/REFERENCE-COMPONENTS.md §3 "Inbox"; features/inbox/detail):
// NavHeader → SummaryHero (the key figure) → From → To (the person asking → you) → one notice →
// their words → SummaryCard of details → extras and history, with the decision bar pinned at the
// bottom while it is mine to decide. Approve is a swipe (claims and petty cash say what happens next
// above it); Reject opens the reason sheet. Either way a success sheet then says what happened, and
// Done (or ×) goes back to the list.
//
// The HR inboxes and the claim / petty cash lists have no single-item route, so the screen shows the
// row it was opened from (read from the cached list). A project claim or petty cash opened by link
// (an old Expense claims / Petty cash link redirects here) reads its list if it isn't cached yet.
//
// This is the only place anything is approved or rejected: Expense claims and Petty cash send their
// approvers here.
//
// Any other `kind` that is a domain plug-in's key (features/domains inboxPlugin) renders that
// plug-in's own Detail screen with { id, params } (Wave 0 extension point).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { unwrap } from '@/api/client';
import {
  canSeeVisitors,
  type Decision,
  findHrRequest,
  findKekaReimbursement,
  type HrKindKey,
  inboxKeys,
  isHrKind,
  kekaIsPending,
  type KekaReimbursement,
  useDecideHr,
  useDecideKeka,
  useKekaQueue,
  type WaitingVisitor,
} from '@/api/inbox';
import { approvePettyCashRequest, type PettyCashOverview, type PettyCashRequest, rejectPettyCashRequest, usePettyCashOverview } from '@/api/petty-cash';
import { useDecideVisit, useMyVisitors } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { inboxPlugin } from '@/features/domains';
import { noteDecision } from '@/features/inbox/decided';
import {
  DecidedSheet,
  deciderItem,
  DecisionNote,
  DecisionScreen,
  DetailsCard,
  DetailSkeleton,
  explainDecisionError,
  MissingItem,
  NoteCard,
  outcomeStatus,
  personItem,
  ReceiptButton,
  RejectSheet,
  RequestHero,
  requesterItem,
  Timeline,
  useOutcome,
  VisitorHero,
  WhoCards,
} from '@/features/inbox/detail';
import {
  hrDetail,
  hrStatusLabel,
  hrStatusTone,
  KIND_COPY,
  kekaEvents,
  kekaStatus,
  lastReupload,
  pettyStatus,
  purposeLabel,
  reimbursementRef,
  sentLine,
  timeValue,
  visitorArrived,
} from '@/features/inbox/format';
import { useLeaveNames } from '@/features/inbox/leave-names';
import { canApprove, isOwnRequest, isPettyCashApprover, list, roleSeesPettyCash } from '@/features/petty-cash/logic';
import { phoneLabel } from '@/features/visitors/format';
import { VisitPhoto } from '@/features/visitors/visit-photo';
import { durationLabel } from '@/lib/dates';
import { inr } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { ConfirmSheet, ErrorState, haptic, NavHeader, Screen, SummaryCard, useLayout } from '@/ui';

export default function InboxItemScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string; status?: string }>();
  const kind = String(params.kind ?? '');
  const id = String(params.id ?? '');
  if (kind === 'keka') return <KekaItem id={id} />;
  if (kind === 'petty') return <PettyItem id={id} />;
  if (kind === 'visitors') return <VisitorItem id={id} />;
  if (isHrKind(kind)) return <HrItem kind={kind} id={id} status={typeof params.status === 'string' ? params.status : undefined} />;
  // A domain plug-in's kind (features/plugin-types InboxKindPlugin): its own decision screen.
  const plugin = inboxPlugin(kind);
  if (plugin) return <PluginItem pluginKey={plugin.key} id={id} params={params} />;
  return <MissingItem title="Request" />;
}

function PluginItem({ pluginKey, id, params }: { pluginKey: string; id: string; params: Record<string, string | string[] | undefined> }) {
  const Detail = inboxPlugin(pluginKey)?.Detail;
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params ?? {})) flat[k] = Array.isArray(v) ? v[0] : v;
  return Detail ? <Detail id={id} params={flat} /> : <MissingItem title="Request" />;
}

const finiteAmount = (n: unknown) => (n != null && n !== '' && Number.isFinite(Number(n)) ? Number(n) : undefined);
// A name from the server, or the fallback when it is missing or not text.
const nameOr = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);
const textOr = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
// The cached lists can hold whatever an older app version stored; a bad row must not take the screen down.
const safely = <T,>(find: () => T | null): T | null => {
  try {
    return find();
  } catch {
    return null;
  }
};

// The same words after every decision, for every kind: "Leave request approved", "Petty cash rejected".
const decidedTitle = (noun: string, decision: Decision) => (decision === 'approve' ? `${noun} approved` : `${noun} rejected`);
// After a reject: the reason goes to the person who asked (when one was given).
const rejectedLine = (name: string, gaveReason: boolean) => (gaveReason ? `${name} will see your reason.` : 'It’s no longer waiting on you.');

// ── HR approvals ─────────────────────────────────────────────────────────────
function HrItem({ kind, id, status }: { kind: HrKindKey; id: string; status?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const me = useSession((s) => s.user);
  const now = useNow();
  const today = useTodayIst();
  const names = useLeaveNames();
  const [item] = useState(() => safely(() => findHrRequest(qc, kind, id, status)));
  const decide = useDecideHr(kind);
  const outcome = useOutcome();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const title = KIND_COPY[kind].title;

  if (!item) return <MissingItem title={title} />;

  const d = hrDetail(kind, item, today, names);
  const name = nameOr(item.employee_name, 'Employee');
  const approvals = Array.isArray(access.approvals) ? access.approvals : [];
  // The server re-checks (scope, not your own, still pending); this only decides what is offered.
  const canDecide = item.status === 'pending' && approvals.some((a) => !!a && a.key === kind);
  const statusPill = { label: hrStatusLabel(item.status), tone: hrStatusTone(item.status) };
  const figureText = d.amount != null ? inr(d.amount) : `${d.value}${d.unit ? ` ${d.unit}` : ''}`;
  // Once decided, the To card names who decided it and what they decided. A claim since paid or an
  // advance since paid back was approved by them (the server's decided_by is the approval's), so the
  // card says "Approved", never "Paid". A cancelled request was withdrawn by the employee: the card
  // keeps the approver's role, and the notice under it says who cancelled.
  const pending = item.status === 'pending';
  const cancelled = item.status === 'cancelled';
  const decidedAs = item.status === 'paid' || item.status === 'closed' ? 'approved' : item.status;

  const close = () => {
    setRejecting(false);
    router.back();
  };
  const run = (decision: Decision, text: string) =>
    decide.mutate(
      { id: item.id, decision, note: text },
      {
        onSuccess: () => {
          noteDecision(`${kind}:${item.id}`, me?.id, decision);
          setRejecting(false);
          outcome.show(
            {
              decision,
              title: decidedTitle(d.noun, decision),
              subtitle: decision === 'approve' ? 'It’s no longer waiting on you.' : rejectedLine(name, true),
              rows: [
                { key: 'who', label: 'From', value: name },
                { key: 'what', label: d.noun, value: figureText },
                ...(d.caption ? [{ key: 'for', label: 'For', value: d.caption }] : []),
                outcomeStatus(decision),
              ],
            },
            decision === 'reject',
          );
        },
        onError: (e) => explainDecisionError(e, close),
      },
    );

  return (
    <>
      <DecisionScreen
        title={title}
        decision={
          canDecide && !outcome.done
            ? {
                onApprove: () => run('approve', ''),
                onReject: () => {
                  setNote('');
                  setRejecting(true);
                },
                approving: decide.isPending && decide.variables?.decision === 'approve',
                disabled: decide.isPending,
              }
            : null
        }>
        <RequestHero kind={kind} value={d.value} amount={d.amount} figure={d.figure} unit={d.unit} caption={d.caption} />
        <WhoCards
          from={requesterItem(name, sentLine(item.created_at, now))}
          to={deciderItem({
            mine: canDecide,
            me: me?.name,
            status: pending ? undefined : hrStatusLabel(decidedAs),
            by: cancelled ? undefined : item.decided_by_name,
          })}
        />
        {/* Already decided: when and why is the state, so it comes first. Who decided it is the To
            card's (it is named here only for a cancelled request, which the employee withdrew). */}
        {!pending ? (
          <DecisionNote status={item.status} by={cancelled ? item.decided_by_name : undefined} at={item.decided_at} note={item.decision_note} today={today} />
        ) : null}
        {d.note ? <NoteCard label={d.note.label} text={d.note.text} /> : null}
        <DetailsCard status={statusPill} fields={d.fields} />
      </DecisionScreen>
      <RejectSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this request?"
        subtitle={`${name} will see your reason.`}
        note={note}
        onChangeNote={setNote}
        minLength={3}
        placeholder="Why it can’t be approved"
        busy={decide.isPending}
        onSubmit={() => run('reject', note.trim())}
      />
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}

// ── Claims against my project codes ──────────────────────────────────────────
function KekaItem({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const now = useNow();
  const today = useTodayIst();
  const me = useSession((s) => s.user);
  const userId = me?.id;
  // The cached row it was opened from, or — opened by link before the list was loaded — the list's own
  // read (GET /reimbursements/keka-all, the Inbox's existing query: same key, so it is shared).
  const [cached] = useState(() => safely(() => findKekaReimbursement(qc, id)));
  const queue = useKekaQueue();
  const live = (Array.isArray(queue.data) ? queue.data : []).find((r) => !!r && r.id === id) ?? null;
  // Frozen while a decision is on its way, so the screen doesn't change under the success sheet.
  const [held, setHeld] = useState<KekaReimbursement | null>(null);
  const decide = useDecideKeka();
  const outcome = useOutcome();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const title = KIND_COPY.keka.title;

  const item = held ?? live ?? cached;
  if (!item) return queue.isLoading ? <DetailSkeleton title={title} /> : <MissingItem title={title} />;

  const name = nameOr(item.employee_name, 'Employee');
  const ref = reimbursementRef(item);
  const reup = lastReupload(item);
  const canDecide = kekaIsPending(item, userId);
  const why = textOr(item.rejection_reason);
  const status = kekaStatus(item);
  const mine = !!userId && textOr(item.keka_owner_user_id) === userId;

  const close = () => {
    setRejecting(false);
    router.back();
  };
  const run = (decision: Decision, text?: string) => {
    setHeld(item);
    decide.mutate(decision === 'approve' ? { id: item.id, decision } : { id: item.id, decision, reason: text }, {
      onSuccess: () => {
        noteDecision(`keka:${item.id}`, userId, decision);
        setRejecting(false);
        outcome.show(
          {
            decision,
            title: decidedTitle(title, decision),
            subtitle: decision === 'approve' ? 'It goes to Accounts next.' : rejectedLine(name, true),
            rows: [
              { key: 'who', label: 'From', value: name },
              { key: 'amount', label: 'Amount', value: inr(item.amount) },
              { key: 'for', label: 'For', value: purposeLabel(item.purpose) },
              outcomeStatus(decision),
            ],
          },
          decision === 'reject',
        );
      },
      onError: (e) => {
        setHeld(null);
        explainDecisionError(e, close);
      },
    });
  };

  return (
    <>
      <DecisionScreen
        title={title}
        decision={
          canDecide && !outcome.done
            ? {
                // The swipe is the confirm the web asks for; the line above it says where the claim goes next.
                onApprove: () => run('approve'),
                onReject: () => {
                  setReason('');
                  setRejecting(true);
                },
                approving: decide.isPending && decide.variables?.decision === 'approve',
                disabled: decide.isPending,
                note: 'Approving sends it to Accounts next.',
              }
            : null
        }>
        <RequestHero kind="keka" value={inr(item.amount)} amount={finiteAmount(item.amount)} caption={purposeLabel(item.purpose)} />
        <WhoCards
          from={requesterItem(name, sentLine(item.created_at, now))}
          // The project owner's step: you (yours to decide, or your code), else the code's owner by name.
          to={
            canDecide || mine
              ? deciderItem({ mine: true, me: me?.name, role: 'Project owner' })
              : personItem(textOr(item.keka_owner_name) || 'Project owner', 'Project owner')
          }
        />
        {/* The bill is what the owner checks before deciding, so it sits right under the people. */}
        <ReceiptButton id={item.id} fileBase={ref} fileName={item.receipt_name} />
        {reup ? (
          <NoteCard
            tone="warning"
            label="Amount changed"
            text={`From ${inr(reup.previousAmount)} to ${inr(reup.amount)}${textOr(reup.note) ? ` — “${textOr(reup.note)}”` : '.'}`}
          />
        ) : null}
        <DetailsCard
          status={status}
          fields={[
            { label: 'Project code', value: textOr(item.keka_code) || '—', hint: textOr(item.project_name) || undefined },
            // The claim number is for looking it up later, not for deciding.
            ...(!canDecide ? [{ label: 'Claim number', value: ref }] : []),
            ...(item.status === 'rejected' && why ? [{ label: 'Why rejected', value: why, tone: 'danger' as const }] : []),
          ]}
        />
        {/* A claim still waiting has no history beyond the hero, unless its amount changed. */}
        {item.status !== 'pending_keka_approval' || reup ? <Timeline events={kekaEvents(item, userId)} today={today} /> : null}
      </DecisionScreen>
      <RejectSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this claim?"
        subtitle={`${name} will see your reason.`}
        note={reason}
        onChangeNote={setReason}
        minLength={1}
        confirmLabel="Reject claim"
        placeholder="Why it can’t be approved"
        busy={decide.isPending}
        onSubmit={() => run('reject', reason.trim())}
      />
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}

// ── Petty cash waiting on me (its only approve / reject screen) ──────────────
function PettyItem({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const now = useNow();
  const user = useSession((s) => s.user);
  const allowed = roleSeesPettyCash(user);
  const overview = usePettyCashOverview(allowed);
  // Frozen while a decision is on its way, so the screen doesn't change under the success sheet.
  const [held, setHeld] = useState<PettyCashRequest | null>(null);
  const outcome = useOutcome();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const title = KIND_COPY.petty.title;

  const decide = useMutation({
    mutationFn: ({ rid, decision, why }: { rid: string; decision: Decision; why?: string }) =>
      unwrap(decision === 'approve' ? approvePettyCashRequest(rid) : rejectPettyCashRequest(rid, why ?? '')),
    onSuccess: (_r, { rid, decision }) => {
      // Out of the Inbox at once (Accounts clears both stages in one step); the refetch brings the server's status.
      const next = decision === 'reject' ? 'rejected' : isPettyCashApprover(user) ? 'ready_for_payment' : 'pending_accounts_approval';
      qc.setQueriesData<PettyCashOverview>({ queryKey: ['petty', 'overview'] }, (old) =>
        old && Array.isArray(old.requests) ? { ...old, requests: old.requests.map((x) => (x && x.id === rid ? { ...x, status: next } : x)) } : old,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['petty'] });
    },
  });

  const live = list(overview.data?.requests).find((x) => !!x && x.id === id) ?? null;
  const r = held ?? live;

  if (!allowed) return <MissingItem title={title} />;
  if (!r) {
    if (overview.isLoading) return <DetailSkeleton title={title} />;
    if (overview.isError && !overview.data) {
      return (
        <Screen header={<NavHeader title={title} />}>
          <ErrorState message={overview.error?.message || 'Petty cash couldn’t be loaded.'} onRetry={() => void overview.refetch()} />
        </Screen>
      );
    }
    return <MissingItem title={title} />;
  }

  const name = nameOr(r.employeeName, 'Employee');
  const heads = list(r.departments).filter((h) => !!h && typeof h === 'object');
  // Same rule as the Petty cash screen: waiting on the project owner's stage, not an extra claim,
  // mine to approve, and not my own request.
  const canDecide = r.status === 'pending_approval' && r.kind !== 'excess' && canApprove(user, r) && !isOwnRequest(user, r);
  const raisedBy = r.onBehalf ? textOr(r.requestedByName) : '';
  const why = textOr(r.rejectionReason);
  const status = pettyStatus(r);
  // Where it goes after the approval: Accounts approve straight to "ready to pay".
  const next = isPettyCashApprover(user) ? 'It is then ready to pay.' : 'It goes to Accounts next.';

  const close = () => {
    setRejecting(false);
    router.back();
  };
  const run = (decision: Decision, text?: string) => {
    setHeld(r);
    decide.mutate(
      { rid: r.id, decision, why: text },
      {
        onSuccess: () => {
          // Approve already buzzed "success" when the swipe confirmed it; a reject buzzes "warning".
          if (decision === 'reject') haptic.warning();
          noteDecision(`petty:${r.id}`, user?.id, decision);
          setRejecting(false);
          outcome.show(
            {
              decision,
              title: decidedTitle(title, decision),
              subtitle: decision === 'approve' ? next : rejectedLine(name, !!text),
              rows: [
                { key: 'who', label: 'From', value: name },
                { key: 'amount', label: 'Amount', value: inr(r.amount) },
                { key: 'for', label: 'For', value: textOr(r.projectName) || textOr(r.kekaCode) || 'Small office expenses' },
                outcomeStatus(decision),
              ],
            },
            decision === 'reject',
          );
        },
        onError: (e) => {
          haptic.error();
          setHeld(null);
          explainDecisionError(e, close);
        },
      },
    );
  };

  return (
    <>
      <DecisionScreen
        title={title}
        decision={
          canDecide && !outcome.done
            ? {
                // The swipe is the confirm the Petty cash screen asks for; the line above it says what happens next.
                onApprove: () => run('approve'),
                onReject: () => {
                  setReason('');
                  setRejecting(true);
                },
                approving: decide.isPending && decide.variables?.decision === 'approve',
                disabled: decide.isPending,
                note: isPettyCashApprover(user) ? 'Approving makes it ready to pay.' : 'Approving sends it to Accounts next.',
              }
            : null
        }>
        <RequestHero
          kind="petty"
          value={inr(r.amount)}
          amount={finiteAmount(r.amount)}
          // What this one is for: its project (the module's tagline only when there is none).
          caption={textOr(r.projectName) || 'Small office expenses'}
        />
        <WhoCards
          from={requesterItem(name, sentLine(r.createdAt, now))}
          to={deciderItem({ mine: canDecide, me: user?.name, status: r.status === 'pending_approval' ? undefined : status.label })}
        />
        {textOr(r.remarks) ? <NoteCard label="Note" text={textOr(r.remarks)} /> : null}
        <DetailsCard
          status={status}
          fields={[
            // The project's name is the hero's caption, so it isn't repeated here.
            { label: 'Project code', value: textOr(r.kekaCode) || '—' },
            ...(raisedBy ? [{ label: 'Raised by', value: raisedBy }] : []),
            ...(r.status === 'rejected' && why ? [{ label: 'Why rejected', value: why, tone: 'danger' as const }] : []),
          ]}
        />
        {heads.length ? (
          <DetailsCard title="What it’s for" fields={heads.map((h) => ({ label: textOr(h.departmentName) || 'Other', value: inr(h.amount) }))} />
        ) : null}
      </DecisionScreen>
      <RejectSheet
        visible={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this request?"
        subtitle={`Add a reason if you like. ${name} will see it.`}
        note={reason}
        onChangeNote={setReason}
        minLength={0}
        placeholder="Why it can’t be approved"
        busy={decide.isPending}
        onSubmit={() => run('reject', reason.trim())}
      />
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}

// ── Someone waiting for me at reception ──────────────────────────────────────
type VisitorView = Pick<WaitingVisitor, 'id' | 'visitorName' | 'visitorMobile' | 'purpose' | 'status' | 'createdAt'> & { photoUrl?: string; photoPurged?: boolean };

function VisitorItem({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const now = useNow();
  const today = useTodayIst();
  const { compact } = useLayout();
  const user = useSession((s) => s.user);
  const allowed = canSeeVisitors(user);
  // The Visitors screen's own read: it carries the check-in photo. Until it answers, the Inbox's
  // copy of the visitor is shown (no photo yet).
  const mine = useMyVisitors({ enabled: allowed });
  const [cached] = useState<VisitorView | null>(() => {
    const rows = qc.getQueryData<WaitingVisitor[]>(inboxKeys.visitors(user?.id));
    return (Array.isArray(rows) ? rows : []).find((v) => !!v && v.id === id) ?? null;
  });
  const decide = useDecideVisit();
  const outcome = useOutcome();
  // Frozen while a decision is on its way: the visit leaves the waiting list before the screen closes.
  const [held, setHeld] = useState<VisitorView | null>(null);
  const [askReject, setAskReject] = useState(false);
  const title = KIND_COPY.visitors.title;

  const pending = Array.isArray(mine.data?.pending) ? mine.data.pending : [];
  const live: VisitorView | null = pending.find((v) => !!v && v.id === id) ?? null;
  const visit = held ?? live ?? (mine.data ? null : cached);

  if (!allowed) return <MissingItem title={title} />;
  if (!visit) return mine.isLoading ? <DetailSkeleton title={title} /> : <MissingItem title={title} />;

  const name = nameOr(visit.visitorName, 'Visitor');
  const timedOut = visit.status === 'no_response';
  const arrivedAt = timeValue(visit.createdAt);
  // How long they have stood at reception ('12m', '1h 5m'), ticking with the minute.
  const waited = arrivedAt ? durationLabel((now - arrivedAt) / 60000) : '—';

  const close = () => router.back();
  const run = (decision: Decision) => {
    setHeld(visit);
    decide.mutate(
      { id: visit.id, decision },
      {
        onSuccess: () => {
          // Let in already buzzed "success" when the swipe confirmed it; turning away buzzes "warning".
          if (decision === 'reject') haptic.warning();
          setAskReject(false);
          noteDecision(`visitors:${visit.id}`, user?.id, decision);
          outcome.show({
            decision,
            title: decision === 'approve' ? `${name} can come in` : `${name} was turned away`,
            subtitle: decision === 'approve' ? undefined : 'They’ll be told at the desk and on WhatsApp.',
            rows: [
              { key: 'for', label: 'Here for', value: textOr(visit.purpose) || 'Not given' },
              outcomeStatus(decision, { approve: 'Let in', reject: 'Turned away' }),
            ],
          });
        },
        onError: (e) => {
          haptic.error();
          setHeld(null);
          setAskReject(false);
          explainDecisionError(e, close);
        },
      },
    );
  };
  // Turning someone away tells them at the desk and on WhatsApp, so it asks first with a swipe
  // (ConfirmSheet, as the desk does; Alert does nothing on web).
  const first = name.split(/\s+/)[0] || name;

  return (
    <>
      <DecisionScreen
        title={title}
        decision={
          outcome.done
            ? null
            : {
                onApprove: () => run('approve'),
                onReject: () => setAskReject(true),
                approving: decide.isPending && decide.variables?.decision === 'approve',
                disabled: decide.isPending,
                approveLabel: 'Let in',
                rejectLabel: 'Turn away',
                note: `${first} gets a WhatsApp with your answer.`,
              }
        }>
        <VisitorHero
          photo={
            <VisitPhoto visit={{ id: visit.id, visitorName: name, photoUrl: visit.photoUrl ?? '', photoPurged: !!visit.photoPurged }} size={compact ? 56 : 64} />
          }
          waited={waited}
          // When they arrived, once; the chip says whether they have been left without an answer.
          arrived={visitorArrived(visit, today, { noAnswer: false })}
          timedOut={timedOut}
        />
        <WhoCards from={requesterItem(name, 'Visitor')} to={deciderItem({ mine: true, me: user?.name, role: 'Their host' })} />
        <DetailsCard
          fields={[
            { label: 'Here for', value: textOr(visit.purpose) || 'Not given' },
            { label: 'Phone', value: phoneLabel(visit.visitorMobile) },
          ]}
        />
      </DecisionScreen>
      <ConfirmSheet
        visible={askReject}
        onClose={() => {
          if (!decide.isPending) setAskReject(false);
        }}
        title={`Turn ${first} away?`}
        from={{ title: 'You', subtitle: 'Their host', avatar: { name: user?.name || 'You' } }}
        to={{ title: name, subtitle: 'Visitor', avatar: { name } }}
        detailsTitle="Visit"
        confirmLabel="Swipe to turn away"
        onConfirm={() => run('reject')}
        loading={decide.isPending && decide.variables?.decision === 'reject'}
        note={`${first} is told at the desk and gets a WhatsApp that you can’t meet them.`}>
        <SummaryCard hideEmpty rows={[{ label: 'Here for', value: textOr(visit.purpose) || null }]} />
      </ConfirmSheet>
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}
