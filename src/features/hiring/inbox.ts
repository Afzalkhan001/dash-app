// Hiring domain (wave 2) — one Inbox kind, `referral` "Referred candidates": the referrals waiting on me
// (ReferredCandidatesBoard, dash.html:16147-16194, where my buttons are):
//   HR, Super Admin, CEO, COO   new referrals (submitted), shortlisted ones waiting for the final call —
//                               while the position is still open — and bonuses ready to approve (eligible);
//   anyone HR forwarded one to  hr_accepted referrals forwarded to me (Shortlist / Reject), position open.
// The Application Manager reads Referred Candidates but never acts (:16158), so it gets no queue.
// Detail: /inbox/referral/<id> → features/hiring/candidate-screen.
//
// The same hook keeps the job list and (for people who can't post openings) the forwarded public
// applications warm: they are what the website gates the Referral Program menu on (JOB_OPENINGS at
// boot, :1532; the forwarded checks :15274-15292), and features/hiring/nav.ts reads them from the
// cache. The referral list runs the server's eligibility sweep, so it is not on the one-minute poll.

import { UserSearch } from 'lucide-react-native';

import { type Referral, useJobOpenings, usePublicApplications, useReferrals } from '@/api/hiring';
import { canSeeReferrals, isHiringOverseer, isJobOpeningCreator, isFilledFor } from '@/features/hiring/access';
import { CandidateInboxDetail } from '@/features/hiring/candidate-screen';
import { bonusOf, coins } from '@/features/hiring/model';
import { ago } from '@/features/inbox/format';
import { defineInboxKind, type InboxKindPlugin } from '@/features/plugin-types';

const str = (v: unknown) => (v == null ? '' : String(v));

type Waiting = Referral & { _bonus: number };

/** When it started waiting on me. */
const waitingSince = (r: Referral) =>
  str(r.status === 'eligible' ? r.eligibleAt || r.eligibilityDate : r.status === 'hr_accepted' ? r.forwardedAt : r.status === 'shortlisted' ? r.shortlistedAt : r.createdAt) ||
  str(r.createdAt);

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<Waiting>({
    key: 'referral',
    label: 'Referrals',
    title: 'Referred candidate',
    module: 'people',
    icon: UserSearch,
    poll: false,
    useItems: (access) => {
      const user = access.user;
      const onMenu = canSeeReferrals(user, access.tenant, 1);
      const creator = isJobOpeningCreator(user);
      const jobsQ = useJobOpenings(onMenu);
      const refsQ = useReferrals(onMenu);
      usePublicApplications({}, onMenu && !creator);
      const jobs = jobsQ.data ?? [];
      const jobOf = (r: Referral) => jobs.find((j) => j.id === r.jobOpeningId) ?? null;
      const list: Waiting[] =
        onMenu && user && !isHiringOverseer(user)
          ? (refsQ.data ?? [])
              .filter((r) => {
                const job = jobOf(r);
                if (creator) return ((r.status === 'submitted' || r.status === 'shortlisted') && !isFilledFor(job)) || r.status === 'eligible';
                return r.status === 'hr_accepted' && r.forwardedToId === user.id && !isFilledFor(job);
              })
              .map((r) => ({ ...r, _bonus: bonusOf(jobOf(r)) }))
          : [];
      const visible = onMenu && !!user && !isHiringOverseer(user) && (creator || list.length > 0);
      return {
        visible,
        items: list.map((r) => ({ id: r.id, at: waitingSince(r), who: r.candidateName || 'Candidate', record: r })),
        pending: refsQ.data && jobsQ.data ? list.length : refsQ.isError || jobsQ.isError ? list.length : null,
        error: visible && refsQ.isError && !refsQ.data,
      };
    },
    row: (item, { now }) => {
      const r = item.record;
      const what =
        r.status === 'eligible'
          ? 'Bonus to approve'
          : r.status === 'shortlisted'
            ? 'Shortlisted · your final call'
            : r.status === 'hr_accepted'
              ? 'Forwarded to you'
              : 'New referral';
      return {
        title: item.who,
        subtitle: `${str(r.jobOpeningTitle) || 'Position'} · ${what}`,
        meta: r.status === 'eligible' ? `Referred by ${str(r.referredBy) || 'someone'} · completed 3 months` : r.referredBy ? `Referred by ${r.referredBy}` : undefined,
        value: r.status === 'eligible' && r._bonus ? coins(r._bonus) : undefined,
        age: ago(item.at, now),
      };
    },
    Detail: CandidateInboxDetail,
  }),
];
