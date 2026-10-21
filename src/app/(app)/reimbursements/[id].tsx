// One expense claim. State first (the light summary hero: amount, status and one line on what it waits
// for), then the facts (a SummaryCard) and the bill (an AccountRow), then the history. The one thing I can do next sits in the sticky bar:
// confirm the payment (the same bar and sheet as a petty cash payment) or fix and resend a rejected
// claim. Approving or rejecting someone else's claim happens only in the Inbox: an old
// /reimbursements/<id>?scope=keka link, or a claim that is waiting on me, opens /inbox/keka/<id>.

import { Redirect, useLocalSearchParams } from 'expo-router';
import { Check, RefreshCw, SearchX } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { type Reimbursement, useKekaReimbursements, useMyReimbursements } from '@/api/reimbursements';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import {
  isoDayTime,
  lastReupload,
  purposeLabel,
  reimbursementEvents,
  reimbursementRef,
  reimbursementStatus,
  reimbursementStatusLine,
} from '@/features/reimbursements/format';
import { purposeIcon } from '@/features/reimbursements/purpose-icon';
import { ReceiptButton } from '@/features/reimbursements/receipt-viewer';
import { RespondSheet, ReuploadSheet } from '@/features/reimbursements/sheets';
import { Timeline } from '@/features/reimbursements/timeline';
import { inr } from '@/lib/format';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  SectionHeader,
  Skeleton,
  StatusPill,
  type SummaryItem,
  SummaryCard,
  SummaryHero,
  Text,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
// reimbursements.js mayActAsOwner: the claim's project owner, or these roles.
const OVERRIDE_ROLES = ['super_admin', 'master_admin'];

const amountOf = (r: Reimbursement) => {
  const n = Number(r.amount);
  return Number.isFinite(n) ? n : 0;
};
const isClaim = (r: unknown): r is Reimbursement => !!r && typeof r === 'object' && 'id' in r;

function Hero({ claim, mine, showLine, today }: { claim: Reimbursement; mine: boolean; showLine: boolean; today: string }) {
  const st = reimbursementStatus(claim);
  const line = showLine ? reimbursementStatusLine(claim, mine, today) : '';
  const reup = lastReupload(claim);
  return (
    <SummaryHero
      icon={purposeIcon(claim.purpose)}
      module="expenses"
      label={[purposeLabel(claim.purpose), claim.keka_code].filter(Boolean).join(' · ')}
      value={amountOf(claim)}
      currency="₹"
      info={reup ? { label: 'Amount changed', value: `was ${inr(reup.previousAmount)}` } : undefined}>
      <View style={styles.status}>
        <StatusPill label={st.label} tone={st.tone} />
        {line ? (
          <Text variant="label" muted numberOfLines={3}>
            {line}
          </Text>
        ) : null}
      </View>
    </SummaryHero>
  );
}

function DetailSkeleton() {
  const { gap } = useLayout();
  return (
    <View style={{ gap }} accessibilityLabel="Loading claim" accessibilityRole="progressbar">
      <Skeleton height={208} radius={radius.xxl} />
      <Skeleton height={200} radius={radius.xl} />
      <Skeleton height={44} radius={radius.pill} />
    </View>
  );
}

// Old links from the former "Claims to approve" list (?scope=keka) open the claim in the Inbox, where
// it is decided.
export default function ExpenseClaimRoute() {
  const { id, scope } = useLocalSearchParams<{ id: string; scope?: string }>();
  const claimId = typeof id === 'string' ? id : '';
  if (scope === 'keka' && claimId) return <Redirect href={`/inbox/keka/${encodeURIComponent(claimId)}`} />;
  return <ExpenseClaimDetail id={claimId} />;
}

function ExpenseClaimDetail({ id }: { id: string }) {
  const user = useSession((s) => s.user);
  const today = useTodayIst();
  const mine = useMyReimbursements();
  const inMine = (Array.isArray(mine.data) ? mine.data : []).filter(isClaim).find((r) => r.id === id);
  // Someone else's claim (opened by link) is read from the claims the server lists for me to approve.
  const keka = useKekaReimbursements(!!mine.data && !inMine);
  const claim = inMine ?? (Array.isArray(keka.data) ? keka.data : []).filter(isClaim).find((r) => r.id === id);
  const loading = mine.isLoading || (!claim && keka.isLoading);
  const error = !claim ? (mine.error ?? keka.error) : null;

  const [respond, setRespond] = useState<'received' | 'not_received' | null>(null);
  const [reupload, setReupload] = useState(false);

  const isMine = !!claim && claim.employee_id === user?.id;
  // Waiting on me as the project owner: decided in the Inbox, the one place approvals live.
  const waitsOnMe =
    !!claim && !isMine && claim.status === 'pending_keka_approval' && (claim.keka_owner_user_id === user?.id || OVERRIDE_ROLES.includes(user?.role || ''));
  const rejectedMine = isMine && claim?.status === 'rejected';

  if (claim && waitsOnMe) return <Redirect href={`/inbox/keka/${encodeURIComponent(claim.id)}`} />;

  // The one next step for this claim, pinned to the bottom (at most one applies at a time).
  let footer: ReactNode = undefined;
  if (claim && isMine && claim.status === 'payment_processing') {
    footer = (
      <ActionBar note="Did you get the money?">
        <ActionRow context="bar">
          <Button variant="danger" title="Not received" onPress={() => setRespond('not_received')} />
          <Button variant="primary" title="Received" icon={<Check />} onPress={() => setRespond('received')} />
        </ActionRow>
      </ActionBar>
    );
  } else if (claim && isMine && claim.status === 'not_received') {
    footer = (
      <ActionBar note="Has the money arrived now?">
        <Button variant="primary" title="Mark as received" icon={<Check />} onPress={() => setRespond('received')} />
      </ActionBar>
    );
  } else if (rejectedMine) {
    footer = (
      <ActionBar note="Fix the amount or the bill and send it again.">
        <Button variant="primary" title="Fix and resend" icon={<RefreshCw />} onPress={() => setReupload(true)} />
      </ActionBar>
    );
  }

  const paymentRef = claim?.payment && typeof claim.payment === 'object' ? claim.payment.reference : undefined;
  // Facts that are known; an empty one is left out rather than shown as "—".
  const sentOn = claim ? isoDayTime(claim.created_at, today) : '';
  const facts: SummaryItem[] = claim
    ? [
        ...(!isMine && claim.employee_name ? [{ key: 'by', label: 'Claimed by', value: claim.employee_name }] : []),
        ...(claim.keka_code || claim.project_name
          ? [{ key: 'code', label: 'Project code', value: claim.keka_code || claim.project_name || '', hint: claim.keka_code ? claim.project_name || null : null }]
          : []),
        ...(claim.keka_owner_name ? [{ key: 'owner', label: 'Project owner', value: claim.keka_owner_name }] : []),
        ...(sentOn ? [{ key: 'at', label: 'Sent on', value: sentOn }] : []),
        ...(paymentRef ? [{ key: 'pay', label: 'Payment reference', value: String(paymentRef) }] : []),
        { key: 'ref', label: 'Claim number', value: reimbursementRef(claim) },
      ]
    : [];

  return (
    <Screen
      header={<NavHeader title="Expense claim" />}
      footer={footer}
      onRefresh={() => Promise.all([mine.refetch(), !inMine ? keka.refetch() : Promise.resolve()])}>
      {claim ? (
        <Hero claim={claim} mine={isMine} showLine={!rejectedMine} today={today} />
      ) : loading ? (
        <DetailSkeleton />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => Promise.all([mine.refetch(), keka.refetch()])} />
      ) : (
        <EmptyState icon={<SearchX color={palette.textMuted} />} title="Claim not found" message="It may have been removed, or it belongs to someone else." />
      )}

      {claim && rejectedMine ? (
        <Banner
          tone="danger"
          title={`Rejected by ${claim.rejected_stage === 'accounts' ? 'Accounts' : 'the project owner'}${claim.rejected_by_name ? ` (${claim.rejected_by_name})` : ''}`}
          message={claim.rejection_reason || 'No reason was given.'}
        />
      ) : null}

      {claim ? <SummaryCard title="Details" rows={facts} /> : null}

      {claim ? <ReceiptButton id={claim.id} variant="row" /> : null}

      {claim ? (
        <View style={styles.section}>
          <SectionHeader title="History" />
          <Card tone="frostStrong">
            <Timeline events={reimbursementEvents(claim, isMine, today)} today={today} />
          </Card>
        </View>
      ) : null}

      {claim ? (
        <>
          <RespondSheet claim={respond ? claim : null} initial={respond} onClose={() => setRespond(null)} />
          <ReuploadSheet claim={reupload ? claim : null} onClose={() => setReupload(false)} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  status: { gap: space.xs, alignItems: 'flex-start' },
  section: { gap: space.xxs },
}));
