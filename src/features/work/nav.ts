// Work domain (wave 1) — what it adds to More, the + sheet and Home (docs/port/EXTENSION-POINTS.md §3–6).
//
//   More › Work     Team tasks (admin, manager, app_manager), Project codes (nav `projects`), Clients
//                   (nav `clients`) — each only with the website's own sidebar gate.
//   + sheet         "Assign task" (Team tasks roles), opening the assign form.
//   Home            the manager's "Team today" and "Tomorrow" cards (ManagerHome is the manager's own
//                   home page on the website, dash.html:22837), under "Needs you".
// Pure: decided from `access` only.

import { BriefcaseBusiness, ClipboardList, ClipboardPlus, UsersRound } from 'lucide-react-native';

import type { Access, CreateAction, HomeCard, WorkspaceRow } from '@/features/plugin-types';
import { canSeeClients, canSeeProjects, canSeeTeamTasks, hasManagerHome } from '@/features/work/access';
import { TeamTodayCard, TomorrowCard } from '@/features/work/home-cards';

export function workspaceRows(access: Access): WorkspaceRow[] {
  const rows: WorkspaceRow[] = [];
  if (canSeeTeamTasks(access)) {
    rows.push({
      key: 'work.tasks',
      section: 'work',
      label: 'Team tasks',
      subtitle: 'Assign work and see where it stands',
      href: '/admin/work/tasks',
      icon: ClipboardList,
      module: 'tasks',
      order: 10,
      tourId: 'more.work.tasks',
    });
  }
  if (canSeeProjects(access)) {
    rows.push({
      key: 'work.projects',
      section: 'work',
      label: 'Project codes',
      subtitle: 'The codes work and claims are booked against',
      href: '/admin/work/projects',
      icon: BriefcaseBusiness,
      module: 'tasks',
      order: 60,
    });
  }
  if (canSeeClients(access)) {
    rows.push({
      key: 'work.clients',
      section: 'work',
      label: 'Clients',
      subtitle: 'The clients you work with',
      href: '/admin/work/clients',
      icon: UsersRound,
      module: 'tasks',
      order: 70,
    });
  }
  return rows;
}

export function createActions(access: Access): CreateAction[] {
  if (!canSeeTeamTasks(access)) return [];
  return [
    {
      key: 'work.assign',
      label: 'Assign task',
      href: '/admin/work/tasks/new',
      icon: ClipboardPlus,
      module: 'tasks',
      hint: 'Opens a new task for someone on your team',
      order: 10,
    },
  ];
}

export function homeCards(access: Access): HomeCard[] {
  if (!hasManagerHome(access)) return [];
  return [
    { key: 'work.teamToday', placement: 'needs', order: 10, Card: TeamTodayCard },
    { key: 'work.tomorrow', placement: 'needs', order: 11, Card: TomorrowCard },
  ];
}
