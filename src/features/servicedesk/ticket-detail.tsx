// One service desk request, for whoever runs the desk (web: one row of ServiceDesk, dash.html:21321–21362
// with its Accept & Assign / Reject modals 21372–21409). Served at /admin/service-desk/<id> and, for
// what is waiting on the viewer, at /inbox/desk-it/<id> (the same screen).
//
// Payno detail order: NavHeader (the kind) → SummaryHero (reference, what it is, status, when) → one
// notice (why it was rejected / how it was resolved / who approves it) → From → To (who raised it →
// who has it) → call / WhatsApp / email the requester → SummaryCard → their words → Progress.
//
// The sticky bar is the row's Action column for this viewer (features/servicedesk/access rowAction):
//   accept / approve  "Accept & assign" (or "Approve & assign") + Reject
//   status            "Change status" + Reject (admin requests and complaints)
// Every action messages people, so each ends in a ConfirmSheet with SwipeToConfirm that says who is
// told; then a SuccessSheet. Assigning is two writes (POST /tasks, then PUT /tickets/:id); if the
// second fails the screen says the task exists, and trying again is safe (the server de-dupes the task
// by ticket).

import { Redirect, useRouter } from 'expo-router';
import { ArrowRightLeft, CircleDot, Mail, MessageCircle, Phone, SearchX, UserRound, UserRoundCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { ApiRequestError } from '@/api/client';
import { type DeskTicket, HalfAssignedError, useAssignTicket, useRejectTicket, useSetRequestStatus } from '@/api/servicedesk';
import { useTodayIst } from '@/features/attendance/use-now';
import { noteDecision } from '@/features/inbox/decided';
import type { InboxDetailProps } from '@/features/plugin-types';
import { canStillReject, isRequestType, REQUEST_STATUSES, type RowAction, rowAction } from '@/features/servicedesk/access';
import {
  categoryLabelFor,
  deptOf,
  firstName,
  isAssignable,
  kindIcon,
  kindLabel,
  raiserOf,
  raiserReachable,
  refOf,
  statusWords,
  whatOf,
} from '@/features/servicedesk/format';
import { type Desk, useDesk } from '@/features/servicedesk/use-desk';
import { type PickPerson, PersonPicker } from '@/features/shared/person-picker';
import { dayTime, priorityLabel, raisedOn, ticketStatus } from '@/features/support/format';
import { useAccess } from '@/lib/use-access';
import { palette, radius, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  ActionRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  EventTimeline,
  FromToCards,
  type FromToItem,
  haptic,
  IconAction,
  MenuSheet,
  NavHeader,
  Screen,
  SectionHeader,
  Skeleton,
  StatusPill,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  type SummaryItem,
  Text,
  TextField,
  type TimelineEvent,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** iOS presents one Modal at a time: wait for a closing sheet before the next one opens. */
const SHEET_SWAP_MS = 400;

const STATUS_ICON = { open: CircleDot, in_progress: ArrowRightLeft, resolved: UserRoundCheck, closed: UserRoundCheck } as const;

const NOUN: Record<string, string> = { ticket: 'ticket', asset: 'equipment request', admin_request: 'office request', complaint: 'complaint' };

type Outcome = { title: string; subtitle: string; rows: SummaryItem[] };

function Hero({ t, today }: { t: DeskTicket; today: string }) {
  const st = ticketStatus(t.status);
  return (
    <SummaryHero icon={kindIcon(t)} module="support" label={refOf(t)}>
      <View style={styles.heroText}>
        <Text variant="heading" color={palette.ink} numberOfLines={4} accessibilityRole="header">
          {whatOf(t)}
        </Text>
        <View style={styles.heroMeta}>
          <StatusPill label={st.label} tone={st.tone} />
          <Text variant="caption" muted style={styles.shrink}>
            Raised {raisedOn(t, today)}
          </Text>
        </View>
      </View>
    </SummaryHero>
  );
}

/** Call, WhatsApp and email the person who raised it (only what they gave). */
function ContactRow({ t }: { t: DeskTicket }) {
  const phone = s(t.fromPhone);
  const dial = phone.replace(/[^\d+]/g, '');
  const wa = dial.replace(/\D/g, '');
  const email = s(t.fromEmail);
  if (!dial && !email) return null;
  const name = firstName(raiserOf(t));
  return (
    <View style={styles.contact}>
      {dial ? <IconAction icon={Phone} label={`Call ${name}`} onPress={() => void Linking.openURL(`tel:${dial}`).catch(() => {})} /> : null}
      {wa.length >= 10 ? (
        <IconAction
          icon={MessageCircle}
          label="WhatsApp"
          onPress={() => void Linking.openURL(`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`).catch(() => {})}
        />
      ) : null}
      {email ? <IconAction icon={Mail} label="Email" onPress={() => void Linking.openURL(`mailto:${email}`).catch(() => {})} /> : null}
    </View>
  );
}

function events(t: DeskTicket, today: string): TimelineEvent[] {
  const at = (iso?: string) => dayTime(iso, today) || null;
  const list: (TimelineEvent & { when: string })[] = [{ key: 'raised', label: 'Received', at: raisedOn(t, today), tone: 'neutral', when: s(t.createdAt) || s(t.date) }];
  if (t.approvedAt) list.push({ key: 'approved', label: 'Approved', at: at(t.approvedAt), by: s(t.approvedBy) || null, tone: 'good', when: t.approvedAt });
  if (t.acceptedAt) list.push({ key: 'accepted', label: 'Accepted', at: at(t.acceptedAt), by: s(t.assignedTo) ? `Assigned to ${s(t.assignedTo)}` : isRequestType(t) ? s(t.statusUpdatedBy) || null : null, tone: 'info', when: t.acceptedAt });
  if (t.resolvedAt || t.status === 'resolved') {
    list.push({
      key: 'resolved',
      label: 'Resolved',
      at: at(t.resolvedAt),
      by: s(t.resolvedBy) || (isRequestType(t) ? s(t.statusUpdatedBy) : '') || null,
      note: t._resolvedFromTask ? 'Their task is finished' : s(t.resolutionNote) || s(t.resolution) || null,
      tone: 'good',
      when: s(t.resolvedAt) || '9999',
    });
  }
  if (t.status === 'closed' && t.statusUpdatedAt) list.push({ key: 'closed', label: 'Closed', at: at(t.statusUpdatedAt), by: s(t.statusUpdatedBy) || null, tone: 'good', when: t.statusUpdatedAt });
  if (t.rejectedAt) list.push({ key: 'rejected', label: 'Rejected', at: at(t.rejectedAt), by: s(t.rejectedBy) || null, tone: 'bad', when: t.rejectedAt });
  if (t.status === 'cancelled') list.push({ key: 'cancelled', label: 'Cancelled by the employee', at: at(t.cancelledAt), tone: 'neutral', when: s(t.cancelledAt) || '9999' });
  return list.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0)).map(({ when: _w, ...e }) => e);
}

function details(t: DeskTicket): SummaryItem[] {
  const isItem = t.category === 'asset' || t.category === 'admin_request';
  return [
    ...(isItem ? [] : [{ key: 'type', label: 'Type', value: categoryLabelFor(t) }]),
    { key: 'prio', label: t.category === 'ticket' ? 'Priority' : 'Urgency', value: priorityLabel(t) },
    ...(isItem ? [{ key: 'qty', label: 'Quantity', value: s(t.quantity) || '1' }] : []),
    { key: 'dept', label: 'Department', value: deptOf(t) },
    { key: 'code', label: 'Project code', value: s(t.kekaCode) },
    { key: 'phone', label: 'Phone', value: s(t.fromPhone) },
    { key: 'email', label: 'Email', value: s(t.fromEmail) },
    { key: 'behalf', label: 'Raised by', value: s(t.raisedOnBehalfBy) ? `${s(t.raisedOnBehalfBy)}, for them` : '' },
  ].filter((r) => r.value != null && r.value !== '');
}

/** Where it goes: who has it now, or who will. */
function handlerItem(t: DeskTicket, desk: Desk, action: RowAction): FromToItem {
  const who = s(t.assignedTo);
  if (who) return { title: who, subtitle: t.status === 'resolved' || t.status === 'closed' ? 'Did the work' : 'Working on it', avatar: { name: who } };
  if (isRequestType(t)) {
    if (action === 'status' && t.status === 'open') return { title: 'You', subtitle: 'Handle it', icon: UserRoundCheck, module: 'support' };
    const by = s(t.statusUpdatedBy);
    return by ? { title: by, subtitle: 'Last update', avatar: { name: by } } : { title: 'Super Admin', subtitle: 'Handles it', icon: UserRoundCheck, module: 'support' };
  }
  if (t.status === 'pending_approval') {
    if (desk.approver) return { title: 'You', subtitle: 'Approve it', icon: UserRoundCheck, module: 'support' };
    return { title: desk.approverName || 'Admin', subtitle: 'Approves it', icon: UserRoundCheck, module: 'support' };
  }
  if (t.status === 'rejected') return { title: s(t.rejectedBy) || 'Service desk', subtitle: 'Rejected it', icon: UserRound, module: 'support' };
  return { title: 'Not assigned yet', subtitle: 'IT & Admin team', icon: UserRound, module: 'support' };
}

function notice(t: DeskTicket, action: RowAction, desk: Desk) {
  if (t.status === 'rejected') {
    return <Banner tone="danger" title={s(t.rejectedBy) ? `Rejected by ${s(t.rejectedBy)}` : 'Rejected'} message={s(t.rejectionReason) || undefined} />;
  }
  if (t.status === 'cancelled') return <Banner tone="info" title="Cancelled by the employee" message="Nothing to do here." />;
  if (action === 'awaiting') {
    return (
      <Banner
        tone="info"
        title={desk.approverName ? `Waiting for approval by ${desk.approverName}` : 'Waiting for Admin approval'}
        message="Once it’s approved, it can be assigned to the IT & Admin team."
      />
    );
  }
  const res = s(t.resolutionNote) || s(t.resolution);
  if ((t.status === 'resolved' || t.status === 'closed') && res) return <Banner tone="success" title="How it was resolved" message={res} />;
  return null;
}

function DetailSkeleton() {
  const { gap } = useLayout();
  return (
    <View style={{ gap }}>
      <Skeleton height={168} radius={radius.xxl} />
      <Skeleton height={136} radius={radius.xl} />
      <Skeleton height={160} radius={radius.xl} />
    </View>
  );
}

function errorText(e: unknown) {
  return (e instanceof Error && e.message) || 'Please try again.';
}

/** The whole screen. `via` only changes where Done goes back to. */
export function TicketDetail({ id }: { id: string; via?: 'desk' | 'inbox' }) {
  const router = useRouter();
  const access = useAccess();
  const user = access.user;
  const allowed = !!user && access.web('servicedesk');
  const desk = useDesk({ enabled: allowed, people: true });
  const today = useTodayIst();
  const { gap } = useLayout();

  const assign = useAssignTicket();
  const reject = useRejectTicket();
  const setStatus = useSetRequestStatus();

  const [picking, setPicking] = useState(false);
  const [assignee, setAssignee] = useState<PickPerson | null>(null);
  const [confirmAssign, setConfirmAssign] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [statusMenu, setStatusMenu] = useState(false);
  const [nextStatus, setNextStatus] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const t = desk.items.find((x) => x.id === id);
  // Once decided here, the bar goes away at once (the list refreshes behind the success sheet).
  const action: RowAction = t && !outcome ? rowAction(t, desk.role, desk.approver) : 'none';
  const busy = assign.isPending || reject.isPending || setStatus.isPending;

  if (user && !allowed) return <Redirect href="/" />;

  const raiser = t ? raiserOf(t) : '';
  // Invited but not signed up yet: the server has nobody to email or WhatsApp.
  const reachable = !!t && raiserReachable(t);
  const approval = !!t && action === 'approve';
  const kind = NOUN[String(t?.category)] ?? 'request';

  const finish = (o: Outcome, decision: 'approve' | 'reject') => {
    haptic.success();
    noteDecision(`desk-it:${id}`, user?.id, decision);
    setOutcome(o);
    setTimeout(() => setDoneOpen(true), SHEET_SWAP_MS);
  };

  const fail = (title: string, e: unknown) => {
    haptic.error();
    const gone = e instanceof ApiRequestError && (e.status === 404 || e.status === 409);
    Alert.alert(gone ? 'Already handled' : title, errorText(e), [{ text: 'OK', onPress: gone ? () => void desk.refetch() : undefined }]);
  };

  const sendAssign = () => {
    if (!t || !assignee || busy) return;
    const name = assignee.name;
    assign.mutate(
      { ticket: t, assignee: name },
      {
        onSuccess: (r) => {
          setConfirmAssign(false);
          finish(
            {
              title: r.approval ? 'Approved and assigned' : `Assigned to ${firstName(name)}`,
              subtitle: r.approval ? `${name} has the task.${reachable ? ` ${firstName(raiser)} is told it’s approved.` : ''}` : `${name} has it in their tasks. Finishing it resolves the ticket.`,
              rows: [
                { key: 'ref', label: 'Reference', value: refOf(t) },
                { key: 'what', label: kindLabel(t), value: whatOf(t) },
                { key: 'to', label: 'Assigned to', value: name },
                { key: 'status', label: 'Status', value: 'In progress', status: 'info' },
              ],
            },
            'approve',
          );
        },
        onError: (e) => {
          if (e instanceof HalfAssignedError) {
            setConfirmAssign(false);
            haptic.warning();
            Alert.alert(
              'Task created, ticket not updated',
              `${e.assignee} has the task, but the ticket couldn’t be marked as assigned: ${e.message} Try again — the same task is reused.`,
              [{ text: 'OK', onPress: () => void desk.refetch() }],
            );
            return;
          }
          fail('Couldn’t assign it', e);
        },
      },
    );
  };

  const sendReject = () => {
    if (!t || !reason.trim() || busy) return;
    reject.mutate(
      { id: t.id, reason },
      {
        onSuccess: () => {
          setRejecting(false);
          finish(
            {
              title: 'Request rejected',
              subtitle: reachable ? `${firstName(raiser)} sees your reason on their request.` : `${firstName(raiser)} sees your reason once they sign in.`,
              rows: [
                { key: 'ref', label: 'Reference', value: refOf(t) },
                { key: 'what', label: kindLabel(t), value: whatOf(t) },
                { key: 'why', label: 'Reason', value: reason.trim() },
                { key: 'status', label: 'Status', value: 'Rejected', status: 'failed' },
              ],
            },
            'reject',
          );
          setReason('');
        },
        onError: (e) => fail('Couldn’t reject it', e),
      },
    );
  };

  const sendStatus = () => {
    if (!t || !nextStatus || busy) return;
    const to = nextStatus;
    setStatus.mutate(
      { id: t.id, status: to },
      {
        onSuccess: () => {
          setConfirmStatus(false);
          const st = ticketStatus(to);
          finish(
            {
              title: `Marked as ${statusWords(to).toLowerCase()}`,
              subtitle: reachable ? `${firstName(raiser)} is told by email and WhatsApp.` : 'Saved. They aren’t signed up yet, so no message was sent.',
              rows: [
                { key: 'ref', label: 'Reference', value: refOf(t) },
                { key: 'what', label: kindLabel(t), value: whatOf(t) },
                { key: 'status', label: 'Status', value: st.label, status: st.tone },
              ],
            },
            'approve',
          );
        },
        onError: (e) => fail('Couldn’t change the status', e),
      },
    );
  };

  const openPicker = () => {
    if (busy) return;
    setPicking(true);
  };

  const footer =
    t && (action === 'accept' || action === 'approve') ? (
      <ActionBar note={desk.users.isError ? 'Couldn’t load the IT & Admin team. Pull down to try again.' : null}>
        <ActionRow context="bar">
          <Button title="Reject" variant="ghost" icon={<X />} disabled={busy} onPress={() => setRejecting(true)} />
          <Button title={approval ? 'Approve & assign' : 'Accept & assign'} icon={<UserRoundCheck />} disabled={busy} onPress={openPicker} />
        </ActionRow>
      </ActionBar>
    ) : t && action === 'status' ? (
      <ActionBar>
        {canStillReject(t) ? (
          <ActionRow context="bar">
            <Button title="Reject" variant="ghost" icon={<X />} disabled={busy} onPress={() => setRejecting(true)} />
            <Button title="Change status" icon={<ArrowRightLeft />} disabled={busy} onPress={() => setStatusMenu(true)} />
          </ActionRow>
        ) : (
          <Button title="Change status" icon={<ArrowRightLeft />} disabled={busy} onPress={() => setStatusMenu(true)} />
        )}
      </ActionBar>
    ) : undefined;

  const done = () => {
    setDoneOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace('/admin/service-desk');
  };

  const statusFrom: FromToItem | undefined = t ? { title: statusWords(t.status), subtitle: 'Now', icon: CircleDot, module: 'support' } : undefined;
  const statusTo: FromToItem | undefined = nextStatus
    ? { title: statusWords(nextStatus), subtitle: 'New status', icon: STATUS_ICON[nextStatus as keyof typeof STATUS_ICON] ?? CircleDot, module: 'support' }
    : undefined;

  return (
    <Screen header={<NavHeader title={t ? kindLabel(t) : 'Request'} />} onRefresh={() => desk.refetch()} footer={footer}>
      {t ? (
        <View style={{ gap }}>
          <Hero t={t} today={today} />
          {notice(t, action, desk)}
          <FromToCards
            from={{ title: raiser, subtitle: deptOf(t) || 'Raised it', avatar: { name: raiser } }}
            to={handlerItem(t, desk, action)}
          />
          <ContactRow t={t} />
          <SummaryCard title="Details" rows={details(t)} hideEmpty />
          {s(t.desc) || s(t.reason) ? (
            <Card tone="frostStrong" style={styles.body}>
              <Text variant="labelStrong" muted>
                {t.category === 'asset' || t.category === 'admin_request' ? 'Why they need it' : 'What they said'}
              </Text>
              <Text variant="body" selectable>
                {s(t.desc) || s(t.reason)}
              </Text>
            </Card>
          ) : null}
          <View style={styles.progress}>
            <SectionHeader title="Progress" />
            <Card tone="frostStrong">
              <EventTimeline events={events(t, today)} />
            </Card>
          </View>
        </View>
      ) : (!desk.tickets.data && !desk.tickets.isError) || (desk.tickets.isFetching && !desk.tickets.isError) || desk.approverLoading ? (
        <DetailSkeleton />
      ) : desk.tickets.isError && !desk.tickets.data ? (
        <ErrorState message={desk.tickets.error?.message ?? ''} onRetry={() => void desk.refetch()} />
      ) : (
        <EmptyState icon={<SearchX color={palette.textMuted} />} title="Request not found" message="It may have been removed, or it isn’t one you handle. Pull down to refresh." />
      )}

      {/* Accept / Approve & assign: 1. who (the IT & Admin team; people on leave today can't be chosen) */}
      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Assign to"
        subtitle={desk.itDept ? `${desk.itDept.name} team` : 'IT Admins'}
        people={desk.users.data}
        loading={desk.users.isPending}
        filter={(p) => isAssignable(p, desk.itDept)}
        recentKey="servicedesk.assign"
        selectedId={assignee?.id}
        emptyMessage="No one in the IT & Admin team can take it."
        onPick={(p) => {
          setAssignee(p);
          setTimeout(() => setConfirmAssign(true), SHEET_SWAP_MS);
        }}
      />

      {/* 2. confirm — it creates a task and messages people */}
      {t ? (
        <ConfirmSheet
          visible={confirmAssign && !!assignee}
          onClose={() => setConfirmAssign(false)}
          title={approval ? 'Approve and assign?' : 'Assign this ticket?'}
          from={{ title: whatOf(t), subtitle: refOf(t), icon: kindIcon(t), module: 'support' }}
          to={{ title: assignee?.name ?? '', subtitle: assignee?.jobTitle || 'IT & Admin', avatar: { name: assignee?.name ?? '' } }}
          detailsTitle="Request"
          confirmLabel={approval ? 'Swipe to approve and assign' : 'Swipe to assign'}
          onConfirm={sendAssign}
          loading={assign.isPending}
          note={`${assignee?.name ?? 'They'} get${assignee ? 's' : ''} the task by email and WhatsApp.${approval && reachable ? ` ${firstName(raiser)} is told it’s approved.` : ''}`}>
          <View style={styles.sheetBody}>
            <SummaryCard
              rows={[
                { key: 'from', label: 'Raised by', value: raiser },
                { key: 'dept', label: 'Department', value: deptOf(t) },
                { key: 'code', label: 'Project code', value: s(t.kekaCode) },
                { key: 'prio', label: t.category === 'ticket' ? 'Priority' : 'Urgency', value: priorityLabel(t) },
              ]}
              hideEmpty
            />
            <AccountRow
              icon={UserRound}
              module="support"
              title={assignee?.name ?? 'Choose a person'}
              sub="Assigned to"
              onChange={
                assign.isPending
                  ? undefined
                  : () => {
                      setConfirmAssign(false);
                      setTimeout(() => setPicking(true), SHEET_SWAP_MS);
                    }
              }
            />
          </View>
        </ConfirmSheet>
      ) : null}

      {/* Reject: the reason the requester sees, then the swipe */}
      {t ? (
        <ConfirmSheet
          visible={rejecting}
          onClose={() => setRejecting(false)}
          title={`Reject this ${kind}?`}
          from={{ title: 'You', subtitle: 'Rejecting it', avatar: { name: user?.name || 'You' } }}
          to={{ title: raiser, subtitle: 'Gets your reason', avatar: { name: raiser } }}
          confirmLabel="Swipe to reject"
          onConfirm={sendReject}
          loading={reject.isPending}
          disabled={!reason.trim()}
          note={reachable ? `${firstName(raiser)} gets an email and WhatsApp with your reason.` : `${firstName(raiser)} isn’t signed up yet, so gets no message. They see your reason once they sign in.`}>
          <TextField
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Why it can’t go ahead"
            multiline
            maxLength={500}
            counter
            hint="Required. The requester sees this reason on their request."
          />
        </ConfirmSheet>
      ) : null}

      {/* Admin requests and complaints: pick the new status, then confirm (the raiser is told every time) */}
      {t ? (
        <MenuSheet
          visible={statusMenu}
          onClose={() => setStatusMenu(false)}
          title="Change status"
          subtitle={`Now: ${statusWords(t.status)}`}
          items={[
            ...REQUEST_STATUSES.filter((st) => st !== t.status).map((st) => ({
              key: st,
              label: statusWords(st),
              icon: STATUS_ICON[st],
              onPress: () => {
                setNextStatus(st);
                setTimeout(() => setConfirmStatus(true), SHEET_SWAP_MS);
              },
            })),
            ...(canStillReject(t)
              ? [
                  {
                    key: 'reject',
                    label: 'Reject…',
                    icon: X,
                    tone: 'danger' as const,
                    onPress: () => {
                      setTimeout(() => setRejecting(true), SHEET_SWAP_MS);
                    },
                  },
                ]
              : []),
          ]}
        />
      ) : null}
      {t && statusFrom && statusTo ? (
        <ConfirmSheet
          visible={confirmStatus}
          onClose={() => setConfirmStatus(false)}
          title={`Mark as ${statusWords(nextStatus ?? '').toLowerCase()}?`}
          from={statusFrom}
          to={statusTo}
          detailsTitle={kindLabel(t)}
          confirmLabel={`Swipe to mark ${statusWords(nextStatus ?? '').toLowerCase()}`}
          onConfirm={sendStatus}
          loading={setStatus.isPending}
          note={reachable ? `${firstName(raiser)} gets an email and WhatsApp about this change.` : `${firstName(raiser)} isn’t signed up yet, so gets no message.`}>
          <SummaryCard
            rows={[
              { key: 'what', label: 'Request', value: whatOf(t) },
              { key: 'from', label: 'Raised by', value: raiser },
              { key: 'ref', label: 'Reference', value: refOf(t) },
            ]}
          />
        </ConfirmSheet>
      ) : null}

      <SuccessSheet visible={doneOpen && !!outcome} onClose={done} onPrimary={done} title={outcome?.title ?? ''} subtitle={outcome?.subtitle}>
        {outcome ? <SummaryCard rows={outcome.rows} /> : null}
      </SuccessSheet>
    </Screen>
  );
}

/** /inbox/desk-it/<id> (the Inbox plug-in's Detail). */
export function InboxTicketDetail({ id }: InboxDetailProps) {
  return <TicketDetail id={id} via="inbox" />;
}

const styles = themedStyles(() => ({
  shrink: { flexShrink: 1 },
  heroText: { gap: space.xs },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xs },
  body: { gap: 6 },
  progress: { gap: space.xs },
  contact: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
  sheetBody: { gap: space.sm },
}));
