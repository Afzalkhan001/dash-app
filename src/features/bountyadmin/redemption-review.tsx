// One use-coins request — the website's Redemption Requests row actions (dash.html BountyRedemptionsView
// :13455-13540): Approve with an Amazon link and coupon code (POST /bounty_redemptions/:id/approve:
// takes the coins off the person's earned balance for good, then emails and WhatsApps them), or
// Decline with a reason (…/decline: also emails and WhatsApps them). Both are swipes that say so.
// Who may decide: Super Admin and HR; the App Manager only with Company settings › App Manager
// approvals on (dash.html:13499). Used by /admin/bounty/redemptions/<id> and the Inbox kind
// `bounty-coins` (/inbox/bounty-coins/<id>).

import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Check, Gift, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import type { BountyWallet } from '@/api/bounty';
import { approveRedemption, declineRedemption, useCompanyRedemptions, useInvalidateBountyAdmin } from '@/api/bountyadmin';
import { api, unwrap } from '@/api/client';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { coins, dateTimeLabel, num, redemptionStatusMeta } from '@/features/bounty/logic';
import { noteDecision } from '@/features/inbox/decided';
import { DecidedSheet, DetailSkeleton, explainDecisionError, MissingItem, outcomeStatus, requesterItem, useOutcome, WhoCards } from '@/features/inbox/detail';
import { space } from '@/theme/tokens';
import { ActionBar, ActionRow, Banner, Button, ConfirmSheet, NavHeader, Screen, SummaryCard, SummaryHero, TextField } from '@/ui';

import { useBountyAdmin } from './gate';

const TITLE = 'Use-coins request';

/** Their wallet (server.js:5124: USER_ADMIN of the same company may read it) — to see the coins are there. */
function usePersonWallet(id: string, enabled: boolean) {
  const uid = useSession((s) => s.user?.id) ?? '';
  return useQuery({
    queryKey: ['bountyadmin', 'person-wallet', uid, id],
    enabled: enabled && !!id && !!uid,
    queryFn: ({ signal }) => unwrap(api.get<BountyWallet>(`/bounty/wallet/${encodeURIComponent(id)}`, signal)),
    retry: false,
  });
}

export function RedemptionReviewScreen({ id }: { id: string }) {
  const router = useRouter();
  const today = useTodayIst();
  const uid = useSession((s) => s.user?.id);
  const { user, ready, gates: g } = useBountyAdmin();
  const q = useCompanyRedemptions(g.redemptions);
  const invalidate = useInvalidateBountyAdmin();
  const outcome = useOutcome();
  const r = Array.isArray(q.data) ? (q.data.find((x) => x?.id === id) ?? null) : null;
  const waiting = r?.status === 'pending';
  const decide = !!r && waiting && g.decideRedemptions && !outcome.done;
  const walletQ = usePersonWallet(r?.userId ?? '', decide);
  const [sheet, setSheet] = useState<'approve' | 'decline' | null>(null);
  const [link, setLink] = useState('');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (ready && !g.redemptions) return <Redirect href="/" />;
  if (!ready || (!r && q.isLoading)) return <DetailSkeleton title={TITLE} />;
  if (!r) return <MissingItem title={TITLE} />;

  const name = r.userName || 'Employee';
  const amount = num(r.coins);
  const status = redemptionStatusMeta(r);
  const left = walletQ.data ? Math.max(0, num(walletQ.data.earned) - num(walletQ.data.redeemed)) : null;
  const approveErr = !link.trim() ? 'Enter the Amazon link.' : !code.trim() ? 'Enter the coupon code.' : null;

  const approve = async () => {
    if (approveErr) return;
    setSaving(true);
    try {
      await approveRedemption(r.id, link.trim(), code.trim());
      noteDecision(`bounty-coins:${r.id}`, uid, 'approve');
      await invalidate();
      setSheet(null);
      outcome.show(
        {
          decision: 'approve',
          title: 'Approved',
          subtitle: `${name} gets an email and a WhatsApp, and opens the coupon in DASH.`,
          rows: [outcomeStatus('approve'), { key: 'coins', label: 'Coins used', value: coins(amount) }],
        },
        true,
      );
    } catch (e) {
      setSheet(null);
      explainDecisionError(e, () => router.back());
    } finally {
      setSaving(false);
    }
  };

  const decline = async () => {
    setSaving(true);
    try {
      await declineRedemption(r.id, reason.trim());
      noteDecision(`bounty-coins:${r.id}`, uid, 'reject');
      await invalidate();
      setSheet(null);
      outcome.show(
        {
          decision: 'reject',
          title: 'Declined',
          subtitle: `${name} gets an email and a WhatsApp. Their coins stay with them.`,
          rows: [outcomeStatus('reject', { reject: 'Declined' }), { key: 'coins', label: 'Coins asked', value: coins(amount) }],
        },
        true,
      );
    } catch (e) {
      setSheet(null);
      explainDecisionError(e, () => router.back());
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Screen
        header={<NavHeader title={TITLE} />}
        footer={
          decide ? (
            <ActionBar note="Both send them an email and a WhatsApp.">
              <ActionRow context="bar">
                <Button
                  title="Decline"
                  variant="danger"
                  icon={<X />}
                  onPress={() => {
                    setReason('');
                    setSheet('decline');
                  }}
                />
                <Button
                  title="Approve"
                  icon={<Check />}
                  onPress={() => {
                    setLink('');
                    setCode('');
                    setSheet('approve');
                  }}
                />
              </ActionRow>
            </ActionBar>
          ) : undefined
        }>
        <SummaryHero icon={Gift} module="bounty" label="Coins to use" value={amount} unit="coins" info={{ label: 'Asked', value: dateTimeLabel(r.requestedAt, today) }} />
        <WhoCards
          from={requesterItem(name, 'Wants to use coins')}
          to={
            decide
              ? { title: 'You', subtitle: 'Approve or decline', avatar: { name: user?.name || 'You' } }
              : { title: r.approvedBy || (r as { declinedBy?: string }).declinedBy || 'Super Admin or HR', subtitle: status.label, avatar: { name: r.approvedBy || (r as { declinedBy?: string }).declinedBy || 'HR' } }
          }
        />
        {waiting && !g.decideRedemptions ? <Banner tone="info" title="View only" message="Approving is switched off for your role in Company settings." /> : null}
        {decide && left != null && left < amount ? (
          <Banner tone="warning" title="Not enough coins" message={`${name} has ${coins(left)} coins to use now, less than asked. Approving will fail.`} />
        ) : null}
        {r.status === 'declined' && r.declineReason ? <Banner tone="danger" title="Declined" message={`“${r.declineReason}”`} /> : null}
        <SummaryCard
          title="Details"
          hideEmpty
          rows={[
            { key: 'status', label: 'Status', value: status.label, status: status.tone },
            { key: 'left', label: 'They can use now', value: left != null ? `${coins(left)} coins` : null },
            { key: 'appr', label: 'Approved', value: r.approvedAt ? `${dateTimeLabel(r.approvedAt, today)}${r.approvedBy ? ` · ${r.approvedBy}` : ''}` : null },
            { key: 'code', label: 'Coupon code', value: r.status === 'approved' ? r.couponCode || null : null },
            { key: 'used', label: 'Coupon opened', value: r.codeRevealedAt ? dateTimeLabel(r.codeRevealedAt, today) : null },
            { key: 'dec', label: 'Declined', value: r.declinedAt ? dateTimeLabel(r.declinedAt, today) : null },
          ]}
        />
      </Screen>

      <ConfirmSheet
        visible={sheet === 'approve'}
        onClose={() => setSheet(null)}
        title="Approve and send the coupon"
        subtitle={`${name} · ${coins(amount)} coins`}
        confirmLabel="Swipe to approve"
        onConfirm={() => void approve()}
        loading={saving}
        disabled={!!approveErr}
        note={approveErr ?? `${name} gets an email and a WhatsApp. ${coins(amount)} coins come off their balance; this can’t be undone.`}>
        <View style={{ gap: space.md }}>
          <TextField label="Amazon link" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://amzn.to/…" />
          <TextField label="Coupon code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="e.g. BOUNTY500" />
        </View>
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'decline'}
        onClose={() => setSheet(null)}
        title="Decline this request?"
        subtitle={`${name} · ${coins(amount)} coins`}
        confirmLabel="Swipe to decline"
        onConfirm={() => void decline()}
        loading={saving}
        note={`${name} gets an email and a WhatsApp with your reason. Their coins stay with them.`}>
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={300} counter placeholder="Shown to them" />
      </ConfirmSheet>

      <DecidedSheet outcome={outcome.done} visible={outcome.open} onDone={() => router.back()} />
    </>
  );
}
