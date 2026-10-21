// Teamboard domain (wave 2) — what it adds to More, the + sheet and Home (docs/port/EXTENSION-POINTS.md §3–6).
//
//   More › Work   "Team board" → /admin/team-board, only for whom the website shows "Team Roster"
//                 (canSeeTeamRosterNav, dash.html:11985: the company switch AND a Team-Roster department
//                 I run or am a granted manager of). The data comes from the boot-time loads the Inbox
//                 plug-in makes (features/teamboard/inbox), read from the cache: nothing is shown on a guess.
//   + sheet       nothing (the website has no quick "add" outside a project).
//   Home          nothing.
// Assignees reach their Team Roster work from My tasks ("My tasks · Team tasks", src/app/(app)/tasks).
// Pure: decided from `access` and the query cache only.

import { KanbanSquare } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { boardVisible } from '@/features/teamboard/access';

export function workspaceRows(access: Access): WorkspaceRow[] {
  if (!boardVisible(access)) return [];
  return [
    {
      key: 'teamboard.board',
      section: 'work',
      label: 'Team board',
      subtitle: 'Teams, projects and timed tasks in your department',
      href: '/admin/team-board',
      icon: KanbanSquare,
      module: 'tasks',
      order: 20,
      tourId: 'more.teamboard.board',
    },
  ];
}

export function createActions(_access: Access): CreateAction[] {
  return [];
}

export function homeCards(_access: Access): HomeCard[] {
  return [];
}
