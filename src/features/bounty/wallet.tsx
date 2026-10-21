// Pieces of the My coins screen (app/(app)/bounty/wallet.tsx):
//   UseCoinsSheet     — ask to use coins (the website's BountyCoinsProfileCard, dash.html ~L28496, same
//                       rules: at least 500, in steps of 500, one request at a time), POST /bounty_redemptions
//   RewardRow         — one past request (waiting / approved / coupon sent / rejected)
//   CreatorFundsCard  — Bounty Task Creators only: the coins they fund tasks with, read-only
// The coupon itself is opened from the screen's bottom bar (useRevealCoupon).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Gift, Send } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { BOUNTY_REDEEM_MIN, type BountyRedemption, type BountyWallet, requestBountyRedemption, revealBountyRedemption } from '@/api/bounty';
import { isApiError } from '@/api/client';
import { useTodayIst } from '@/features/attendance/use-now';
import { space } from '@/theme/tokens';
import { ActivityRow, Banner, Button, Chip, ChipRow, haptic, hitSlopFor, Sheet, SummaryCard, Text, TextField, toast } from '@/ui';

import { coinChoices, coins, dateTimeLabel, num, redeemError, redemptionStatusMeta } from './logic';

import { themedStyles } from '@/theme/themed';
const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

// ── Use coins ────────────────────────────────────────────────────────────────
export function UseCoinsSheet({ visible, onClose, redeemable }: { visible: boolean; onClose: () => void; redeemable: number }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  // fieldError: the amount breaks a rule (under the field); error: the request itself failed.
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const have = Math.max(0, num(redeemable));
  const amt = Math.round(Number(amount));
  const notStep = !!amount && amt % BOUNTY_REDEEM_MIN !== 0;
  const choices = coinChoices(have);

  // The sheet stays mounted, so closing it (including "Discard") clears what was typed and any error.
  const close = () => {
    setAmount('');
    setFieldError(null);
    setError(null);
    onClose();
  };

  const redeem = useMutation({
    mutationFn: async (n: number) => {
      const r = await requestBountyRedemption(n);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      haptic.success();
      close();
      toast.show('Request sent. Super Admin or HR will reply.');
      void qc.invalidateQueries({ queryKey: ['bounty', 'redemptions'] });
      void qc.invalidateQueries({ queryKey: ['bounty', 'wallet'] });
    },
    onError: (e: Error) => {
      haptic.error();
      setError(e.message);
    },
  });

  const pick = (v: string) => {
    setAmount(v.replace(/[^\d]/g, ''));
    setFieldError(null);
    setError(null);
  };

  const submit = () => {
    const err = redeemError(amt, have);
    if (err) {
      haptic.warning();
      setFieldError(err);
      return;
    }
    setFieldError(null);
    setError(null);
    redeem.mutate(amt);
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      dirty={!!amount && !redeem.isPending}
      title="Use coins"
      subtitle={`You have ${coins(have)}. Use ${coins(BOUNTY_REDEEM_MIN)} or more, in steps of ${coins(BOUNTY_REDEEM_MIN)}.`}
      footer={<Button title="Send request" icon={<Send />} loading={redeem.isPending} disabled={!amount || notStep} onPress={submit} />}>
      {choices.length ? (
        <ChipRow wrap style={styles.chips}>
          {choices.map((n) => (
            <Chip key={n} label={coins(n)} selected={amt === n} onPress={() => pick(String(n))} />
          ))}
        </ChipRow>
      ) : null}
      <TextField
        label="Coins to use"
        value={amount}
        onChangeText={pick}
        keyboardType="number-pad"
        placeholder={`e.g. ${coins(BOUNTY_REDEEM_MIN)}`}
        error={notStep ? `Use steps of ${coins(BOUNTY_REDEEM_MIN)}.` : fieldError}
        editable={!redeem.isPending}
      />
      {error ? <Banner tone="danger" title="Couldn’t send your request" message={error} /> : null}
    </Sheet>
  );
}

// ── Open an approved coupon ──────────────────────────────────────────────────
/** Opening the coupon the first time sends it to WhatsApp and starts its 20-hour window (server rule). */
export function useRevealCoupon() {
  const qc = useQueryClient();
  const reveal = useMutation({
    mutationFn: async (r: BountyRedemption) => {
      const res = await revealBountyRedemption(r.id);
      if (isApiError(res)) throw new Error(res.error);
      return res.request ?? r;
    },
    onSuccess: async (req) => {
      void qc.invalidateQueries({ queryKey: ['bounty', 'redemptions'] });
      if (req?.amazonLink) await WebBrowser.openBrowserAsync(withScheme(req.amazonLink));
    },
    onError: (e: Error) => Alert.alert('Couldn’t open your coupon', e.message),
  });

  const open = (r: BountyRedemption) => {
    if (r.codeRevealedAt) {
      Alert.alert(
        'Open your coupon link?',
        `Your code was sent to your WhatsApp${r.codeExpiresAt ? ` and works until ${dateTimeLabel(r.codeExpiresAt)}` : ''}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open link', onPress: () => reveal.mutate(r) },
        ],
      );
      return;
    }
    Alert.alert(
      'Get your coupon?',
      'The link opens now and the code is sent to your WhatsApp. Both work for 20 hours, and you can do this only once.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Get coupon', onPress: () => reveal.mutate(r) },
      ],
    );
  };

  return { open, busy: reveal.isPending };
}

// ── Past requests ────────────────────────────────────────────────────────────
export function RewardRow({ r }: { r: BountyRedemption }) {
  const today = useTodayIst();
  const s = redemptionStatusMeta(r);
  const declined = r.status === 'declined' && r.declineReason ? r.declineReason : null;
  return (
    <ActivityRow
      module="bounty"
      icon={Gift}
      title={`${coins(r.coins)} coins`}
      subtitle={declined ? `Reason: ${declined}` : dateTimeLabel(r.requestedAt, today)}
      note={declined ? dateTimeLabel(r.requestedAt, today) : null}
      status={s}
    />
  );
}

// ── Creator funds ────────────────────────────────────────────────────────────
// Creators fund tasks from coins Super Admin gave them — kept apart from coins they earned.
export function CreatorFundsCard({ wallet }: { wallet: BountyWallet | undefined }) {
  if (!wallet || typeof wallet !== 'object') return null;
  const available = Math.max(0, num(wallet.allocated) - num(wallet.reserved) - num(wallet.spent));
  return (
    <View style={{ gap: space.xs }}>
      <SummaryCard
        title="Task funds"
        rows={[
          { key: 'held', label: 'Held in open tasks', value: coins(wallet.reserved) },
          { key: 'got', label: 'Received from Super Admin', value: coins(wallet.allocated) },
          { key: 'paid', label: 'Paid to employees', value: coins(wallet.spent) },
        ]}
        total={{ label: 'Available', value: `${coins(available)} coins` }}
      />
      <Text variant="caption" muted numberOfLines={2} style={{ paddingHorizontal: space.xxs }}>
        For tasks you post. These can’t be used for rewards. Post tasks on the DASH website.
      </Text>
    </View>
  );
}

// Chip is 34 dp tall; this pads its row out to a 48 dp touch band without moving anything.
const CHIP_SLOP = hitSlopFor(34);
const styles = themedStyles(() => ({
  chips: { paddingVertical: CHIP_SLOP, marginVertical: -CHIP_SLOP },
}));
