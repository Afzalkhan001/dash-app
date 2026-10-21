// Fix attendance (the web's RegularizationPanel, dash.html ~L4746), in the Payno layout: NavHeader, then
// state first — a light SummaryHero with how many requests are waiting for approval (and how the
// decided ones went) — then my requests as frosted lists under SectionHeaders: the ones waiting, then
// the decided ones, each a row with its status; tap one for the details (a SummaryCard in a sheet, and
// Cancel while it is waiting).
// One primary: "Request a fix" in the sticky bar opens the form page (/attendance/fix), like every
// other form in the app. A calendar day opens that form straight away, on that day.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { PencilLine, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { cancelRegularization, type Regularization, useMyRegularizations } from '@/api/attendance';
import { isApiError } from '@/api/client';
import { plainServerText, prettyHm, reqStatus, shortDay } from '@/features/attendance/format';
import { useTodayIst } from '@/features/attendance/use-now';
import { istParts } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { moduleTone, radius, space } from '@/theme/tokens';
import {
  ActionBar,
  ActivityList,
  ActivityRow,
  Button,
  EmptyState,
  ErrorState,
  haptic,
  NavHeader,
  Screen,
  Sheet,
  Skeleton,
  SkeletonList,
  SummaryCard,
  SummaryHero,
  toast,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// Crash guard: a malformed work date reads as "Unknown date" instead of reaching the date helpers.
const realDay = (v: string) => isYmd(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`));
const workYmd = (r: Regularization) => String(r?.work_date ?? '').slice(0, 10);
// 'Mon, 6 Oct' — the app's one date format (the year only when it is not this year).
const workDayLabel = (r: Regularization, thisYear?: string) => (realDay(workYmd(r)) ? shortDay(workYmd(r), thisYear) : 'Unknown date');
const hm = (v: unknown) => (typeof v === 'string' && v ? prettyHm(v) : '—');
const NBSP = String.fromCharCode(0xa0);
const keep = (s: string) => s.replace(/\s/g, NBSP);
function sentYmd(createdAt: unknown) {
  const t = Date.parse(String(createdAt ?? ''));
  return Number.isFinite(t) ? istParts(new Date(t)).date : '';
}

export default function RegularizeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const access = useAccess();
  const thisYear = useTodayIst().slice(0, 4);
  const on = access.sections.regularization;
  const q = useMyRegularizations(on);
  const [open, setOpen] = useState<Regularization | null>(null);
  // Keep the last request on screen while its sheet fades out.
  const [last, setLast] = useState<Regularization | null>(null);
  if (open && open !== last) setLast(open);
  const shown = open ?? last;

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const r = await cancelRegularization(id);
      if (isApiError(r)) throw new Error(r.error);
    },
    onSuccess: () => {
      haptic.success();
      setOpen(null);
      toast.show('Request cancelled', 'success');
      void qc.invalidateQueries({ queryKey: ['att-regs'] });
    },
    onError: (e: Error) => {
      haptic.error();
      Alert.alert('Couldn’t cancel', plainServerText(e.message) || 'Try again.');
    },
  });

  const askCancel = (r: Regularization) =>
    Alert.alert('Cancel this request?', `Your fix for ${workDayLabel(r, thisYear)} will be withdrawn.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate(r.id) },
    ]);

  const header = <NavHeader title="Fix attendance" />;

  if (!on) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<PencilLine color={moduleTone.attendance.fg} strokeWidth={1.8} />}
          title="Fix attendance isn’t on"
          message="It isn’t switched on for your account."
        />
      </Screen>
    );
  }

  // Waiting requests first (they are the state); the rest keep the server's newest-first order.
  const raw = (Array.isArray(q.data) ? q.data : []).filter((r): r is Regularization => !!r && typeof r === 'object');
  const waitingList = raw.filter((r) => r.status === 'pending');
  const decided = raw.filter((r) => r.status !== 'pending');
  const list = [...waitingList, ...decided];
  const waiting = waitingList.length;
  const approved = decided.filter((r) => r.status === 'approved').length;
  const rejected = decided.filter((r) => r.status === 'rejected').length;
  const decidedLine = [approved ? `${approved} approved` : null, rejected ? `${rejected} rejected` : null].filter(Boolean).join(' · ');

  const row = (r: Regularization, i: number) => {
    const status = reqStatus(String(r.status ?? ''));
    return (
      <ActivityRow
        key={r.id ?? i}
        module="attendance"
        icon={PencilLine}
        title={workDayLabel(r, thisYear)}
        // Beside the pill at 320 dp this wraps; it breaks between "In …" and "Out …", never inside a time.
        subtitle={`${keep(`In ${hm(r.in_time)}`)} · ${keep(`Out ${hm(r.out_time)}`)}`}
        status={status}
        onPress={() => setOpen(r)}
        accessibilityLabel={`${workDayLabel(r, thisYear)}, in ${hm(r.in_time)}, out ${hm(r.out_time)}, ${status.label}`}
      />
    );
  };

  const footer = (
    <ActionBar>
      <Button title="Request a fix" icon={<Plus />} onPress={() => router.push('/attendance/fix')} />
    </ActionBar>
  );

  // The sheet sits beside the Screen, not in it, so they never add an empty animated gap to the list.
  return (
    <>
      <Screen header={header} footer={footer} onRefresh={() => q.refetch()}>
        {q.isLoading ? (
          <View style={styles.sections} accessibilityLabel="Loading" accessibilityRole="progressbar">
            <Skeleton height={168} radius={radius.xxl} />
            <SkeletonList rows={4} avatar tone="surface" />
          </View>
        ) : q.error && !list.length ? (
          <ErrorState message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />
        ) : !list.length ? (
          <EmptyState
            icon={<PencilLine color={moduleTone.attendance.fg} strokeWidth={1.8} />}
            title="No requests yet"
            message="Missed a clock-in or clock-out? Request a fix below."
          />
        ) : (
          <View style={styles.sections}>
            {/* State first: what is still with your manager, and how the rest went. */}
            <SummaryHero
              icon={PencilLine}
              module="attendance"
              label="Waiting for approval"
              value={waiting}
              unit={waiting === 1 ? 'request' : 'requests'}
              sub={decidedLine || (waiting ? 'Nothing decided yet' : 'Nothing waiting right now')}
            />
            {waitingList.length ? <ActivityList title="Waiting">{waitingList.map(row)}</ActivityList> : null}
            {decided.length ? <ActivityList title={waitingList.length ? 'Earlier requests' : 'My fix requests'}>{decided.map(row)}</ActivityList> : null}
          </View>
        )}
      </Screen>

      {/* One request in detail; Cancel is the only action, and only while it is waiting. */}
      <Sheet
        visible={!!open}
        onClose={() => (cancel.isPending ? null : setOpen(null))}
        title={shown ? workDayLabel(shown, thisYear) : undefined}
        subtitle={shown ? reqStatus(String(shown.status ?? '')).label : undefined}
        footer={
          shown?.status === 'pending' ? (
            <Button title="Cancel request" variant="danger" loading={cancel.isPending} onPress={() => askCancel(shown)} />
          ) : undefined
        }>
        {shown ? <RequestDetails r={shown} thisYear={thisYear} /> : null}
      </Sheet>
    </>
  );
}

// One request as a Payno SummaryCard: the times asked for, the reason, when it was sent and, once
// decided, by whom (with their note). Empty rows are left out.
function RequestDetails({ r, thisYear }: { r: Regularization; thisYear: string }) {
  const decided = r.status === 'approved' ? 'Approved by' : r.status === 'rejected' ? 'Rejected by' : 'Decided by';
  const sent = sentYmd(r.created_at);
  return (
    <SummaryCard
      hideEmpty
      rows={[
        { key: 'in', label: 'Clock in', value: hm(r.in_time) },
        { key: 'out', label: 'Clock out', value: hm(r.out_time) },
        { key: 'reason', label: 'Reason', value: typeof r.reason === 'string' ? r.reason : '' },
        { key: 'sent', label: 'Sent', value: isYmd(sent) ? shortDay(sent, thisYear) : '' },
        { key: 'by', label: decided, value: typeof r.decided_by_name === 'string' ? r.decided_by_name : '' },
        { key: 'note', label: 'Note', value: typeof r.decision_note === 'string' ? r.decision_note : '' },
      ]}
    />
  );
}

const styles = themedStyles(() => ({
  sections: { gap: space.lg },
}));
