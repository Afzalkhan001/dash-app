// My coins — state, then the one action, then history:
//   1. the light coins hero: coins I can use (earned − used), earned this month in its info chip, and
//      earned / used (and referral) figures at its foot. The 500 rule is told only where it matters: the bottom-bar note (too few
//      coins) or the Use coins sheet,
//   2. at most one notice: my reward is ready, or my request is waiting,
//   3. Rewards (my requests) and Coin history (GET /bounty_transactions, my own wallet), latest few
//      each with "Show all", and — for Bounty Task Creators — their task funds, read-only.
// The one action sits in the bottom bar: "Use coins" (opens a short sheet) or, once Super Admin/HR
// approves, "Get my coupon". Same rules as the website: one request at a time, at least 500, in steps
// of 500, and the coupon opens through a one-time 20-hour reveal.

import { useQueryClient } from '@tanstack/react-query';
import { Gift, ReceiptText } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';

import { BOUNTY_REDEEM_MIN, type BountyRedemption, type BountyTxn, useBountyTransactions, useBountyWallet, useMyBountyRedemptions } from '@/api/bounty';
import { useSession } from '@/auth/session';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { BountyCoinsHero, BountyCoinsHeroSkeleton, BountyTxnRow } from '@/features/bounty/components';
import { BountyGate } from '@/features/bounty/gate';
import { useBountyLabels } from '@/features/bounty/hooks';
import { asArray, coins, earnedThisMonth, num, redemptionState } from '@/features/bounty/logic';
import { CreatorFundsCard, RewardRow, UseCoinsSheet, useRevealCoupon } from '@/features/bounty/wallet';
import { palette } from '@/theme/tokens';
import { ActionBar, ActivityList, Banner, Button, Card, EmptyState, ErrorState, NavHeader, Screen } from '@/ui';

const TITLE = 'My coins';
const REWARDS_PREVIEW = 3;
const HISTORY_PREVIEW = 5;

export default function BountyWalletScreen() {
  return (
    <BountyGate title={TITLE}>
      <MyCoins />
    </BountyGate>
  );
}

function MyCoins() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.user?.id) ?? '';
  const { isCreator } = useBountyLabels();
  const now = useNow();
  const today = useTodayIst();
  const walletQ = useBountyWallet();
  const redQ = useMyBountyRedemptions();
  const txnsQ = useBountyTransactions();
  const coupon = useRevealCoupon();
  const [sheet, setSheet] = useState(false);
  const [allRewards, setAllRewards] = useState(false);
  const [allTxns, setAllTxns] = useState(false);

  const wallet = walletQ.data && typeof walletQ.data === 'object' ? walletQ.data : undefined;
  const earned = num(wallet?.earned);
  const used = num(wallet?.redeemed);
  const referral = num(wallet?.referralEarned);
  const redeemable = Math.max(0, earned - used);
  const reqs = asArray<BountyRedemption>(redQ.data).filter((r) => !!r && typeof r === 'object' && !!r.id);
  const { readyToUse, hasActive } = redemptionState(reqs, now);
  const waiting = reqs.find((r) => r.status === 'pending');
  const txns = asArray<BountyTxn>(txnsQ.data).filter((t) => !!t && typeof t === 'object' && !!t.id);
  const tooFew = redeemable < BOUNTY_REDEEM_MIN;
  const month = earnedThisMonth(txns, userId, today.slice(0, 7));

  const loading = walletQ.isLoading || redQ.isLoading;
  const failed = walletQ.error && !wallet ? walletQ.error : redQ.error && !redQ.data ? redQ.error : null;

  // The one action for this screen, pinned to the bottom. Nothing while a request is waiting.
  let footer: ReactNode = null;
  if (!loading && !failed) {
    if (readyToUse) {
      footer = (
        <ActionBar>
          <Button
            title={readyToUse.codeRevealedAt ? 'Open coupon link' : 'Get my coupon'}
            icon={<Gift />}
            loading={coupon.busy}
            onPress={() => coupon.open(readyToUse)}
          />
        </ActionBar>
      );
    } else if (!hasActive) {
      footer = (
        <ActionBar note={tooFew ? `You need at least ${coins(BOUNTY_REDEEM_MIN)} coins to use them.` : null}>
          <Button title="Use coins" icon={<Gift />} disabled={tooFew} onPress={() => setSheet(true)} />
        </ActionBar>
      );
    }
  }

  const stats = [
    { label: 'Earned', value: coins(earned) },
    { label: 'Used', value: coins(used) },
    ...(referral > 0 ? [{ label: 'Referrals', value: coins(referral) }] : []),
  ];

  return (
    <>
      <Screen
        header={<NavHeader title={TITLE} />}
        footer={footer}
        onRefresh={() =>
          Promise.all([
            qc.invalidateQueries({ queryKey: ['bounty', 'wallet'] }),
            qc.invalidateQueries({ queryKey: ['bounty', 'redemptions'] }),
            qc.invalidateQueries({ queryKey: ['bounty', 'txns'] }),
          ])
        }>
        {loading ? (
          <BountyCoinsHeroSkeleton />
        ) : failed ? (
          <Card>
            <ErrorState
              title="Couldn’t load your coins"
              message={failed.message}
              onRetry={() => void Promise.all([walletQ.refetch(), redQ.refetch()])}
            />
          </Card>
        ) : (
          <BountyCoinsHero
            redeemable={redeemable}
            info={month > 0 ? { label: 'Earned this month', value: `+${coins(month)}` } : undefined}
            caption={month > 0 ? undefined : 'Earn coins for extra tasks'}
            stats={stats}
          />
        )}

        {readyToUse ? (
          <Banner
            tone="success"
            icon={Gift}
            title="Your reward is ready"
            message={`${coins(readyToUse.coins)} coins approved by ${readyToUse.approvedBy || 'Super Admin'}.`}
          />
        ) : waiting ? (
          <Banner tone="info" title="Request sent" message={`${coins(waiting.coins)} coins. Super Admin or HR will reply soon.`} />
        ) : null}

        {reqs.length ? (
          <ActivityList
            title="Rewards"
            onSeeAll={!allRewards && reqs.length > REWARDS_PREVIEW ? () => setAllRewards(true) : undefined}
            seeAllAccessibilityLabel={`See all ${reqs.length} rewards`}>
            {(allRewards ? reqs : reqs.slice(0, REWARDS_PREVIEW)).map((r) => (
              <RewardRow key={r.id} r={r} />
            ))}
          </ActivityList>
        ) : null}

        {isCreator ? <CreatorFundsCard wallet={wallet} /> : null}

        {/* One ActivityList for every state, so loading, error and rows share the same header and card. */}
        <ActivityList
          title="Coin history"
          loading={txnsQ.isLoading}
          onSeeAll={!allTxns && txns.length > HISTORY_PREVIEW ? () => setAllTxns(true) : undefined}
          seeAllAccessibilityLabel={`See all ${txns.length} coin movements`}
          empty={
            txnsQ.error && !Array.isArray(txnsQ.data) ? (
              <ErrorState message={txnsQ.error.message} onRetry={() => void txnsQ.refetch()} />
            ) : (
              <EmptyState icon={<ReceiptText color={palette.textMuted} />} title="No coins yet" message="Coins you earn and use show up here." />
            )
          }>
          {(allTxns ? txns : txns.slice(0, HISTORY_PREVIEW)).map((t) => (
            <BountyTxnRow key={t.id} txn={t} userId={userId} />
          ))}
        </ActivityList>
      </Screen>
      <UseCoinsSheet visible={sheet} onClose={() => setSheet(false)} redeemable={redeemable} />
    </>
  );
}
