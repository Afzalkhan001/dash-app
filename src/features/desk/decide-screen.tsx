// /inbox/desk/<id>: someone at reception still waiting for their host, answered by the desk (web: the
// board's VisitCard in desk mode, dash.html:35818; POST /visitors/:id/decide). The host gets the first
// go: for letInAfterMin (5) minutes a clock counts down and "Let in" stays locked ("Let in after 3:12");
// after that the desk may let the visitor in, recorded as let in by the desk because the host did not
// answer ('desk_override'). Turn away is there at any time. When the desk lets someone in nobody is
// messaged (they are standing at the desk); turning away still WhatsApps the visitor (visitors.js
// decideVisit). The clock runs on the server's time (the board's serverNow skew), like the web.
//
// Same frame as every Inbox decision (features/inbox/detail): the visitor's photo and how long they have
// waited, Visitor → You (for the host), the details, and the sticky bar: "Swipe to let in" (the note above
// it says what is recorded) over Turn away, which opens a ConfirmSheet with its own swipe. While Let in is
// locked the bar is a disabled "Let in after m:ss" over Turn away. A 409 shows the server's words: "Give
// <host> a chance to answer first …" if the clocks disagree, or somebody else answered first (go back).

import { useRouter } from 'expo-router';
import { Hourglass, X } from 'lucide-react-native';
import { useState } from 'react';

import { LET_IN_AFTER_MIN, useDeskDecide, useDeskToday } from '@/api/desk';
import type { Visit } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { isDeskRole } from '@/features/desk/access';
import { hostName, isWaiting, letInClock, mmss, purposeOf, sourceLabel, visitorName } from '@/features/desk/format';
import type { InboxDetailProps } from '@/features/plugin-types';
import { noteDecision } from '@/features/inbox/decided';
import {
  DecidedSheet,
  DecisionBar,
  deciderItem,
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
import { ActionBar, Banner, Button, ConfirmSheet, haptic, NavHeader, Screen, SummaryCard, useLayout } from '@/ui';

export const DESK_TITLE = 'At reception';

export function DeskDecisionScreen({ id }: InboxDetailProps) {
  const router = useRouter();
  // Ticks every second: the let-in clock counts down in seconds, like the web.
  const now = useNow(1000);
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
  const afterMin = board.data?.letInAfterMin ?? LET_IN_AFTER_MIN;
  const clock = letInClock(visit, now + (board.data?.skewMs ?? 0), afterMin);
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
              subtitle:
                decision === 'approve'
                  ? `Recorded as let in by you, because ${host} did not answer. Nobody is messaged.`
                  : `${first} gets a WhatsApp. It’s recorded as you, for ${host}.`,
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
          // The server's own words: "Give <host> a chance to answer first …" or "already approved".
          explainDecisionError(e, close);
        },
      },
    );
  };

  const busy = decide.isPending;
  const footer = outcome.done ? undefined : clock.canLetIn ? (
    <DecisionBar
      onApprove={() => run('approve')}
      onReject={() => setAskReject(true)}
      approving={busy && decide.variables?.decision === 'approve'}
      disabled={busy}
      approveLabel="Let in"
      rejectLabel="Turn away"
      note={`${host} hasn’t answered. It’s recorded as let in by you. Nobody is messaged.`}
    />
  ) : (
    <ActionBar note={`${host} gets ${afterMin} minutes to answer first.`}>
      <Button
        size="lg"
        variant="accent"
        title={`Let in after ${mmss(clock.leftMs)}`}
        icon={<Hourglass />}
        disabled
        accessibilityLabel={`Let in. Available in ${Math.ceil(clock.leftMs / 60000)} ${Math.ceil(clock.leftMs / 60000) === 1 ? 'minute' : 'minutes'}`}
      />
      <Button title="Turn away" variant="ghost" icon={<X />} disabled={busy} onPress={() => setAskReject(true)} />
    </ActionBar>
  );

  return (
    <>
      <Screen header={<NavHeader title={DESK_TITLE} />} footer={footer}>
        <VisitorHero
          photo={<VisitPhoto visit={visit} size={compact ? 56 : 64} />}
          waited={waited}
          arrived={visitorArrived(visit, today, { noAnswer: false })}
          timedOut={visit.status === 'no_response'}
        />
        {outcome.done ? null : clock.canLetIn ? (
          <Banner tone="warning" icon={Hourglass} message={`Waiting ${mmss(clock.waitedMs)} — ${host} has not answered`} />
        ) : (
          <Banner tone="info" icon={Hourglass} message={`Waiting ${mmss(clock.waitedMs)} for ${host} to answer`} />
        )}
        <WhoCards from={requesterItem(name, 'Visitor')} to={deciderItem({ mine: true, me: user?.name, role: `For ${host}` })} />
        <DetailsCard
          fields={[
            { label: 'Here to meet', value: host },
            { label: 'Here for', value: purposeOf(visit) || 'Not given' },
            { label: 'Phone', value: phoneLabel(visit.visitorMobile) },
            { label: 'Checked in with', value: sourceLabel(visit.source) },
          ]}
        />
      </Screen>
      <ConfirmSheet
        visible={askReject}
        onClose={() => {
          if (!busy) setAskReject(false);
        }}
        title={`Turn ${first} away?`}
        from={{ title: 'You', subtitle: `For ${host}`, avatar: { name: user?.name || 'You' } }}
        to={{ title: name, subtitle: 'Visitor', avatar: { name } }}
        detailsTitle="Visit"
        confirmLabel="Swipe to turn away"
        onConfirm={() => run('reject')}
        loading={busy && decide.variables?.decision === 'reject'}
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
