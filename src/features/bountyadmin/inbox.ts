// Bounty admin in the Inbox (PLAN §2.5). Two approval queues, read from the same caches as the admin
// screens (['inbox', <key>, uid]), so the Inbox poll and pull to refresh keep those fresh too:
//   bounty-claim  work sent on a bounty task that waits for this person's approval: tasks they posted,
//                 every task for Master / Super Admin, and the App Manager's view only when Company
//                 settings › App Manager approvals is on (dash.html:13127, server.js:6563 / 6592).
//                 Detail: check the work, swipe to approve & pay, or send back / reject.
//   bounty-coins  use-coins requests waiting (canManageRedemptions, dash.html:13449; the App Manager only
//                 with the switch). Detail: approve with an Amazon link + coupon, or decline — both
//                 email and WhatsApp the person.

import { ClipboardCheck, Gift } from 'lucide-react-native';
import { createElement } from 'react';

import type { BountyClaim, BountyTask } from '@/api/bounty';
import { type CompanyRedemption, useAdminTasks, useCompanyRedemptions } from '@/api/bountyadmin';
import { coins } from '@/features/bounty/logic';
import { ago } from '@/features/inbox/format';
import { type Access, defineInboxKind, type InboxDetailProps, type InboxKindPlugin, type InboxPluginItem, type InboxPluginResult } from '@/features/plugin-types';

import { bountyAdminGates, canDecideClaim } from './access';
import { ClaimInboxDetail } from './claim-review';
import { claimKey } from './logic';
import { RedemptionReviewScreen } from './redemption-review';

type ClaimRecord = { task: BountyTask; claim: BountyClaim };

function useClaimQueue(access: Access): InboxPluginResult<ClaimRecord> {
  const g = bountyAdminGates(access.user, access.tenant);
  // Only people who could ever decide one: task posters, Master / Super Admin, the App Manager with the switch.
  const on = g.tasks && (g.creator || g.adminRole || (g.overseer && g.amSwitch));
  const q = useAdminTasks(on);
  const items: InboxPluginItem<ClaimRecord>[] = [];
  if (on && Array.isArray(q.data)) {
    for (const t of q.data) {
      if (!t || !t.id || t.cancelledAt || !canDecideClaim(t, access.user, access.tenant)) continue;
      for (const c of Array.isArray(t.claims) ? t.claims : []) {
        if (!c || c.status !== 'submitted') continue;
        items.push({ id: claimKey(t.id, c.employeeId), at: c.submittedAt || c.claimedAt || t.createdAt || '', who: c.employeeName || 'Employee', record: { task: t, claim: c } });
      }
    }
  }
  return { visible: on, items, pending: on && q.data ? items.length : null, error: on && q.isError && !q.data };
}

function useCoinsQueue(access: Access): InboxPluginResult<CompanyRedemption> {
  const g = bountyAdminGates(access.user, access.tenant);
  const on = g.redemptions && g.decideRedemptions;
  const q = useCompanyRedemptions(on);
  const items: InboxPluginItem<CompanyRedemption>[] = [];
  if (on && Array.isArray(q.data)) {
    for (const r of q.data) {
      if (r?.status === 'pending') items.push({ id: r.id, at: r.requestedAt || '', who: r.userName || 'Employee', record: r });
    }
  }
  return { visible: on, items, pending: on && q.data ? items.length : null, error: on && q.isError && !q.data };
}

const ClaimDetail = ({ id }: InboxDetailProps) => createElement(ClaimInboxDetail, { id });
const CoinsDetail = ({ id }: InboxDetailProps) => createElement(RedemptionReviewScreen, { id });

export const inboxKinds: InboxKindPlugin[] = [
  defineInboxKind<ClaimRecord>({
    key: 'bounty-claim',
    label: 'Bounty work',
    title: 'Work to check',
    module: 'bounty',
    icon: ClipboardCheck,
    useItems: useClaimQueue,
    row: (item, { now }) => ({
      title: item.who,
      subtitle: `${item.record.task.title || 'Bounty task'} · Bounty work`,
      meta: 'Check it, then pay',
      value: `${coins(item.record.claim.reward ?? item.record.task.reward)} coins`,
      age: ago(item.at, now),
    }),
    Detail: ClaimDetail,
  }),
  defineInboxKind<CompanyRedemption>({
    key: 'bounty-coins',
    label: 'Use coins',
    title: 'Use-coins request',
    module: 'bounty',
    icon: Gift,
    useItems: useCoinsQueue,
    row: (item, { now }) => ({
      title: item.who,
      subtitle: 'Amazon voucher · Use coins',
      value: `${coins(item.record.coins)} coins`,
      age: ago(item.at, now),
    }),
    Detail: CoinsDetail,
  }),
];
