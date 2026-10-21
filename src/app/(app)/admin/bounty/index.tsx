// Bounty admin — the admin tabs of the website's BountyHub (dash.html:14869) as one phone hub:
//   1. one light hero: the company wallet (Super Admin, CEO, COO), else my task funds (creators), else
//      the use-coins requests waiting (HR, App Manager);
//   2. what waits on me: submissions to check, use-coins requests to decide;
//   3. the parts this person has on the website, each its own screen: Bounty tasks · Give coins ·
//      Creators · Use-coins requests · Ledger (or My coin history) · My task funds · Summary.
// The leaderboard and the employee's own board stay on Bounty rewards (/bounty).

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { BarChart3, ClipboardCheck, Coins, Gift, HandCoins, ListChecks, ReceiptText, Users, Wallet } from 'lucide-react-native';

import { useBountyWallet } from '@/api/bounty';
import { useAdminTasks, useCompanyRedemptions, useCompanyWallet } from '@/api/bountyadmin';
import { canDecideClaim, canOpenBountyAdmin } from '@/features/bountyadmin/access';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { creatorAvailable } from '@/features/bountyadmin/logic';
import { asArray, coins, num } from '@/features/bounty/logic';
import { plural } from '@/lib/format';
import { ActivityList, ActivityRow, NavHeader, Screen, Skeleton, SummaryHero } from '@/ui';
import { radius } from '@/theme/tokens';

const TITLE = 'Bounty admin';

export default function BountyAdminHub() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={canOpenBountyAdmin(gates)} ready={ready} title={TITLE}>
      <Hub />
    </AdminGate>
  );
}

function Hub() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, tenant, gates: g } = useBountyAdmin();
  const companyQ = useCompanyWallet(g.superTier);
  const walletQ = useBountyWallet(g.wallet && !g.superTier);
  const tasksQ = useAdminTasks(g.tasks);
  const redQ = useCompanyRedemptions(g.redemptions);

  const tasks = asArray<NonNullable<typeof tasksQ.data>[number]>(tasksQ.data);
  const toCheck = tasks
    .filter((t) => !t.cancelledAt && canDecideClaim(t, user, tenant))
    .reduce((s, t) => s + asArray<{ status: string }>(t.claims).filter((c) => c?.status === 'submitted').length, 0);
  const mine = tasks.filter((t) => !!user && t.creatorId === user.id).length;
  const pending = asArray<{ status: string }>(redQ.data).filter((r) => r?.status === 'pending').length;
  const wallet = walletQ.data && typeof walletQ.data === 'object' ? walletQ.data : undefined;
  const company = companyQ.data && typeof companyQ.data === 'object' ? companyQ.data : undefined;

  let hero;
  if (g.superTier) {
    hero = companyQ.isLoading ? (
      <Skeleton height={176} radius={radius.xxl} />
    ) : (
      <SummaryHero
        icon={Coins}
        module="bounty"
        label="Company wallet"
        value={num(company?.available)}
        unit="coins"
        sub={company ? `Added ${coins(company.totalAdded)} · given out ${coins(company.totalDistributed)}` : companyQ.error?.message}
        action={g.distribute ? { title: 'Give coins', icon: <HandCoins />, onPress: () => router.push('/admin/bounty/distribute') } : undefined}
      />
    );
  } else if (g.wallet) {
    hero = walletQ.isLoading ? (
      <Skeleton height={176} radius={radius.xxl} />
    ) : (
      <SummaryHero
        icon={Wallet}
        module="bounty"
        label="Coins to fund tasks"
        value={creatorAvailable(wallet)}
        unit="coins"
        info={{ label: 'Held in tasks', value: coins(wallet?.reserved) }}
        onArrowPress={() => router.push('/admin/bounty/wallet')}
        arrowLabel="Open my task funds"
        action={g.create ? { title: 'Post a task', onPress: () => router.push('/admin/bounty/tasks/new') } : undefined}
      />
    );
  } else {
    hero = (
      <SummaryHero
        icon={Gift}
        module="bounty"
        label="Use-coins requests waiting"
        value={pending}
        sub={g.decideRedemptions ? 'Approve with an Amazon link and coupon, or decline.' : 'You can see these. Approving is switched off for your role.'}
        onArrowPress={g.redemptions ? () => router.push('/admin/bounty/redemptions') : undefined}
        arrowLabel="Open use-coins requests"
      />
    );
  }

  const showNeeds = (g.tasks && toCheck > 0) || (g.redemptions && g.decideRedemptions && pending > 0);

  return (
    <Screen
      header={<NavHeader title={TITLE} />}
      onRefresh={() => Promise.all([qc.invalidateQueries({ queryKey: ['bountyadmin'] }), qc.invalidateQueries({ queryKey: ['inbox', 'bounty-claim'] }), qc.invalidateQueries({ queryKey: ['inbox', 'bounty-coins'] }), qc.invalidateQueries({ queryKey: ['bounty', 'wallet'] })])}>
      {hero}

      {showNeeds ? (
        <ActivityList title="Waiting on you">
          {g.tasks && toCheck > 0 ? (
            <ActivityRow
              module="bounty"
              icon={ClipboardCheck}
              title="Work to check"
              subtitle={`${plural(toCheck, 'submission')} waiting for approval`}
              chevron
              onPress={() => router.push('/admin/bounty/tasks?show=check')}
            />
          ) : null}
          {g.redemptions && g.decideRedemptions && pending > 0 ? (
            <ActivityRow
              module="bounty"
              icon={Gift}
              title="Use-coins requests"
              subtitle={`${plural(pending, 'request')} to approve or decline`}
              chevron
              onPress={() => router.push('/admin/bounty/redemptions')}
            />
          ) : null}
        </ActivityList>
      ) : null}

      <ActivityList title="Manage">
        {g.tasks ? (
          <ActivityRow
            module="bounty"
            icon={ListChecks}
            title="Bounty tasks"
            subtitle={g.create ? (mine ? `${plural(mine, 'task')} you posted` : 'Post a task and check the work') : 'Every task and the work sent'}
            chevron
            onPress={() => router.push('/admin/bounty/tasks')}
          />
        ) : null}
        {/* The company-wallet hero already carries "Give coins" for Super Admin, CEO and COO. */}
        {g.distribute && !g.superTier ? (
          <ActivityRow module="bounty" icon={HandCoins} title="Give coins" subtitle="Fund task posters and referral bonuses" chevron onPress={() => router.push('/admin/bounty/distribute')} />
        ) : null}
        {g.creators ? (
          <ActivityRow
            module="bounty"
            icon={Users}
            title="Task posters"
            subtitle={g.editCreators ? 'Who can post bounty tasks' : 'Who can post bounty tasks (view only)'}
            chevron
            onPress={() => router.push('/admin/bounty/creators')}
          />
        ) : null}
        {g.redemptions ? (
          <ActivityRow
            module="bounty"
            icon={Gift}
            title="Use-coins requests"
            subtitle={pending ? `${pending} waiting` : 'Nothing waiting'}
            chevron
            onPress={() => router.push('/admin/bounty/redemptions')}
          />
        ) : null}
        {g.wallet ? (
          <ActivityRow module="bounty" icon={Wallet} title="My task funds" subtitle="Coins you can post tasks with" chevron onPress={() => router.push('/admin/bounty/wallet')} />
        ) : null}
        {g.ledger ? (
          <ActivityRow
            module="bounty"
            icon={ReceiptText}
            title={g.ledgerAll ? 'Ledger' : 'My coin history'}
            subtitle={g.ledgerAll ? 'Every coin movement in the company' : 'Coins you received and paid out'}
            chevron
            onPress={() => router.push('/admin/bounty/ledger')}
          />
        ) : null}
        {g.summary ? (
          <ActivityRow module="bounty" icon={BarChart3} title="Summary" subtitle="Coins added, given out and paid" chevron onPress={() => router.push('/admin/bounty/summary')} />
        ) : null}
      </ActivityList>
    </Screen>
  );
}
