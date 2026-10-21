// One referred candidate (a row of ReferredCandidatesBoard, dash.html:16009-16225, as a phone screen).
// Opened from Hiring › Candidates (/admin/hiring/candidate/<id>) and from the Inbox
// (/inbox/referral/<id>). Who: creators (HR, Super Admin, CEO, COO), the Application Manager (read
// only, :16158) and whoever HR forwarded this referral to.
//
//   CandidateHeader   name, "Position · referred by", the status pill
//   Banner            the website's waiting line when there is nothing for me to do (:16152-16192)
//   FromToCards       who referred them → the position (and its bonus)
//   SummaryCards      Candidate (contact, profile), Experience; HR-only: Joining & bonus, résumé opened
//   Résumé            GET /referrals/:id/resume → share sheet (the first open is recorded, except for
//                     the Application Manager)
//   EventTimeline     every stage that has happened, with who and when (IST)
//   ActionBar         the actions this status allows me (features/hiring/access referralActions):
//     Accept & forward  person picker (defaults to the hiring manager) → swipe; the reviewer is emailed
//     Shortlist         swipe (forwarded reviewer)
//     Select            swipe; says when it fills (and closes) the posting; no coins move yet
//     Reject            reason (optional, the referrer sees it) → swipe
//     Link employee     person picker of people with a joining date → swipe; starts the 3-month clock
//     Approve bonus     swipe; Referral Coins move from the poster to the referrer and can't be undone;
//                       a 402 (poster short of coins) shows the server's words

import { Redirect, useRouter } from 'expo-router';
import { BriefcaseBusiness, CircleCheck, Forward, Link2, MoreHorizontal, UserCheck, UserRoundX, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Linking } from 'react-native';

import { useBountyWallet } from '@/api/bounty';
import {
  approveReferralBonus,
  forwardReferral,
  mapReferralEmployee,
  type Referral,
  rejectReferral,
  selectReferral,
  shortlistReferral,
  useInvalidateHiring,
} from '@/api/hiring';
import { useTodayIst } from '@/features/attendance/use-now';
import {
  referralActions,
  type ReferralAction,
  referralWaitingNote,
  seesHrColumns,
  seesResumeViewed,
} from '@/features/hiring/access';
import {
  bonusOf,
  coins,
  eligibilityFrom,
  filledCount,
  openableUrl,
  positionsOf,
  referralStatusLabel,
  referralStatusTone,
} from '@/features/hiring/model';
import { CandidateHeader, ReferralResumeRow } from '@/features/hiring/ui';
import { useHiring } from '@/features/hiring/use-hiring';
import { noteDecision } from '@/features/inbox/decided';
import type { InboxDetailProps } from '@/features/plugin-types';
import { type PickPerson, PersonPicker, usePickablePeople } from '@/features/shared/person-picker';
import { dateLabel, stampLabel } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  ActionRow,
  Avatar,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  EventTimeline,
  FromToCards,
  type MenuItem,
  MenuSheet,
  NavHeader,
  Screen,
  SkeletonList,
  SummaryCard,
  type SummaryItem,
  Text,
  TextField,
  type TimelineEvent,
  toast,
} from '@/ui';

const TITLE = 'Referred candidate';

const ACTION_COPY: Record<ReferralAction, { label: string; icon: typeof Forward }> = {
  forward: { label: 'Accept and forward', icon: Forward },
  select: { label: 'Select', icon: UserCheck },
  reject: { label: 'Reject', icon: UserRoundX },
  shortlist: { label: 'Shortlist', icon: CircleCheck },
  map: { label: 'Link their employee record', icon: Link2 },
  approve: { label: 'Approve bonus', icon: CircleCheck },
};

const filled = (rows: SummaryItem[]) => rows.filter((r) => r.value != null && r.value !== '');

function timelineOf(r: Referral, today: string): TimelineEvent[] {
  const at = (iso?: string) => (iso ? stampLabel(iso, today) : null);
  const ev: (TimelineEvent | false)[] = [
    { key: 'ref', label: 'Referred', at: at(r.createdAt), by: r.referredBy || null, tone: 'neutral' },
    !!r.forwardedAt && { key: 'fwd', label: `Forwarded to ${r.forwardedToName || 'a reviewer'}`, at: at(r.forwardedAt), by: r.forwardedBy || null, tone: 'info' },
    !!r.shortlistedAt && { key: 'short', label: 'Shortlisted', at: at(r.shortlistedAt), by: r.shortlistedBy || null, tone: 'info' },
    !!r.selectedAt && { key: 'sel', label: 'Selected', at: at(r.selectedAt), by: r.selectedBy || null, tone: 'good' },
    !!r.rejectedAt && { key: 'rej', label: 'Rejected', at: at(r.rejectedAt), by: r.rejectedBy || null, note: r.rejectReason || null, tone: 'bad' },
    !!r.mappedAt && {
      key: 'map',
      label: `Linked to ${r.mappedEmployeeName || 'their employee record'}`,
      at: at(r.mappedAt),
      by: r.mappedBy || null,
      detail: r.joiningDate ? `Joined ${dateLabel(r.joiningDate, today)}` : null,
      tone: 'info',
    },
    r.status === 'mapped' && !!r.eligibilityDate && { key: 'wait', label: 'Bonus can be approved from', at: dateLabel(r.eligibilityDate, today), tone: 'wait' },
    !!r.eligibleAt && { key: 'elig', label: 'Completed 3 months', at: at(r.eligibleAt), tone: 'good' },
    !!r.notEligibleAt && { key: 'notelig', label: 'Not eligible', at: at(r.notEligibleAt), note: r.notEligibleReason || null, tone: 'bad' },
    !!r.approvedAt && {
      key: 'appr',
      label: r.bonusPaid ? `Bonus paid · ${coins(Number(r.bonusAmount) || 0)}` : 'Bonus approved',
      at: at(r.approvedAt),
      by: r.approvedBy || null,
      tone: 'good',
    },
  ];
  return ev.filter((e): e is TimelineEvent => !!e);
}

export function CandidateScreen({ id }: { id: string }) {
  const router = useRouter();
  const today = useTodayIst();
  const h = useHiring();
  const me = h.user;
  const allowed = h.canCandidates;
  const people = usePickablePeople({ enabled: h.creator, keep: ['dateJoined'] });
  const wallet = useBountyWallet(h.creator);
  const invalidate = useInvalidateHiring();

  const [sheet, setSheet] = useState<ReferralAction | null>(null);
  const [picker, setPicker] = useState<'forward' | 'map' | null>(null);
  const [menu, setMenu] = useState(false);
  const [target, setTarget] = useState<PickPerson | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refs = h.refs;
  const r = (refs.data ?? []).find((x) => x.id === id);

  if (!h.ready || (refs.isPending && !refs.data)) {
    return (
      <Screen header={<NavHeader title={TITLE} />}>
        <SkeletonList key="s" rows={5} tone="surface" />
      </Screen>
    );
  }
  if (!allowed) return <Redirect href="/" />;
  if (!r) {
    return (
      <Screen header={<NavHeader title={TITLE} />} onRefresh={() => refs.refetch()}>
        {refs.isError ? (
          <ErrorState key="err" message={refs.error?.message ?? 'The candidates could not be loaded.'} onRetry={() => void refs.refetch()} />
        ) : (
          <EmptyState
            key="none"
            icon={<Users color={palette.textMuted} strokeWidth={1.8} />}
            title="Candidate not found"
            message="It may no longer be shared with you."
            action={<Button title="Back" variant="accent" size="md" onPress={() => router.back()} />}
          />
        )}
      </Screen>
    );
  }

  const job = (h.jobs.data ?? []).find((j) => j.id === r.jobOpeningId) ?? null;
  const position = r.jobOpeningTitle || job?.position || 'Position';
  const actions = referralActions(me, r, job);
  const waiting = referralWaitingNote(me, r, job);
  const bonus = bonusOf(job);
  const hm = job?.hiringManagerId ? (people.data ?? []).find((p) => p.id === job.hiringManagerId) ?? null : null;
  const filledNow = job ? filledCount(job.id, refs.data) : 0;
  const total = job ? positionsOf(job) : 1;
  const posterIsMe = !!job && !!me && job.createdById === me.id;
  const w = wallet.data;
  const available = Math.max(0, Number(w?.referralAllocated || 0) - Number(w?.referralReserved || 0) - Number(w?.referralSpent || 0));

  const close = () => {
    if (busy) return;
    setSheet(null);
    setError(null);
  };
  const begin = (a: ReferralAction) => {
    setMenu(false);
    setError(null);
    if (a === 'forward') {
      setTarget(hm);
      if (hm) setSheet('forward');
      else setPicker('forward');
      return;
    }
    if (a === 'map') {
      setTarget(null);
      setPicker('map');
      return;
    }
    if (a === 'reject') setReason('');
    setSheet(a);
  };
  // The picker and the confirm sheet are separate modals: close one, then open the other.
  const reopen = (a: ReferralAction) => setTimeout(() => setSheet(a), 400);

  const run = async (a: ReferralAction, call: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await call();
      if (a === 'approve' || a === 'select' || a === 'forward') noteDecision(`referral:${r.id}`, me?.id, 'approve');
      if (a === 'reject') noteDecision(`referral:${r.id}`, me?.id, 'reject');
      setSheet(null);
      toast.show(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
      void invalidate();
    }
  };

  const candidateRows = filled([
    { key: 'email', label: 'Email', value: r.candidateEmail },
    { key: 'phone', label: 'Phone', value: r.candidatePhone },
  ]);
  const expRows = filled([
    { key: 'qual', label: 'Qualification', value: r.qualification },
    {
      key: 'yrs',
      label: 'Experience',
      value: r.yearsExperience !== null && r.yearsExperience !== undefined && r.yearsExperience !== '' ? `${r.yearsExperience} year${Number(r.yearsExperience) === 1 ? '' : 's'}` : null,
    },
    { key: 'cur', label: 'Current salary', value: r.currentSalary },
    { key: 'exp', label: 'Expected salary', value: r.expectedSalary },
    { key: 'notice', label: 'Notice period', value: r.noticePeriod },
  ]);
  const hrRows = seesHrColumns(me)
    ? filled([
        { key: 'mapped', label: 'Employee record', value: r.mappedEmployeeName ? `${r.mappedEmployeeName}${r.mappedEmployeeNumber ? ` (${r.mappedEmployeeNumber})` : ''}` : null },
        { key: 'joined', label: 'Joined', value: r.joiningDate ? dateLabel(r.joiningDate, today) : null },
        { key: 'elig', label: 'Bonus from', value: r.eligibilityDate ? dateLabel(r.eligibilityDate, today) : null },
        { key: 'bonus', label: 'Bonus', value: r.bonusPaid ? `Paid · ${coins(Number(r.bonusAmount) || 0)}` : bonus ? `${coins(bonus)} when approved` : 'No bonus on this position', status: r.bonusPaid ? 'done' : null },
      ])
    : [];
  const viewedLine = r.resumeViewedAt
    ? `Opened ${stampLabel(r.resumeViewedAt, today)}${r.resumeViewedByName ? ` by ${r.resumeViewedByName}` : ''}`
    : 'Not opened yet';

  const [first, second, ...rest] = actions;
  const menuItems: MenuItem[] = (actions.length > 2 ? [second, ...rest] : []).filter((a): a is ReferralAction => !!a).map((a) => ({
    key: a,
    label: ACTION_COPY[a].label,
    icon: ACTION_COPY[a].icon,
    tone: a === 'reject' ? 'danger' : 'default',
    onPress: () => begin(a),
  }));

  const FirstIcon = first ? ACTION_COPY[first].icon : UserCheck;
  const footer = first ? (
    <ActionBar note={first === 'approve' && posterIsMe && bonus ? `You have ${coins(available)} to give as referral bonuses.` : null}>
      <ActionRow context="bar">
        <Button title={ACTION_COPY[first].label} icon={<FirstIcon />} onPress={() => begin(first)} />
        {second ? (
          actions.length > 2 ? (
            <Button title="More" variant="ghost" icon={<MoreHorizontal />} onPress={() => setMenu(true)} />
          ) : (
            <Button title={ACTION_COPY[second].label} variant="ghost" onPress={() => begin(second)} />
          )
        ) : null}
      </ActionRow>
    </ActionBar>
  ) : undefined;

  const candidateItem = { title: r.candidateName, subtitle: position, avatar: { name: r.candidateName } };
  const fullAfter = filledNow + 1 >= total;

  return (
    <>
      <Screen header={<NavHeader title={TITLE} />} footer={footer} onRefresh={() => Promise.all([refs.refetch(), h.jobs.refetch()])}>
        <CandidateHeader
          key="head"
          name={r.candidateName}
          sub={[position, r.referredBy ? `Referred by ${r.referredBy}` : ''].filter(Boolean).join(' · ')}
          status={{ label: referralStatusLabel(r), tone: referralStatusTone(r.status) }}
        />
        {waiting ? <Banner key="wait" tone={r.status === 'not_eligible' ? 'danger' : 'info'} message={waiting} /> : null}
        {r.status === 'rejected' && r.rejectReason ? <Banner key="why" tone="danger" title="Why it was rejected" message={r.rejectReason} /> : null}

        <FromToCards
          key="who"
          from={{ title: r.referredBy || 'Someone', subtitle: 'Referred them', avatar: { name: r.referredBy || '?' } }}
          to={{ title: position, subtitle: bonus ? `${coins(bonus)} bonus` : 'No referral bonus', icon: BriefcaseBusiness, module: 'people' }}
        />

        {candidateRows.length ? <SummaryCard key="cand" title="Candidate" rows={candidateRows} /> : null}
        {r.profileLink ? (
          <AccountRow
            key="link"
            icon={Link2}
            module="people"
            title="Profile link"
            sub={r.profileLink}
            actionLabel="Open"
            onPress={() => void Linking.openURL(openableUrl(r.profileLink))}
            accessibilityLabel={`Open profile link, ${r.profileLink}`}
          />
        ) : null}

        {expRows.length ? <SummaryCard key="exp" title="Experience" rows={expRows} /> : null}

        {r.hasResume !== false ? (
          <ReferralResumeRow
            key="resume"
            id={r.id}
            fileName={r.resumeFileName}
            sub={seesResumeViewed(me) ? `${r.resumeFileName || 'Résumé'} · ${viewedLine}` : r.resumeFileName}
            onOpened={() => void invalidate()}
          />
        ) : null}

        {hrRows.length ? <SummaryCard key="hr" title="Joining and bonus" rows={hrRows} /> : null}

        <Card key="timeline" tone="frostStrong" style={styles.card}>
          <CardHeader title="What happened" />
          <EventTimeline events={timelineOf(r, today)} />
        </Card>
      </Screen>

      <MenuSheet visible={menu} onClose={() => setMenu(false)} title={r.candidateName} subtitle={position} items={menuItems} />

      <PersonPicker
        visible={picker === 'forward'}
        onClose={() => setPicker(null)}
        title="Forward to"
        subtitle={job?.hiringManagerName ? `The hiring manager is ${job.hiringManagerName}. You can pick anyone.` : 'Anyone in the company can review this candidate.'}
        people={people.data}
        loading={people.isPending}
        allowOnLeave
        recentKey="hiring.forward"
        selectedId={target?.id}
        onPick={(p) => {
          setTarget(p);
          setPicker(null);
          reopen('forward');
        }}
      />
      <PersonPicker
        visible={picker === 'map'}
        onClose={() => setPicker(null)}
        title="Their employee record"
        subtitle="Only people with a joining date on the roster are shown."
        people={people.data}
        loading={people.isPending}
        filter={(p) => typeof p.extra?.dateJoined === 'string' && !!p.extra.dateJoined}
        allowOnLeave
        selectedId={target?.id}
        emptyMessage="No one with a joining date yet. Add it on their roster record first."
        onPick={(p) => {
          setTarget(p);
          setPicker(null);
          reopen('map');
        }}
      />

      <ConfirmSheet
        visible={sheet === 'forward'}
        onClose={close}
        title="Accept and forward"
        from={candidateItem}
        to={{ title: target?.name || 'Choose someone', subtitle: target?.jobTitle || 'Reviewer', avatar: { name: target?.name || '?' } }}
        confirmLabel="Swipe to forward"
        disabled={!target}
        loading={busy}
        onConfirm={() => target && void run('forward', () => forwardReferral(r.id, target.id), `Forwarded to ${target.name}`)}
        note={target ? `${target.name} gets an email to review ${r.candidateName}.` : undefined}>
        <AccountRow
          left={<Avatar name={target?.name || '?'} size={36} ring={false} />}
          title={target?.name || 'No one chosen'}
          sub={target && hm && target.id === hm.id ? 'The hiring manager' : 'Reviewer'}
          actionLabel="Change"
          onChange={() => {
            setSheet(null);
            setTimeout(() => setPicker('forward'), 400);
          }}
          actionAccessibilityLabel="Change who reviews this candidate"
        />
        <Text variant="caption" muted>
          They can shortlist or reject. HR makes the final call.
        </Text>
        {error ? <Banner tone="danger" title="Couldn’t forward" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'shortlist'}
        onClose={close}
        title="Shortlist candidate"
        subtitle={`${r.candidateName} for ${position}`}
        confirmLabel="Swipe to shortlist"
        loading={busy}
        onConfirm={() => void run('shortlist', () => shortlistReferral(r.id), `${r.candidateName} shortlisted`)}
        note="HR makes the final call. No one is emailed.">
        {error ? <Banner tone="danger" title="Couldn’t shortlist" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'select'}
        onClose={close}
        title="Select candidate"
        from={candidateItem}
        to={{ title: position, subtitle: `${Math.min(filledNow + 1, total)} of ${total} filled after this`, icon: BriefcaseBusiness, module: 'people' }}
        confirmLabel="Swipe to select"
        loading={busy}
        onConfirm={() => void run('select', () => selectReferral(r.id), `${r.candidateName} selected`)}
        note="No one is emailed. This can’t be undone.">
        <SummaryCard
          rows={[
            { key: 'next', label: 'Coins', value: 'None move now', hint: 'The bonus is paid only after they complete 3 months and you approve it.' },
            ...(fullAfter ? [{ key: 'close', label: 'Position', value: 'Closes', hint: 'This fills the last opening, so no one can refer for it any more.' }] : []),
          ]}
        />
        {error ? <Banner tone="danger" title="Couldn’t select" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'reject'}
        onClose={close}
        title="Reject candidate"
        subtitle={`${r.candidateName} for ${position}`}
        confirmLabel="Swipe to reject"
        loading={busy}
        onConfirm={() => void run('reject', () => rejectReferral(r.id, reason.trim()), `${r.candidateName} rejected`)}
        note={`${r.referredBy || 'The referrer'} sees the reason in My referrals. No one is emailed.`}>
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={500} counter placeholder="What was missing?" />
        {error ? <Banner tone="danger" title="Couldn’t reject" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'map'}
        onClose={close}
        title="Link employee record"
        from={candidateItem}
        to={{ title: target?.name || 'Choose someone', subtitle: 'Employee record', avatar: { name: target?.name || '?' } }}
        confirmLabel="Swipe to link"
        disabled={!target}
        loading={busy}
        onConfirm={() => target && void run('map', () => mapReferralEmployee(r.id, target.id), `Linked to ${target.name}`)}
        note="No one is emailed.">
        {target ? (
          <SummaryCard
            rows={[
              { key: 'joined', label: 'Joined', value: dateLabel(String(target.extra?.dateJoined ?? ''), today) },
              { key: 'from', label: 'Bonus can be approved from', value: dateLabel(eligibilityFrom(String(target.extra?.dateJoined ?? '')), today), hint: 'If they are still with us after 3 months.' },
            ]}
          />
        ) : null}
        <AccountRow
          left={<Avatar name={target?.name || '?'} size={36} ring={false} />}
          title={target?.name || 'No one chosen'}
          sub={target?.employeeNumber || 'Employee record'}
          actionLabel="Change"
          onChange={() => {
            setSheet(null);
            setTimeout(() => setPicker('map'), 400);
          }}
          actionAccessibilityLabel="Change the employee record"
        />
        {error ? <Banner tone="danger" title="Couldn’t link" message={error} /> : null}
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'approve'}
        onClose={close}
        title="Approve referral bonus"
        from={{ title: job?.createdBy || 'Position poster', subtitle: 'Their referral coins', avatar: { name: job?.createdBy || '?' } }}
        to={{ title: r.referredBy || 'Referrer', subtitle: bonus ? `Gets ${coins(bonus)}` : 'No bonus set', avatar: { name: r.referredBy || '?' } }}
        confirmLabel={bonus ? 'Swipe to pay the bonus' : 'Swipe to approve'}
        loading={busy}
        onConfirm={() => void run('approve', () => approveReferralBonus(r.id), bonus ? `${coins(bonus)} paid to ${r.referredBy || 'the referrer'}` : 'Approved')}
        note={bonus ? 'Coins move now and can’t be taken back. No one is emailed.' : 'This position has no referral bonus, so no coins move.'}>
        <SummaryCard
          rows={filled([
            { key: 'cand', label: 'Hire', value: r.mappedEmployeeName || r.candidateName },
            { key: 'joined', label: 'Joined', value: r.joiningDate ? dateLabel(r.joiningDate, today) : null },
            { key: 'bonus', label: 'Bonus', value: bonus ? coins(bonus) : 'None' },
            ...(posterIsMe && bonus ? [{ key: 'left', label: 'Your referral coins', value: coins(available), hint: available < bonus ? 'Not enough for this bonus. A Super Admin gives out referral coins in Bounty admin.' : null }] : []),
          ])}
        />
        {error ? <Banner tone="danger" title="Couldn’t approve" message={error} /> : null}
      </ConfirmSheet>
    </>
  );
}

/** /inbox/referral/<id>. */
export function CandidateInboxDetail({ id }: InboxDetailProps) {
  return <CandidateScreen id={id} />;
}

const styles = themedStyles(() => ({
  card: { gap: space.sm },
}));
