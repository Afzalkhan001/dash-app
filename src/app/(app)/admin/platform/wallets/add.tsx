// Add bounty coins to a company's wallet (BountyCompanyOverview "Add Bounty Coins", dash.html:12039) as
// Payno's "Send money" flow, for the platform owner only (server.js:5046 refuses everyone else):
//   1. How many: AmountEntry on the NumericKeypad (whole coins only), "Next" above it;
//   2. Why: the amount as an AccountRow (its "Change" goes back), the reason / reference;
//   → ConfirmSheet (Platform → the company's wallet, swipe) → POST /bounty/company/add-coins
//   { tenantId, amount, reason } → SuccessSheet → back to Company wallets, which already shows it.
// These are real coins; they can be taken back later only while none were given out (Cancel on the credit).

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Coins } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { companyName, useAddCompanyCoins, useCompanyWallet } from '@/api/platform';
import { canMoveCompanyCoins } from '@/features/platform/access';
import { coins, usePlatformGate } from '@/features/platform/gate';
import { CompanyPicker } from '@/features/platform/ui';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  AmountEntry,
  amountValue,
  Banner,
  Button,
  ConfirmSheet,
  ErrorState,
  KeypadWash,
  NavHeader,
  NumericKeypad,
  Screen,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  TextField,
  useAmountKeypad,
  useLayout,
} from '@/ui';

const MAX_COINS = 10_000_000;
const MAX_REASON = 200;

export default function AddCompanyCoinsScreen() {
  const router = useRouter();
  const l = useLayout();
  const params = useLocalSearchParams<{ company?: string }>();
  const { user, ready, tenantsQ, tenants } = usePlatformGate();
  const allowed = canMoveCompanyCoins(user);
  const [chosen, setChosen] = useState('');
  const [step, setStep] = useState<'amount' | 'reason'>('amount');
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ amount: number; name: string } | null>(null);
  const add = useAddCompanyCoins();
  const pad = useAmountKeypad(text, setText, { max: MAX_COINS, decimals: 0 });

  const asked = typeof params.company === 'string' ? params.company : '';
  const cid = [chosen, asked].find((x) => x && tenants.some((t) => t.id === x)) ?? tenants[0]?.id ?? '';
  const t = tenants.find((x) => x.id === cid) ?? null;
  const walletQ = useCompanyWallet(allowed && cid ? cid : null);

  if (ready && !allowed) return <Redirect href="/" />;

  const name = companyName(t);
  const amount = Math.round(amountValue(text));
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/admin/platform/wallets'));
  const back = () => {
    if (add.isPending) return;
    if (step === 'reason') return setStep('amount');
    leave();
  };

  const submit = () => {
    if (!t || amount <= 0) return;
    add.mutate(
      { tenantId: t.id, amount, reason },
      {
        onSuccess: () => {
          setConfirming(false);
          setTimeout(() => setDone({ amount, name }), 320);
        },
      },
    );
  };

  const header = <NavHeader title="Add coins" subtitle={done ? undefined : `Step ${step === 'amount' ? 1 : 2} of 2`} onBack={back} />;

  if (!tenantsQ.data) {
    return (
      <Screen header={<NavHeader title="Add coins" />}>
        {tenantsQ.isError ? <ErrorState message={tenantsQ.error?.message ?? 'The companies could not be loaded.'} onRetry={() => void tenantsQ.refetch()} /> : <SkeletonList rows={3} />}
      </Screen>
    );
  }
  if (!t) {
    return (
      <Screen header={<NavHeader title="Add coins" />}>
        <ErrorState title="No company to add coins to" message="Register a company first, in Companies." />
      </Screen>
    );
  }

  const sheets = (
    <>
      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Add these coins?"
        from={{ title: 'DASH platform', subtitle: 'You', icon: Coins, module: 'bounty' }}
        to={{ title: `${name} wallet`, subtitle: `${coins(amount)} coins`, icon: Building2, module: 'policies' }}
        detailsTitle="Credit"
        confirmLabel="Swipe to add coins"
        onConfirm={submit}
        loading={add.isPending}
        note={`${name}’s Super Admin can then give them out. No one is emailed.`}>
        <SummaryCard
          rows={[
            { key: 'co', label: 'Company', value: name },
            { key: 'why', label: 'Reason', value: reason.trim() || '—' },
            { key: 'now', label: 'Wallet after', value: walletQ.data ? `${coins(walletQ.data.available + amount)} coins` : '—' },
          ]}
          total={{ label: 'Coins', value: `+${coins(amount)}` }}
        />
        {add.error ? <Banner tone="danger" message={`Couldn’t add the coins: ${add.error.message}`} /> : null}
      </ConfirmSheet>
      <SuccessSheet
        visible={!!done}
        onClose={() => {
          setDone(null);
          leave();
        }}
        title="Coins added"
        subtitle={done ? `${coins(done.amount)} coins are in ${done.name}’s wallet.` : undefined}
        onPrimary={() => {
          setDone(null);
          leave();
        }}>
        <SummaryCard
          rows={[
            { key: 'co', label: 'Company', value: done?.name ?? '' },
            { key: 'why', label: 'Reason', value: reason.trim() || '—' },
            { key: 'st', label: 'Status', value: 'Added', status: 'done' },
          ]}
          total={{ label: 'Coins', value: `+${coins(done?.amount ?? 0)}` }}
        />
      </SuccessSheet>
    </>
  );

  if (step === 'reason') {
    return (
      <>
        <Screen
          header={header}
          footer={
            <ActionBar note={reason.trim() ? null : 'A reason helps the company see what the coins are for.'}>
              <Button title="Check" disabled={amount <= 0} onPress={() => { add.reset(); setConfirming(true); }} />
            </ActionBar>
          }>
          <AccountRow
            icon={Coins}
            module="bounty"
            title={`${coins(amount)} coins`}
            sub={`To ${name}`}
            onChange={() => setStep('amount')}
            actionAccessibilityLabel="Change the amount"
          />
          <TextField
            label="Reason or reference"
            value={reason}
            onChangeText={setReason}
            placeholder="Q3 bounty budget"
            maxLength={MAX_REASON}
            counter
            multiline
            hint="Shown on the credit, to you and the company."
          />
        </Screen>
        {sheets}
      </>
    );
  }

  const fade = l.height < 700 || l.fontScale > 1.15 ? space.xl : space.xxxl + space.lg;
  return (
    <>
      <Screen header={header} scroll={false} animate={false} contentStyle={styles.noGutter}>
        <ScrollView style={styles.flex} contentContainerStyle={[styles.top, { paddingHorizontal: l.gutter, gap: l.gap }]} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'flex-start' }}>
            <CompanyPicker tenants={tenants} value={cid} onChange={setChosen} />
          </View>
          <AmountEntry
            label={`Coins for ${name}`}
            value={text}
            currency=""
            decimals={0}
            helper={t.bountyEnabled === false ? 'Bounty is off for this company: nobody there can use coins until it is on.' : 'Whole coins only.'}
            meta={walletQ.data ? `Now ${coins(walletQ.data.available)}` : undefined}
          />
        </ScrollView>
        <KeypadWash fade={fade} style={styles.wash}>
          <Button variant="accent" title="Next" disabled={amount <= 0} onPress={() => setStep('reason')} />
          <NumericKeypad onKey={pad.onKey} decimal={pad.decimal} />
        </KeypadWash>
      </Screen>
      {sheets}
    </>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  noGutter: { paddingHorizontal: 0 },
  top: { paddingTop: space.xxs, paddingBottom: space.md },
  wash: { gap: space.md },
}));
