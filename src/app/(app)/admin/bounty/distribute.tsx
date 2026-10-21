// Give coins — the website's Coin Distribution (dash.html BountyDistribution :12184-12311) for Super
// Admin, CEO and COO:
//   1. the company wallet (what is left to give);
//   2. pick a task poster or HR person (GET /bounty/creators-summary), enter Bounty Coins and / or
//      Referral Coins and a reason, then swipe — POST /bounty/distribute moves the coins at once;
//   3. everyone's balances; Super Admin can revoke a poster's unused coins (POST /bounty/revoke-from-
//      creator), never coins they earned.
// The server allows sending and revoking for Super Admin only; a CEO / COO sees the server's refusal.
// Bounty Coins can only go to someone who may post tasks, Referral Coins only to someone who may post
// job openings (server.js:5086) — the form says so before you try.

import { useRouter } from 'expo-router';
import { ArrowDownToLine, Building2, Coins, HandCoins, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { type CreatorSummary, distributeCoins, revokeCoins, useCompanyWallet, useCreatorsSummary, useInvalidateBountyAdmin } from '@/api/bountyadmin';
import { coins, num } from '@/features/bounty/logic';
import { CoinsField } from '@/features/bountyadmin/components';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { referralAvailable, revocableOf, roleLabel } from '@/features/bountyadmin/logic';
import { PersonPicker, type PickPerson } from '@/features/shared/person-picker';
import { isBountyCreator, JOB_OPENING_CREATOR_ROLES } from '@/lib/access';
import { radius, space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  NavHeader,
  Screen,
  Sheet,
  Skeleton,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  TextField,
} from '@/ui';

const TITLE = 'Give coins';

export default function DistributeScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.distribute} ready={ready} title={TITLE}>
      <Distribute />
    </AdminGate>
  );
}

function Distribute() {
  const router = useRouter();
  const invalidate = useInvalidateBountyAdmin();
  const { tenant, gates: g } = useBountyAdmin();
  const companyQ = useCompanyWallet();
  const creatorsQ = useCreatorsSummary();
  const [pick, setPick] = useState(false);
  const [to, setTo] = useState<CreatorSummary | null>(null);
  const [bounty, setBounty] = useState('');
  const [referral, setReferral] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ name: string; b: number; r: number } | null>(null);
  const [open, setOpen] = useState<CreatorSummary | null>(null);
  const [revoking, setRevoking] = useState<CreatorSummary | null>(null);

  const available = num(companyQ.data?.available);
  const rows = Array.isArray(creatorsQ.data) ? creatorsQ.data : [];
  const canBounty = (c: CreatorSummary) => isBountyCreator({ id: c.id, role: String(c.role || ''), name: c.name, employeeNumber: c.employeeNumber }, tenant);
  const canReferral = (c: CreatorSummary) => JOB_OPENING_CREATOR_ROLES.includes(String(c.role || ''));
  const people: PickPerson[] = rows.map((c) => ({ id: c.id, name: c.name, employeeNumber: c.employeeNumber, jobTitle: roleLabel(c.role), role: c.role }));

  const b = Math.round(Number(bounty)) || 0;
  const r = Math.round(Number(referral)) || 0;
  // dash.html:12255 distribute() checks.
  const err = !to
    ? 'Choose who gets the coins.'
    : !b && !r
      ? 'Enter Bounty Coins, Referral Coins, or both.'
      : b + r > available
        ? `The company wallet has ${coins(available)} coins left.`
        : b > 0 && !canBounty(to)
          ? `${to.name} can’t post bounty tasks, so can’t get Bounty Coins.`
          : r > 0 && !canReferral(to)
            ? `${to.name} can’t post job openings, so can’t get Referral Coins.`
            : null;
  // The website shows this tab to CEO and COO, but the server sends coins only for Super Admin
  // (server.js:5077), so say so before they try.
  const serverRefuses = !g.revoke;

  const send = async () => {
    if (!to || err) return;
    setSaving(true);
    try {
      await distributeCoins(to.id, b, r, reason.trim());
      await invalidate();
      setConfirm(false);
      const name = to.name;
      setTo(null);
      setBounty('');
      setReferral('');
      setReason('');
      setTimeout(() => setDone({ name, b, r }), 400);
    } catch (e) {
      Alert.alert('Coins not given', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };


  return (
    <>
      <Screen
        header={<NavHeader title={TITLE} />}
        onRefresh={() => Promise.all([companyQ.refetch(), creatorsQ.refetch()])}
        footer={
          <ActionBar note={to || b || r ? err : null}>
            <Button title="Review" icon={<HandCoins />} disabled={!!err} onPress={() => setConfirm(true)} />
          </ActionBar>
        }>
        {companyQ.isLoading ? (
          <Skeleton height={150} radius={radius.xxl} />
        ) : companyQ.error && !companyQ.data ? (
          <Card>
            <ErrorState message={companyQ.error.message} onRetry={() => void companyQ.refetch()} />
          </Card>
        ) : (
          <SummaryHero icon={Building2} module="bounty" label="Company wallet" value={available} unit="coins" sub="What is left to give out" />
        )}
        {serverRefuses ? (
          <Banner tone="info" title="Only Super Admin can send" message="You can see the balances here, but DASH gives coins only when Super Admin sends them. Ask Super Admin to give coins." />
        ) : null}

        <View style={{ gap: space.md }}>
          {to ? (
            <AccountRow
              icon={UserRound}
              module="bounty"
              title={to.name}
              sub={`${roleLabel(to.role)}${to.employeeNumber ? ` · ${to.employeeNumber}` : ''}`}
              onChange={() => setPick(true)}
              actionAccessibilityLabel="Choose someone else"
            />
          ) : (
            <Button title="Choose who gets the coins" variant="ghost" icon={<UserRound />} onPress={() => setPick(true)} />
          )}
          <CoinsField
            label="Bounty Coins"
            value={bounty}
            onChange={setBounty}
            hint={to && !canBounty(to) ? `${to.name} can’t post bounty tasks, so can’t get Bounty Coins.` : 'They fund bounty tasks.'}
            error={to && b > 0 && !canBounty(to) ? `${to.name} can’t post bounty tasks.` : null}
          />
          <CoinsField
            label="Referral Coins"
            value={referral}
            onChange={setReferral}
            hint={to && !canReferral(to) ? `${to.name} can’t post job openings, so can’t get Referral Coins.` : 'They fund referral bonuses on job openings.'}
            error={to && r > 0 && !canReferral(to) ? `${to.name} can’t post job openings.` : null}
          />
          <TextField label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={200} placeholder="e.g. Q3 task budget" />
        </View>

        {creatorsQ.isLoading ? (
          <SkeletonList rows={3} />
        ) : rows.length ? (
          <ActivityList title="Balances">
            {rows.map((c) => (
              <ActivityRow
                key={c.id}
                person={{ name: c.name }}
                title={c.name}
                subtitle={`${roleLabel(c.role)} · ${num(c.tasksCreated)} ${num(c.tasksCreated) === 1 ? 'task' : 'tasks'} posted`}
                value={`${coins(revocableOf(c))}`}
                meta={referralAvailable(c) ? `+ ${coins(referralAvailable(c))} referral` : 'coins left'}
                chevron
                onPress={() => setOpen(c)}
              />
            ))}
          </ActivityList>
        ) : null}
      </Screen>

      <PersonPicker
        visible={pick}
        onClose={() => setPick(false)}
        title="Who gets the coins"
        subtitle="Task posters and HR"
        people={people}
        loading={creatorsQ.isLoading}
        selectedId={to?.id}
        allowOnLeave
        onPick={(p) => setTo(rows.find((c) => c.id === p.id) ?? null)}
      />

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Give these coins?"
        from={{ title: 'Company wallet', subtitle: `${coins(available)} coins`, icon: Building2, module: 'bounty' }}
        to={{ title: to?.name || '', subtitle: roleLabel(to?.role), avatar: { name: to?.name || '' } }}
        confirmLabel="Swipe to give coins"
        onConfirm={() => void send()}
        loading={saving}
        disabled={!!err}
        note="Coins move now. No message is sent. You can cancel it from the Ledger while the coins are unused.">
        <SummaryCard
          rows={[
            { key: 'b', label: 'Bounty Coins', value: b ? coins(b) : '—' },
            { key: 'r', label: 'Referral Coins', value: r ? coins(r) : '—' },
            { key: 'why', label: 'Reason', value: reason.trim() || '—' },
          ]}
          total={{ label: 'Left to give', value: `${coins(Math.max(0, available - b - r))} coins` }}
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={!!done}
        onClose={() => setDone(null)}
        title="Coins given"
        subtitle={done ? `${done.name} got ${[done.b ? `${coins(done.b)} Bounty Coins` : '', done.r ? `${coins(done.r)} Referral Coins` : ''].filter(Boolean).join(' and ')}.` : undefined}
        secondaryLabel="Open ledger"
        onSecondary={() => {
          setDone(null);
          router.push('/admin/bounty/ledger');
        }}
      />

      <Sheet
        visible={!!open}
        onClose={() => setOpen(null)}
        title={open?.name}
        subtitle={roleLabel(open?.role)}
        footer={
          g.revoke && open && revocableOf(open) > 0 ? (
            <Button
              title="Take back unused coins"
              variant="danger"
              icon={<ArrowDownToLine />}
              onPress={() => {
                const c = open;
                setOpen(null);
                setTimeout(() => setRevoking(c), 350);
              }}
            />
          ) : undefined
        }>
        {open ? (
          <View style={{ gap: space.md }}>
            <SummaryCard
              title="Bounty Coins"
              rows={[
                { key: 'a', label: 'Received', value: coins(open.allocated) },
                { key: 'h', label: 'Held in tasks', value: coins(open.reserved) },
                { key: 's', label: 'Paid to people', value: coins(open.spent) },
                { key: 'e', label: 'Earned from tasks', value: coins(open.earned) },
              ]}
              total={{ label: 'Left to use', value: `${coins(revocableOf(open))} coins` }}
            />
            <SummaryCard
              title="Referral Coins"
              rows={[
                { key: 'a', label: 'Received', value: coins(open.referralAllocated) },
                { key: 'h', label: 'Held', value: coins(open.referralReserved) },
                { key: 's', label: 'Paid out', value: coins(open.referralSpent) },
                { key: 'e', label: 'Earned', value: coins(open.referralEarned) },
              ]}
              total={{ label: 'Left to use', value: `${coins(referralAvailable(open))} coins` }}
            />
          </View>
        ) : null}
      </Sheet>

      <RevokeSheet creator={revoking} onClose={() => setRevoking(null)} />
    </>
  );
}

function RevokeSheet({ creator, onClose }: { creator: CreatorSummary | null; onClose: () => void }) {
  const invalidate = useInvalidateBountyAdmin();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [was, setWas] = useState<string | null>(null);
  if ((creator?.id ?? null) !== was) {
    setWas(creator?.id ?? null);
    setAmount('');
    setReason('');
  }
  const max = revocableOf(creator);
  const n = Math.round(Number(amount)) || 0;
  // dash.html:12224 confirmRevoke checks.
  const err = !n ? 'Enter how many coins to take back.' : n > max ? `Only ${coins(max)} unused coins can be taken back.` : null;
  const save = async () => {
    if (!creator || err) return;
    setSaving(true);
    try {
      await revokeCoins(creator.id, n, reason.trim());
      await invalidate();
      onClose();
      Alert.alert('Coins taken back', `${coins(n)} coins went back from ${creator.name} to the company wallet.`);
    } catch (e) {
      Alert.alert('Coins not taken back', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ConfirmSheet
      visible={!!creator}
      onClose={onClose}
      title="Take back unused coins"
      from={{ title: creator?.name || '', subtitle: `${coins(max)} unused`, avatar: { name: creator?.name || '' } }}
      to={{ title: 'Company wallet', icon: Coins, module: 'bounty' }}
      confirmLabel="Swipe to take back"
      onConfirm={() => void save()}
      loading={saving}
      disabled={!!err}
      note={err ?? 'Coins they earned from tasks are never taken. No message is sent.'}>
      <View style={{ gap: space.md }}>
        <Banner tone="info" message={`Only coins not held for a task or paid out can be taken back: ${coins(max)} coins.`} />
        <CoinsField label="How many" value={amount} onChange={setAmount} placeholder={`Up to ${coins(max)}`} />
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={200} />
      </View>
    </ConfirmSheet>
  );
}
