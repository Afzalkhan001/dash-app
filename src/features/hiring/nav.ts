// Hiring domain (wave 2) — what hiring adds to More, the + sheet and Home (docs/port/EXTENSION-POINTS.md
// §3–6). Pure: decided from `access` plus what the query cache already holds (features/hiring/signals —
// the job list and the forwarded checks the website loads before drawing its menu; the Inbox plug-in
// keeps them warm). Nothing is shown on a guess: until the job list is known, a person who can't post
// openings has no Refer & earn row (navForRaw :1532 hides it while JOB_OPENINGS is empty).
//
//   More › links         "Refer & earn" (navForRaw `referrals`) → /admin/hiring/refer
//   More › People & HR   "Hiring" — creators (positions, candidates, applications), the Application
//                        Manager (candidates, read only) and anyone HR forwarded a candidate or an
//                        application to → /admin/hiring
//   + sheet              "Post job" for job-opening creators (hr, super_admin, ceo, coo)
//   Home                 nothing (the waiting candidates are in the Inbox)

import { BriefcaseBusiness, Gift } from 'lucide-react-native';

import { hiringSignals } from '@/features/hiring/signals';
import { canManagePositions, canSeeHiringDesk, canSeeReferrals, isHiringOverseer, isJobOpeningCreator } from '@/features/hiring/access';
import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const u = access.user;
  const s = hiringSignals(u?.id);
  const rows: WorkspaceRow[] = [];
  if (canSeeReferrals(u, access.tenant, s.jobs)) {
    rows.push({
      key: 'hiring.refer',
      section: 'links',
      label: 'Refer & earn',
      subtitle: 'Refer people for open positions and earn coins',
      href: '/admin/hiring/refer',
      icon: Gift,
      module: 'bounty',
      order: 20,
      tourId: 'more.hiring.refer',
    });
  }
  if (canSeeHiringDesk(u, access.tenant, s)) {
    rows.push({
      key: 'hiring.desk',
      section: 'people',
      label: 'Hiring',
      subtitle: isJobOpeningCreator(u)
        ? 'Job openings, referred candidates and applications'
        : isHiringOverseer(u)
          ? 'See referred candidates and who opened their résumés'
          : 'Candidates HR sent you to review',
      href: '/admin/hiring',
      icon: BriefcaseBusiness,
      module: 'people',
      order: 30,
      tourId: 'more.hiring.desk',
    });
  }
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  const s = hiringSignals(access.user?.id);
  if (!canManagePositions(access.user, access.tenant, s)) return [];
  return [
    {
      key: 'hiring.post',
      label: 'Post job',
      href: '/admin/hiring/edit',
      icon: BriefcaseBusiness,
      module: 'people',
      hint: 'Opens the form to post a job opening',
      order: 70,
    },
  ];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
