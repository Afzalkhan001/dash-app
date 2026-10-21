// Teamboard domain (wave 2) — Inbox plug-in. Team Roster has no approvals and sends no messages, so
// this kind never shows (visible: false: no chip, no count, no rows). Its hook does one job: the
// website's boot-time loads (dash.html:30303 — GET /departments, /team-roster/managers?mine=1,
// /team-roster/tasks?mine=1) that its sidebar needs for "Team Roster" and "My Team Tasks". The Inbox
// hooks run for the whole signed-in session (tab badge), so this warms the cache the pure More / tour
// plug-ins read (features/teamboard/access gateSnapshot). Not under ['inbox', …]: no one-minute poll.

import { Redirect } from 'expo-router';
import { KanbanSquare } from 'lucide-react-native';
import { createElement } from 'react';

import { useMyGrantDeptIds, useMyTrTasks, useTbDepts } from '@/api/teamboard';
import { defineInboxKind, type InboxKindPlugin } from '@/features/plugin-types';
import { rosterReachable } from '@/features/teamboard/access';

function NoDetail() {
  return createElement(Redirect, { href: '/admin/team-board' });
}

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<null>({
    key: 'team-board',
    label: 'Team board',
    title: 'Team board',
    module: 'tasks',
    icon: KanbanSquare,
    decides: false,
    poll: false,
    useItems: (access) => {
      const on = rosterReachable(access.user);
      useTbDepts(on);
      useMyGrantDeptIds(on && !!access.tenant?.teamRosterEnabled);
      useMyTrTasks(on);
      return { visible: false, items: [] };
    },
    row: () => ({ title: 'Team board', subtitle: '' }),
    Detail: NoDetail,
  }),
];
