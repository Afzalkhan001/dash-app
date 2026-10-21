// /inbox/desk/<id>: someone at reception still waiting for their host, answered by the desk (web: the
// board's Approve / Reject on VisitCard, dash.html:35640, POST /visitors/:id/decide). The host may be in a
// meeting, so the desk can answer for them — it is recorded as the desk user, and the visitor gets a
// WhatsApp either way (visitors.js decideVisit → visitorApproved / visitorRejected).
//
// Same frame as every Inbox decision (features/inbox/detail): the visitor's photo and how long they have
// waited, Visitor → You (for the host), the details, and the sticky bar: "Swipe to let in" (the note above
// it says who is told) over Turn away, which opens a ConfirmSheet with its own swipe. A 409 means
// somebody (the host, or another desk) answered first: say so and go back.

import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useDeskDecide, useDeskToday } from '@/api/desk';
import type { Visit } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { isDeskRole } from '@/features/desk/access';
import { hostName, isWaiting, purposeOf, sourceLabel, visitorName } from '@/features/desk/format';
import type { InboxDetailProps } from '@/features/plugin-types';
import { noteDecision } from '@/features/inbox/decided';
import {
  DecidedSheet,
  deciderItem,
  DecisionScreen,
  DetailsCard,
  DetailSkeleton,
  explainDecisionError,
  MissingItem,
  outcomeStatus,
  requesterItem,
  useOutcome,
  VisitorHero,
  WhoCards,
} from '@/features/inbox/detail';
import { timeValue, visitorArrived } from '@/features/inbox/format';
import { phoneLabel } from '@/features/visitors/format';
import { VisitPhoto } from '@/features/visitors/visit-photo';
import { durationLabel } from '@/lib/dates';
import { ConfirmSheet, haptic, SummaryCard, useLayout } from '@/ui';

export const DESK_TITLE = 'At reception';

export function DeskDecisionScreen({ id }: InboxDetailProps) {
  const router = useRouter();
  const now = useNow();
  const today = useTodayIst();
  const { compact } = useLayout();
  const user = useSession((s) => s.user);
  const allowed = isDeskRole(user);
  const board = useDeskToday({ enabled: allowed });
  const decide = useDeskDecide();
  const outcome = useOutcome();
  // Frozen while a decision is on its way: the visit leaves the waiting list before the screen closes.
  const [held, setHeld] = useState<Visit | null>(null);
  const [askReject, setAskReject] = useState(false);

  const visits = board.data?.visits ?? [];
  const live = visits.find((v) => v.id === id && isWaiting(v)) ?? null;
  const visit = held ?? live;

  if (!allowed) return <MissingItem title={DESK_TITLE} />;
  if (!visit) return board.isPending && !board.isError ? <DetailSkeleton title={DESK_TITLE} /> : <MissingItem title={DESK_TITLE} />;

  const name = visitorName(visit);
  const first = name.split(/\s+/)[0] || name;
  const host = hostName(visit);
  const arrivedAt = timeValue(visit.createdAt);
  const waited = arrivedAt ? durationLabel((now - arrivedAt) / 60000) : '—';
  const close = () => router.back();

  const run = (decision: 'approve' | 'reject') => {
    setHeld(visit);
    decide.mutate(
      { id: visit.id, decision },
      {
        onSuccess: () => {
          if (decision === 'reject') haptic.warning();
          setAskReject(false);
          noteDecision(`desk:${visit.id}`, user?.id, decision);
          outcome.show(
            {
              decision,
              title: decision === 'approve' ? `${name} can come in` : `${name} was turned away`,
              subtitle: `${first} gets a WhatsApp. It’s recorded as you, for ${host}.`,
              rows: [
                { key: 'host', label: 'Here to meet', value: host },
                { key: 'for', label: 'Here for', value: purposeOf(visit) || 'Not given' },
                outcomeStatus(decision, { approve: 'Let in', reject: 'Turned away' }),
              ],
            },
            decision === 'reject',
          );
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

  return (
    <>
      <DecisionScreen
        title={DESK_TITLE}
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
                note: `Recorded as you, for ${host}. ${first} gets a WhatsApp.`,
              }
        }>
        <VisitorHero
          photo={<VisitPhoto visit={visit} size={compact ? 56 : 64} />}
          waited={waited}
          arrived={visitorArrived(visit, today, { noAnswer: false })}
          timedOut={visit.status === 'no_response'}
        />
        <WhoCards from={requesterItem(name, 'Visitor')} to={deciderItem({ mine: true, me: user?.name, role: `For ${host}` })} />
        <DetailsCard
          fields={[
            { label: 'Here to meet', value: host },
            { label: 'Here for', value: purposeOf(visit) || 'Not given' },
            { label: 'Phone', value: phoneLabel(visit.visitorMobile) },
            { label: 'Checked in with', value: sourceLabel(visit.source) },
          ]}
        />
      </DecisionScreen>
      <ConfirmSheet
        visible={askReject}
        onClose={() => {
          if (!decide.isPending) setAskReject(false);
        }}
        title={`Turn ${first} away?`}
        from={{ title: 'You', subtitle: `For ${host}`, avatar: { name: user?.name || 'You' } }}
        to={{ title: name, subtitle: 'Visitor', avatar: { name } }}
        detailsTitle="Visit"
        confirmLabel="Swipe to turn away"
        onConfirm={() => run('reject')}
        loading={decide.isPending && decide.variables?.decision === 'reject'}
        note={`${first} gets a WhatsApp that ${host} can’t meet them now.`}>
        <SummaryCard
          hideEmpty
          rows={[
            { label: 'Here to meet', value: host },
            { label: 'Here for', value: purposeOf(visit) || null },
          ]}
        />
      </ConfirmSheet>
      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={close} />
    </>
  );
}
