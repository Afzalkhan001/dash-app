// Desk domain — the Inbox kind "At reception" (key `desk`): everyone at reception still waiting for their
// host to answer (GET /visitors/today, pending or no_response), for the Visitor Manager. The rows sit in
// the same pinned "At reception" group as a host's own visitors, and open /inbox/desk/<id>
// (features/desk/decide-screen) where the desk lets them in or turns them away for the host.
//
// Only the Visitor Manager gets this queue (spec §4.1): the Super Admin also runs the desk on the web,
// but keeps just the host queue in the Inbox and reaches the board from More, so the owner's Inbox is
// not flooded with every visitor in the building. A notice queue (decides: false), like the host's
// visitors: no Waiting / Done today cards.

import { UserRoundSearch } from 'lucide-react-native';

import { useDeskToday } from '@/api/desk';
import type { Visit } from '@/api/visitors';
import { canSeeDeskBoard, isVisitorManager } from '@/features/desk/access';
import { DESK_TITLE, DeskDecisionScreen } from '@/features/desk/decide-screen';
import { hostName, isWaiting, purposeOf, visitorName } from '@/features/desk/format';
import { ago } from '@/features/inbox/format';
import { defineInboxKind, type InboxKindPlugin } from '@/features/plugin-types';

export const DESK_KIND = 'desk';

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<Visit>({
    key: DESK_KIND,
    label: 'At reception',
    title: DESK_TITLE,
    module: 'visitors',
    icon: UserRoundSearch,
    decides: false,
    pin: { key: 'reception', label: 'At reception' },
    useItems: (access) => {
      const on = isVisitorManager(access.user) && canSeeDeskBoard(access);
      const q = useDeskToday({ enabled: on });
      const waiting = (q.data?.visits ?? []).filter(isWaiting);
      return {
        visible: on,
        items: waiting.map((v) => ({ id: v.id, at: v.createdAt, who: visitorName(v), record: v })),
        pending: q.data ? waiting.length : null,
        error: q.isError && !q.data,
      };
    },
    row: (item, { now }) => {
      const v = item.record;
      return {
        title: item.who,
        subtitle: `To meet ${hostName(v)} · ${purposeOf(v) || 'No reason given'}`,
        meta: v.status === 'no_response' ? 'Their host hasn’t answered. You can answer for them.' : undefined,
        age: ago(v.createdAt, now),
      };
    },
    Detail: DeskDecisionScreen,
  }),
];
