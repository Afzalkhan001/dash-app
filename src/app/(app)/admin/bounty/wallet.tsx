// My task funds — the website's "My Wallet" for task posters and Super Admin / CEO / COO (dash.html
// BountyWalletView :13195): what Super Admin gave me to fund tasks, what is held in open tasks, what
// I paid people, my Referral Coins (HR, Super Admin, CEO, COO), and — for task posters — "Return coins
// to the company" (POST /bounty/return-to-company). Coins I earned myself stay on Bounty rewards › My
// coins: they can't fund tasks, and funding coins can't be used for rewards.

import { useRouter } from 'expo-router';
import { Building2, Undo2, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useBountyWallet } from '@/api/bounty';
import { returnCoinsToCompany, useInvalidateBountyAdmin, useLedger } from '@/api/bountyadmin';
import { useTodayIst } from '@/features/attendance/use-now';
import { coins, dateTimeLabel, num } from '@/features/bounty/logic';
import { CoinsField } from '@/features/bountyadmin/components';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { creatorAvailable, ledgerTypeLabel, referralAvailable } from '@/features/bountyadmin/logic';
import { isJobOpeningCreator } from '@/lib/access';
import { radius, space } from '@/theme/tokens';
import { ActionBar, ActivityList, ActivityRow, Button, Card, ConfirmSheet, ErrorState, NavHeader, Screen, Skeleton, SummaryCard, SummaryHero, TextField, toast } from '@/ui';

const TITLE = 'My task funds';
const RECENT = 8;

export default function WalletScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.wallet} ready={ready} title={TITLE}>
      <Funds />
    </AdminGate>
  );
}

function Funds() {
  const router = useRouter();
  const today = useTodayIst();
  const invalidate = useInvalidateBountyAdmin();
  const { user, gates: g } = useBountyAdmin();
  const walletQ = useBountyWallet();
  const txQ = useLedger({ employeeId: user?.id ?? '' }, !!user);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const w = walletQ.data && typeof walletQ.data === 'object' ? walletQ.data : undefined;
  const available = creatorAvailable(w);
  const referral = isJobOpeningCreator(user) || num(w?.referralEarned) > 0;
  const n = Math.round(Number(amount)) || 0;
  const err = !n ? 'Enter how many coins to return.' : n > available ? `You have ${coins(available)} coins to return.` : null;
  const rows = Array.isArray(txQ.data) ? txQ.data : [];

  const send = async () => {
    if (err) return;
    setSaving(true);
    try {
      await returnCoinsToCompany(n, reason.trim());
      await invalidate();
      setOpen(false);
      toast.show(`${coins(n)} coins returned to the company`, 'success');
    } catch (e) {
      Alert.alert('Coins not returned', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Screen
        header={<NavHeader title={TITLE} />}
        onRefresh={() => Promise.all([walletQ.refetch(), txQ.refetch()])}
        footer={
          g.create && available > 0 ? (
            <ActionBar>
              <Button
                title="Return coins to the company"
                variant="ghost"
                icon={<Undo2 />}
                onPress={() => {
                  setAmount('');
                  setReason('');
                  setOpen(true);
                }}
              />
            </ActionBar>
          ) : undefined
        }>
        {walletQ.isLoading ? (
          <Skeleton height={168} radius={radius.xxl} />
        ) : walletQ.error && !w ? (
          <Card>
            <ErrorState message={walletQ.error.message} onRetry={() => void walletQ.refetch()} />
          </Card>
        ) : (
          <SummaryHero
            icon={Wallet}
            module="bounty"
            label="Coins to fund tasks"
            value={available}
            unit="coins"
            info={{ label: 'Held in open tasks', value: coins(w?.reserved) }}
            action={g.create ? { title: 'Post a task', onPress: () => router.push('/admin/bounty/tasks/new') } : undefined}
          />
        )}
        <SummaryCard
          title="Bounty Coins"
          rows={[
            { key: 'got', label: 'Received from Super Admin', value: coins(w?.allocated) },
            { key: 'held', label: 'Held in open tasks', value: coins(w?.reserved) },
            { key: 'paid', label: 'Paid to people', value: coins(w?.spent) },
          ]}
          total={{ label: 'Left to fund tasks', value: `${coins(available)} coins` }}
        />
        {referral ? (
          <SummaryCard
            title="Referral Coins"
            rows={[
              ...(isJobOpeningCreator(user)
                ? [
                    { key: 'got', label: 'Received from Super Admin', value: coins(w?.referralAllocated) },
                    { key: 'held', label: 'Held (older postings)', value: coins(w?.referralReserved) },
                    { key: 'left', label: 'Left for referral bonuses', value: coins(referralAvailable(w)) },
                  ]
                : []),
              { key: 'earned', label: 'Earned from referrals', value: coins(w?.referralEarned) },
            ]}
          />
        ) : null}
        <ActivityList
          title="Coin history"
          onSeeAll={rows.length > RECENT ? () => router.push('/admin/bounty/ledger') : undefined}
          loading={txQ.isLoading}
          empty="No coin movements yet.">
          {rows.slice(0, RECENT).map((t) => {
            const credit = t.toWalletId === user?.id;
            const debit = t.fromWalletId === user?.id && t.type !== 'BOUNTY_REWARD_TRANSFER';
            return (
              <ActivityRow
                key={t.id}
                module="bounty"
                icon={credit ? Wallet : Building2}
                title={ledgerTypeLabel(t.type)}
                subtitle={[t.taskName, t.reason].filter(Boolean).join(' · ') || dateTimeLabel(t.createdAt, today)}
                meta={dateTimeLabel(t.createdAt, today)}
                value={credit ? `+${coins(t.amount)}` : debit ? `−${coins(t.amount)}` : coins(t.amount)}
                status={t.reversedAt ? { label: 'Cancelled', tone: 'failed' } : null}
              />
            );
          })}
        </ActivityList>
      </Screen>

      <ConfirmSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Return coins to the company?"
        from={{ title: 'You', subtitle: `${coins(available)} coins left`, avatar: { name: user?.name || 'You' } }}
        to={{ title: 'Company wallet', icon: Building2, module: 'bounty' }}
        confirmLabel="Swipe to return coins"
        onConfirm={() => void send()}
        loading={saving}
        disabled={!!err}
        note={err ?? 'Super Admin can give them out again. No message is sent.'}>
        <View style={{ gap: space.md }}>
          <CoinsField label="How many" value={amount} onChange={setAmount} placeholder={`Up to ${coins(available)}`} />
          <TextField label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={200} placeholder="e.g. Project wrapped under budget" />
        </View>
      </ConfirmSheet>
    </>
  );
}
