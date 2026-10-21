// One request in a bottom sheet (Payno "Transfer details"). State first, then history:
//   title = what it is (leave type / Work from home / Comp-off claim), subtitle = when ("12 – 14 Oct",
//   "Mon, 3 Nov · 1st half", "Worked Sat, 12 Sep"), a SummaryCard of the other facts — Status (soft
//   pill), Reason — with how long it is as the emphasised total ("Days 3 days", "Earns 1 day"), then the
//   history (applied → decided; the only place the applied time is said) and at most one notice.
//   "Cancel request" sits in the footer exactly
//   when the server allows it — pending, or approved leave/WFH that has not started (hr_leave.js
//   ~L420) — and asks before cancelling.

import { Alert, View } from 'react-native';

import type { LeaveRequest } from '@/api/leave';
import { useTodayIst } from '@/features/attendance/use-now';
import { requestAmount, requestWhen } from '@/features/leave/request-row';
import { canCancel, HALF_LABEL, rangeLabel, requestDays, requestTitle, stampLabel, statusMeta } from '@/features/leave/rules';
import { useCancelLeave } from '@/features/leave/use-leave-actions';
import { space } from '@/theme/tokens';
import { Banner, Button, EventTimeline, Sheet, SummaryCard, type SummaryItem, Text, type TimelineEvent, toast } from '@/ui';

import { themedStyles } from '@/theme/themed';

function cancelMessage(r: LeaveRequest) {
  if (r.status !== 'approved') return 'It will be withdrawn before anyone reviews it.';
  return r.kind === 'wfh' ? 'It is already approved. These work-from-home days will be withdrawn.' : 'It is already approved. The days go back to your balance.';
}

function historyOf(r: LeaveRequest, today: string): TimelineEvent[] {
  const events: TimelineEvent[] = [{ key: 'applied', label: 'Applied', at: stampLabel(r.created_at, today), tone: 'neutral' }];
  // A cancelled request that has a decider was approved first (only pending/approved can be cancelled).
  if (r.decided_by_name) {
    const rejected = r.status === 'rejected';
    events.push({
      key: 'decided',
      label: rejected ? 'Rejected' : 'Approved',
      at: r.decided_at ? stampLabel(r.decided_at, today) : null,
      by: r.decided_by_name,
      note: r.decision_note || null,
      tone: rejected ? 'bad' : 'good',
    });
  }
  if (r.status === 'pending') {
    events.push({ key: 'waiting', label: 'Waiting for approval', detail: 'Your department admin or HR decides.', tone: 'wait' });
  }
  if (r.status === 'cancelled') {
    events.push({ key: 'cancelled', label: 'Cancelled', tone: 'neutral' });
  }
  return events;
}

/** The facts of a request as SummaryCard rows (also used by the apply flow's success sheet). */
export function requestFacts(r: LeaveRequest, today: string, opts: { dates?: boolean; applied?: boolean; reason?: boolean } = {}): SummaryItem[] {
  const s = statusMeta(r.status);
  const half = r.kind !== 'comp_off' && !!r.half_day && r.half_day !== 'none';
  const rows: SummaryItem[] = [{ key: 'status', label: 'Status', value: s.label, status: s.tone }];
  if (opts.dates !== false) rows.push({ key: 'dates', label: r.kind === 'comp_off' ? 'Day worked' : 'Dates', value: rangeLabel(r.from_date, r.to_date, today) });
  if (half && opts.dates !== false) rows.push({ key: 'half', label: 'Duration', value: HALF_LABEL[r.half_day] ?? r.half_day });
  if (opts.applied !== false) rows.push({ key: 'applied', label: 'Applied on', value: stampLabel(r.created_at, today) });
  if (opts.reason !== false && r.reason) rows.push({ key: 'reason', label: 'Reason', value: r.reason });
  return rows;
}

/** How long it is, the SummaryCard's emphasised total: "Days · 3 days", or for a comp-off claim
 *  "Earns · 1 day" ("Earned" once approved). */
export function requestTotal(r: LeaveRequest) {
  if (!requestAmount(r)) return null;
  if (r.kind === 'comp_off') return { label: r.status === 'approved' ? 'Earned' : 'Earns', value: requestDays(r.days) };
  return { label: 'Days', value: requestDays(r.days) };
}

export function LeaveRequestSheet({
  request,
  typeName,
  visible,
  onClose,
}: {
  request: LeaveRequest | null;
  typeName?: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const cancel = useCancelLeave();
  const today = useTodayIst();
  if (!request) return null;

  const r = request;
  const cancellable = canCancel(r, today);
  const cancelError = cancel.isError && cancel.variables === r.id ? cancel.error.message : null;

  const confirmCancel = () =>
    Alert.alert('Cancel this request?', cancelMessage(r), [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () =>
          cancel.mutate(r.id, {
            onSuccess: () => {
              onClose();
              toast.show('Request cancelled');
            },
          }),
      },
    ]);

  // At most one notice: a failed cancel, else what an approved request means for the person.
  let notice: { tone: 'danger' | 'success' | 'info'; title?: string; message: string } | null = null;
  if (cancelError) notice = { tone: 'danger', title: 'Couldn’t cancel the request', message: cancelError };
  else if (r.status === 'approved' && r.kind === 'comp_off') notice = { tone: 'success', message: 'Added to your comp-off balance.' };
  else if (r.status === 'approved' && r.kind === 'wfh' && r.to_date >= today) notice = { tone: 'success', message: 'You can clock in from home on these days.' };
  else if (r.status === 'approved' && !cancellable) notice = { tone: 'info', message: 'It has started, so only HR can cancel it now.' };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={requestTitle(r, typeName)}
      subtitle={requestWhen(r, today)}
      footer={cancellable ? <Button variant="danger" title="Cancel request" loading={cancel.isPending} onPress={confirmCancel} /> : undefined}>
      {/* When it is (dates, the half, the day worked) is the sheet's subtitle and when it was applied is the
          first History step, so the card says neither again. */}
      <SummaryCard rows={requestFacts(r, today, { dates: false, applied: false })} total={requestTotal(r)} />

      <View style={styles.block}>
        <Text variant="labelStrong" muted accessibilityRole="header">
          History
        </Text>
        <EventTimeline events={historyOf(r, today)} />
      </View>

      {notice ? <Banner tone={notice.tone} title={notice.title} message={notice.message} /> : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  block: { gap: space.xs },
}));
