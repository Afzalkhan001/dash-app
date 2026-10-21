// One visit at the desk, in a sheet: the check-in photo, the status, and everything the desk needs —
// phone (tap Call), who they came to meet, why, when they arrived and left, how they checked in and who
// answered. For someone still in the building the footer has **Check out**, which opens a ConfirmSheet
// ("Inside → Left", "Swipe to check out"): there is no un-check-out on the server, so it is a swipe.
// Nobody is messaged when a visitor is checked out (visitors.js:603). Waiting visitors never open here:
// their decision lives on /inbox/desk/<id> (one home for Let in / Turn away).
//
// useDeskVisitSheet() → { show(visit), element }: put `element` once on the screen.

import { DoorOpen, LogOut, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { useCheckOut } from '@/api/desk';
import type { Visit } from '@/api/visitors';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { isDeskRole } from '@/features/desk/access';
import { decidedByLine, dialOf, hostName, isInside, purposeOf, sourceLabel, visitorName } from '@/features/desk/format';
import { SHEET_SWAP_MS } from '@/features/visitors/invite-form';
import { clockOf, dateLabel, phoneLabel, visitStatus } from '@/features/visitors/format';
import { VisitPhoto } from '@/features/visitors/visit-photo';
import { istDateOf } from '@/lib/dates';
import { themedStyles } from '@/theme/themed';
import { space } from '@/theme/tokens';
import { ActionRow, Button, ConfirmSheet, haptic, Sheet, StatusPill, SummaryCard, toast } from '@/ui';

const call = (mobile?: string | null) => {
  const d = dialOf(mobile);
  if (d) void Linking.openURL(`tel:${d}`).catch(() => toast.show('This phone can’t place calls.', 'info'));
};

export function DeskVisitSheet({
  visit,
  open,
  onClose,
  onCheckOut,
}: {
  visit: Visit | null;
  open: boolean;
  onClose: () => void;
  /** Shown for someone still inside, when the viewer runs the desk. */
  onCheckOut?: () => void;
}) {
  const today = useTodayIst();
  const st = visit ? visitStatus(visit.status) : null;
  const name = visit ? visitorName(visit) : 'Visitor';
  const canOut = !!visit && !!onCheckOut && isInside(visit);
  const dial = visit ? dialOf(visit.visitorMobile) : '';
  const first = name.split(/\s+/)[0] || name;
  const callBtn = dial ? <Button variant="ghost" title={`Call ${first}`} icon={<Phone />} onPress={() => call(visit?.visitorMobile)} /> : null;

  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title={name}
      subtitle={visit ? (istDateOf(visit.createdAt) === today ? 'Today' : dateLabel(visit.createdAt, today)) : undefined}
      footer={
        canOut ? (
          <ActionRow context="sheet">
            {callBtn}
            <Button variant="primary" title="Check out" icon={<LogOut />} onPress={onCheckOut} />
          </ActionRow>
        ) : (
          (callBtn ?? undefined)
        )
      }>
      {visit && st ? (
        <>
          <View style={styles.hero}>
            <VisitPhoto visit={visit} size={112} />
            <StatusPill label={st.label} tone={st.tone} style={styles.center} />
          </View>
          <SummaryCard
            hideEmpty
            rows={[
              { label: 'Mobile', value: phoneLabel(visit.visitorMobile) },
              { label: 'Here to meet', value: hostName(visit) },
              { label: 'Here for', value: purposeOf(visit) || 'Not given' },
              { label: 'Arrived', value: clockOf(visit.createdAt) },
              { label: 'Left', value: visit.checkOutAt ? clockOf(visit.checkOutAt) : null },
              { label: 'Checked in with', value: sourceLabel(visit.source) || null },
              { label: 'Answered by', value: decidedByLine(visit) || null },
            ]}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/** "Check Rohan out?" — Inside → Left, the visit, and the swipe. */
export function CheckOutSheet({
  visit,
  open,
  onClose,
  onConfirm,
  busy,
}: {
  visit: Visit | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const name = visit ? visitorName(visit) : 'this visitor';
  return (
    <ConfirmSheet
      visible={open}
      onClose={onClose}
      title={`Check ${name} out?`}
      from={{ title: 'Inside', subtitle: visit ? `Since ${clockOf(visit.createdAt)}` : undefined, icon: DoorOpen, module: 'visitors' }}
      to={{ title: 'Left', subtitle: 'Now', icon: LogOut }}
      detailsTitle="Visit"
      confirmLabel="Swipe to check out"
      onConfirm={onConfirm}
      loading={busy}
      note="Nobody is messaged. A check-out can’t be undone.">
      {visit ? (
        <SummaryCard
          hideEmpty
          rows={[
            { label: 'Visitor', value: name },
            { label: 'Here to meet', value: hostName(visit) },
            { label: 'Here for', value: purposeOf(visit) || null },
          ]}
        />
      ) : null}
    </ConfirmSheet>
  );
}

/**
 * The visit sheet and its check-out flow for a screen: `show(visit)` opens it, `element` renders the
 * sheets. Check out is offered only for approved visits not yet out, and only to the desk (`desk`).
 */
export function useDeskVisitSheet({ desk = true }: { desk?: boolean } = {}) {
  const user = useSession((s) => s.user);
  const checkOut = useCheckOut();
  // The visit stays set while a sheet fades out, and through the swap from one sheet to the other.
  const [visit, setVisit] = useState<Visit | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const allowed = desk && isDeskRole(user);

  const askCheckOut = () => {
    setOpen(false);
    setTimeout(() => setConfirm(true), SHEET_SWAP_MS);
  };
  const run = () => {
    if (!visit || checkOut.isPending) return;
    const name = visitorName(visit);
    checkOut.mutate(visit.id, {
      onSuccess: () => {
        haptic.success();
        setConfirm(false);
        toast.show(`${name} checked out`, 'success');
      },
      onError: (e) => {
        haptic.error();
        setConfirm(false);
        // 409 "already checked out" / 404: the board refreshes itself; say why in the server's words.
        Alert.alert('Couldn’t check them out', e.message || 'Please try again.');
      },
    });
  };

  return {
    show: (v: Visit) => {
      setVisit(v);
      setOpen(true);
    },
    element: (
      <>
        <DeskVisitSheet visit={visit} open={open} onClose={() => setOpen(false)} onCheckOut={allowed ? askCheckOut : undefined} />
        <CheckOutSheet
          visit={visit}
          open={confirm}
          busy={checkOut.isPending}
          onClose={() => {
            if (!checkOut.isPending) setConfirm(false);
          }}
          onConfirm={run}
        />
      </>
    ),
  };
}

const styles = themedStyles(() => ({
  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.xxs },
  center: { alignSelf: 'center' },
}));
