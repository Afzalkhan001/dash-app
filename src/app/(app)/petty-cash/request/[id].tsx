// One petty cash request: where it stands (the light summary hero: amount, status and the payment
// line), then the one thing (if any) this person can do about it in the bottom bar, then the details
// (SummaryCards), what is left on this project (a striped bar) and the history (dash.html
// PettyCashHistoryModal). Actions are the
// website's, for the same people:
//   the teammate it is for (or the person who asked) → confirm with the emailed code; the person who
//     asked → delete it while it still waits on that code;
//   the person it is for → Received / Not received once Accounts has started paying (and later "it
//     has arrived" after reporting it missing) — the same bar and sheet as an expense claim;
//   an automatic extra claim → the bills it claims.
// Approving and rejecting happen in one place only, the Inbox: a request waiting on this person as
// project owner (or Accounts, on a code with no owner) opens /inbox/petty/<id> instead of this screen.
// The request comes from the cached overview (the server has no single-request read).

import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, FileSearch, KeyRound, ReceiptText, Trash2, TrendingUp, Wallet } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Alert, View } from 'react-native';

import { isApiError } from '@/api/client';
import { deletePettyCashRequest, usePettyCashOverview } from '@/api/petty-cash';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { HistoryTimeline, OtpConfirmSheet, PaymentRespondSheet, PettyIdleFooter, PettyTag, useInvalidatePettyCash } from '@/features/petty-cash/components';
import {
  amount,
  AWAITING_RESPONSE,
  canApprove,
  historyEvents,
  isAuthorized,
  isOwnRequest,
  isPettyCashAdmin,
  list,
  money,
  paymentLine,
  pettyCashPool,
  pettyCashRef,
  roleSeesPettyCash,
  rowMoney,
  shortDate,
  statusMeta,
} from '@/features/petty-cash/logic';
import { useReceiptViewer } from '@/features/petty-cash/receipt';
import { firstName } from '@/lib/format';
import { palette, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  haptic,
  NavHeader,
  Numeral,
  Screen,
  SectionHeader,
  Skeleton,
  StatusPill,
  StripedProgress,
  SummaryCard,
  SummaryHero,
  Text,
  toast,
  useLayout,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
import { RouteGate } from '@/features/shared/route-gate';
// Petty cash is for the roles whose web menu has it (the More tile's rule); others are sent home.
export default function PettyCashRequestScreen() {
  const user = useSession((s) => s.user);
  return (
    <RouteGate allow={roleSeesPettyCash(user)}>
      <PettyCashRequestBody />
    </RouteGate>
  );
}

function PettyCashRequestBody() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { compact } = useLayout();
  const today = useTodayIst();
  const user = useSession((s) => s.user);
  const overviewQ = usePettyCashOverview();
  const invalidate = useInvalidatePettyCash();
  const receipts = useReceiptViewer();
  const [otpOpen, setOtpOpen] = useState(false);
  const [respond, setRespond] = useState<'received' | 'not_received' | null>(null);

  const data = overviewQ.data;
  const r = list(data?.requests).find((x) => !!x && x.id === id);

  const fail = (title: string) => (e: Error) => {
    haptic.error();
    Alert.alert(title, e.message);
    void invalidate();
  };
  const remove = useMutation({
    mutationFn: async (rid: string) => {
      const res = await deletePettyCashRequest(rid);
      if (isApiError(res)) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      haptic.success();
      void invalidate();
      router.back();
      toast.show('Request deleted', 'info');
    },
    onError: fail("Couldn't delete"),
  });

  const header = <NavHeader title="Petty cash request" />;

  if (!r) {
    // Same tree shape as the loaded screen (the idle footer included), so the content replaces the
    // skeletons in place.
    const loading = overviewQ.isLoading;
    return (
      <Screen header={header} footer={<PettyIdleFooter />} onRefresh={() => overviewQ.refetch()}>
        {loading ? (
          <Skeleton height={compact ? 236 : 248} radius={radius.xxl} />
        ) : overviewQ.error && !data ? (
          <ErrorState message={overviewQ.error.message} onRetry={() => void overviewQ.refetch()} />
        ) : (
          <EmptyState
            icon={<FileSearch color={palette.textMuted} />}
            title="Request not found"
            message="It may have been deleted, or it isn’t one you can see."
            action={<Button title="Go back" variant="accent" size="md" onPress={() => router.back()} />}
          />
        )}
        {/* slots of the banner and the extra-claim link */}
        {null}
        {null}
        {loading ? <Skeleton height={260} radius={radius.xl} /> : null}
        {loading ? <Skeleton height={140} radius={radius.xl} /> : null}
      </Screen>
    );
  }

  const me = user?.id ?? '';
  const s = statusMeta(r.status);
  const line = paymentLine(r, today);
  const excess = r.kind === 'excess';
  const heads = list(r.departments).filter(Boolean);
  const isPayee = r.employeeId === me;
  const isRaiser = r.requestedById === me;
  const awaitingConfirm = r.status === 'pending_confirmation';
  const canDelete = awaitingConfirm && (isRaiser || isPettyCashAdmin(user));
  const canAnswer = isPayee && AWAITING_RESPONSE.includes(r.status);
  const canLateReceive = isPayee && r.status === 'not_received';
  // Waiting on me to approve: that decision is made in the Inbox, the one place approvals live.
  const canDecide = r.status === 'pending_approval' && !excess && canApprove(user, r) && !isOwnRequest(user, r);
  if (canDecide) return <Redirect href={`/inbox/petty/${encodeURIComponent(r.id)}`} />;
  // Bills come from the viewer's own list (/petty_cash_bill_submissions/mine), so the pool's "spent" is
  // only right for the person the money is for; nobody else gets the card.
  const pool = isPayee && isAuthorized(r) && !excess && data ? pettyCashPool(list(data.requests), list(data.subs), r) : null;
  const oldBills = list(data?.bills).filter((b) => !!b && b.requestId === r.id);
  const confirmer = awaitingConfirm && (isPayee || isRaiser);
  const them = firstName(r.employeeName) || 'them';

  const confirmDelete = () =>
    Alert.alert('Delete this request?', 'It will be removed. You can’t undo this.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(r.id) },
    ]);

  // The one decision this person has here, pinned to the bottom (at most one group applies — they
  // depend on mutually exclusive statuses). With none, an idle footer keeps the Screen's tree, so
  // the bar leaving after a decision doesn't jump the scroll back to the top or replay the entrance.
  let footer: ReactNode = <PettyIdleFooter />;
  if (confirmer) {
    const enter = <Button title="Enter code" icon={<KeyRound />} onPress={() => setOtpOpen(true)} />;
    footer = (
      <ActionBar>
        {canDelete ? (
          <ActionRow context="bar">
            <Button title="Delete" variant="danger" icon={<Trash2 />} loading={remove.isPending} onPress={confirmDelete} />
            {enter}
          </ActionRow>
        ) : (
          enter
        )}
      </ActionBar>
    );
  } else if (canDelete) {
    footer = (
      <ActionBar>
        <Button title="Delete request" variant="danger" icon={<Trash2 />} loading={remove.isPending} onPress={confirmDelete} />
      </ActionBar>
    );
  } else if (canAnswer) {
    // The same bar as an expense claim waiting on "did you get it?" (reimbursements/[id]).
    footer = (
      <ActionBar note="Did you get the money?">
        <ActionRow context="bar">
          <Button title="Not received" variant="danger" onPress={() => setRespond('not_received')} />
          <Button title="Received" icon={<Check />} onPress={() => setRespond('received')} />
        </ActionRow>
      </ActionBar>
    );
  } else if (canLateReceive) {
    footer = (
      <ActionBar note="Has the money arrived now?">
        <Button title="Mark as received" icon={<Check />} onPress={() => setRespond('received')} />
      </ActionBar>
    );
  }

  // What is expected of this person, in one short notice (the action itself is in the bar). A payment
  // to confirm needs none, as on an expense claim: the hero's line says when Accounts paid, and the
  // bar asks the question.
  let banner: ReactNode = null;
  if (confirmer) {
    banner = isPayee ? (
      <Banner tone="warning" icon={KeyRound} title="Confirm with your code" message={`${r.requestedByName || 'A teammate'} asked for this for you. The code is in your email.`} />
    ) : (
      <Banner tone="warning" icon={KeyRound} title={`Waiting for ${them} to confirm`} message="Ask them for the code from their email, or they can confirm it later." />
    );
  }

  const over = pool ? pool.spent > pool.allocated : false;
  const poolDiff = pool ? Math.abs(pool.spent - pool.allocated) : 0;

  return (
    <>
      <Screen header={header} footer={footer} onRefresh={() => overviewQ.refetch()}>
        <SummaryHero
          icon={excess ? TrendingUp : Wallet}
          module="pettyCash"
          label={[r.kekaCode || 'Petty cash', r.projectName].filter(Boolean).join(' · ')}
          value={amount(r.amount)}
          currency="₹">
          <View style={styles.status}>
            <View style={styles.wrapRow}>
              <StatusPill label={s.label} tone={s.tone} />
              {excess ? <PettyTag label="Extra claim" tone="warning" /> : null}
            </View>
            {line ? (
              <Text variant="label" muted numberOfLines={2}>
                {line}
              </Text>
            ) : null}
          </View>
        </SummaryHero>

        {banner}

        {excess ? (
          <ActivityList>
            <ActivityRow
              module="pettyCash"
              icon={ReceiptText}
              title="Bills in this claim"
              subtitle="The bills that went over your petty cash"
              chevron
              onPress={() => router.push(`/petty-cash/statement/_?request=${encodeURIComponent(r.id)}`)}
            />
          </ActivityList>
        ) : null}

        <SummaryCard
          title="Details"
          hideEmpty
          rows={[
            { key: 'for', label: 'For', value: r.employeeName },
            ...(r.onBehalf ? [{ key: 'by', label: 'Asked by', value: r.requestedByName }] : []),
            {
              key: 'owner',
              label: 'Project owner',
              value: r.costCodeOwnerName || 'None',
              // No owner: one Accounts person gives the first approval and another authorizes it.
              hint: r.costCodeOwnerName ? null : 'Two people in Accounts approve it',
            },
            { key: 'on', label: 'Requested on', value: shortDate(r.createdAt, today) },
            { key: 'note', label: 'Note', value: r.remarks },
            // Called the same as an expense claim's "Claim number".
            { key: 'ref', label: 'Request number', value: pettyCashRef('request', r) },
          ]}
        />

        {heads.length ? (
          <SummaryCard
            title="What it’s for"
            rows={heads.map((d, i) => ({ key: d.departmentId || String(i), label: d.departmentName || 'Other', value: money(d.amount) }))}
            total={heads.length > 1 ? { label: 'Total', value: money(r.amount) } : null}
          />
        ) : null}

        {pool ? (
          <Card tone="frostStrong" style={{ gap: space.md }}>
            <View style={{ gap: 2 }}>
              <Text variant="label" muted numberOfLines={2}>
                {`Your petty cash on ${r.kekaCode || 'this project'}`}
              </Text>
              {/* Lendora numeral: small superscript ₹, light figure, greyed paise, then left / over in its colour. */}
              <View style={styles.figureRow}>
                <Numeral
                  value={poolDiff}
                  prefix="₹"
                  decimals={2}
                  size="md"
                  accessibilityLabel={`${money(poolDiff)} ${over ? 'over' : 'left'}`}
                  style={styles.shrink}
                />
                <Text variant="body" color={over ? palette.warningInk : palette.successInk} style={[styles.fixed, styles.figureWord]}>
                  {over ? 'over' : 'left'}
                </Text>
              </View>
            </View>
            <StripedProgress
              label="Bills against the money given"
              used={Math.min(pool.spent, pool.allocated)}
              total={pool.allocated}
              valueText={`${rowMoney(pool.spent)} / ${rowMoney(pool.allocated)}`}
              color={over ? palette.warningInk : undefined}
              accessibilityLabel={`${money(pool.spent)} of bills against ${money(pool.allocated)} petty cash`}
            />
            {over ? (
              <PettyTag
                tone="warning"
                label={pool.extra === 'open' ? 'Extra claim sent · see My requests' : pool.extra === 'rejected' ? 'Extra claim was rejected' : 'Sending the extra claim…'}
              />
            ) : null}
          </Card>
        ) : null}

        {oldBills.length ? (
          <ActivityList title="Bills">
            {oldBills.map((b) => {
              const st =
                b.status === 'approved'
                  ? { label: 'Approved', tone: 'done' as const }
                  : b.status === 'rejected'
                    ? { label: 'Rejected', tone: 'failed' as const }
                    : { label: 'Waiting', tone: 'pending' as const };
              const busy = receipts.busyId === b.id;
              return (
                <ActivityRow
                  key={b.id}
                  module="pettyCash"
                  icon={ReceiptText}
                  title={b.description || 'Bill'}
                  subtitle={[`Bill no. ${pettyCashRef('bill', b)}`, b.status === 'rejected' && b.rejectionReason ? b.rejectionReason : null].filter(Boolean).join(' · ')}
                  note={b.hasFile ? (busy ? 'Opening receipt…' : 'Receipt attached') : null}
                  value={rowMoney(b.amount)}
                  status={st}
                  chevron={!!b.hasFile}
                  onPress={b.hasFile ? () => void receipts.open('bill', b.id) : undefined}
                />
              );
            })}
          </ActivityList>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="History" />
          <Card tone="frostStrong">
            <HistoryTimeline events={historyEvents(r, today)} today={today} />
          </Card>
        </View>
      </Screen>

      <OtpConfirmSheet
        request={r}
        visible={otpOpen}
        onClose={() => setOtpOpen(false)}
        onDone={() => {
          setOtpOpen(false);
          toast.show('Request confirmed');
          void invalidate();
        }}
        intro={isPayee ? undefined : <Text variant="body">Enter the 6-digit code {r.employeeName || 'they'} got by email.</Text>}
      />
      <PaymentRespondSheet
        request={r}
        initial={respond}
        visible={!!respond}
        onClose={() => setRespond(null)}
        onDone={() => {
          setRespond(null);
          void invalidate();
        }}
      />
      {receipts.sheet}
    </>
  );
}

const styles = themedStyles(() => ({
  status: { gap: space.xs, alignItems: 'flex-start' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: space.xs, columnGap: space.xs },
  figureRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  // Sits on the numeral's baseline (its 42 dp line box).
  figureWord: { marginBottom: 6 },
  shrink: { flexShrink: 1 },
  fixed: { flexShrink: 0 },
  section: { gap: space.xxs },
}));
