// My invitations (web: VisitorInvites list), in the Payno list style: upcoming ones first (soonest
// first), then earlier ones with their status, each list one frosted ActivityList. A row opens the
// invitation in a sheet: the guest's code in the kit's OtpBoxes (read-only), the details as a
// SummaryCard and — while it is active — Cancel invite / Share pass in the sheet footer, so the list
// never carries buttons per row. The pass is the server-drawn PNG, downloaded and handed to the share
// sheet.

import { Ban, Share2, Ticket } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Invite, shareInvitePass, useCancelInvite } from '@/api/visitors';
import { useTodayIst } from '@/features/attendance/use-now';
import { dateLabel, inviteStatus, nameWords, phoneLabel, stampLabel, timeWindow } from '@/features/visitors/format';
import { space } from '@/theme/tokens';
import { ActionRow, ActivityList, ActivityRow, Button, ConfirmSheet, haptic, OtpBoxes, Sheet, StatusPill, SummaryCard, Text, toast, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';

const codeLabel = (code?: string) => `Code ${String(code ?? '').split('').join(' ')}`;
const noop = () => {};
// How long the invitation sheet takes to slide away before the confirm sheet opens.
const SHEET_SWAP_MS = 380;

/** Downloads an invitation's pass (server-drawn PNG) and hands it to the share sheet. */
export function useSharePass(invite: { id: string; guestName?: string } | null | undefined) {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (!invite || busy) return;
    setBusy(true);
    try {
      await shareInvitePass(invite);
    } catch (e: any) {
      // A toast, not Alert: react-native-web's Alert does nothing, so the failure would go unseen there.
      toast.show(`The pass could not be downloaded. ${e?.message || 'Try again.'}`, 'danger');
    } finally {
      setBusy(false);
    }
  };
  return { share, busy };
}

/**
 * A guest's check-in code in the kit's OtpBoxes, read-only (Payno's code boxes): one spoken label for
 * the whole code, no keyboard, no caret. Used by the invitation sheet and the "Invite sent" sheet.
 */
export function CodeBoxes({ code, label = 'Their code', a11yLabel }: { code?: string; label?: string; a11yLabel?: string }) {
  const digits = String(code ?? '').replace(/\D/g, '');
  return (
    <View style={styles.code} accessible accessibilityLabel={a11yLabel ?? codeLabel(code)}>
      <Text variant="label" muted align="center">
        {label}
      </Text>
      {digits ? (
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <OtpBoxes value={digits} onChange={noop} length={digits.length} withKeypad autoFocus={false} />
        </View>
      ) : (
        <Text variant="hero" align="center">
          —
        </Text>
      )}
    </View>
  );
}

/** Guards the API list once: a non-array becomes [], and null / non-object rows are dropped. */
export const asInvites = (x: unknown): Invite[] => (Array.isArray(x) ? x.filter((i): i is Invite => !!i && typeof i === 'object') : []);

const soonestFirst = (a: Invite, b: Invite) => {
  const ka = `${a.visitDate || ''}|${a.timeFrom || ''}`;
  const kb = `${b.visitDate || ''}|${b.timeFrom || ''}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/** Upcoming invitations (active, today or later, soonest first) and earlier ones (as the server sends them). */
export function splitInvites(list: Invite[], today: string) {
  const all = asInvites(list);
  const isUpcoming = (i: Invite) => i.status === 'active' && String(i.visitDate || '') >= today;
  return { upcoming: all.filter(isUpcoming).sort(soonestFirst), past: all.filter((i) => !isUpcoming(i)) };
}

export const guestName = (i: Pick<Invite, 'guestName'>) => (typeof i.guestName === 'string' && i.guestName.trim()) || 'Guest';

function InviteRow({ invite, showStatus, today, onPress }: { invite: Invite; showStatus: boolean; today: string; onPress: () => void }) {
  const st = inviteStatus(invite.status);
  const win = timeWindow(invite.timeFrom, invite.timeTo);
  const name = guestName(invite);
  const when = `${dateLabel(invite.visitDate, today)}${win ? ` · ${win}` : ''}`;
  return (
    <ActivityRow
      person={{ name: nameWords(name).join(' ') }}
      title={name}
      subtitle={when}
      note={invite.code ? `Code ${invite.code}` : null}
      status={showStatus ? st : null}
      chevron={!showStatus}
      onPress={onPress}
      accessibilityLabel={`${name}, ${st.label}, ${when}`}
    />
  );
}

function InviteSheet({ invite, open, onClose, onCancel }: { invite: Invite | null; open: boolean; onClose: () => void; onCancel: () => void }) {
  const today = useTodayIst();
  const pass = useSharePass(invite);
  const st = inviteStatus(invite?.status);
  const active = invite?.status === 'active';
  const win = invite ? timeWindow(invite.timeFrom, invite.timeTo) : '';

  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title={invite?.guestName || 'Invitation'}
      subtitle={invite ? dateLabel(invite.visitDate, today) : undefined}
      footer={
        invite && active ? (
          <ActionRow context="sheet">
            <Button variant="danger" title="Cancel invite" onPress={onCancel} />
            <Button variant="primary" title="Share pass" icon={<Share2 />} loading={pass.busy} onPress={pass.share} />
          </ActionRow>
        ) : undefined
      }>
      {invite ? (
        <>
          <View style={styles.codeBlock}>
            <CodeBoxes code={invite.code} a11yLabel={`${codeLabel(invite.code)}, ${st.label}`} />
            <StatusPill label={st.label} tone={st.tone} style={styles.center} />
          </View>
          <SummaryCard
            hideEmpty
            rows={[
              { label: 'Mobile', value: phoneLabel(invite.guestMobile) },
              { label: 'Time', value: win || 'Any time' },
              { label: 'Here for', value: typeof invite.purpose === 'string' ? invite.purpose.trim() : null },
              { label: 'Used', value: invite.usedAt ? stampLabel(invite.usedAt, today) : null },
            ]}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/** Upcoming invitations (active, today or later), then earlier ones with their status. */
export function InviteList({ invites }: { invites: Invite[] }) {
  const today = useTodayIst();
  const { gap } = useLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const list = asInvites(invites);
  const { upcoming, past } = splitInvites(list, today);
  const selected = selectedId ? (list.find((i) => i.id === selectedId) ?? null) : null;
  const show = (i: Invite) => {
    setSelectedId(i.id);
    setOpen(true);
  };

  // Cancel invite can't be undone, so it is a ConfirmSheet with a swipe (PLAN §2.1.6). The invitation
  // sheet closes first and the confirm opens once it has gone (one sheet at a time).
  const cancel = useCancelInvite();
  const [confirming, setConfirming] = useState<Invite | null>(null);
  const askCancel = () => {
    if (!selected) return;
    const inv = selected;
    setOpen(false);
    setTimeout(() => setConfirming(inv), SHEET_SWAP_MS);
  };
  const doCancel = () => {
    if (!confirming || cancel.isPending) return;
    const name = guestName(confirming);
    cancel.mutate(confirming.id, {
      onSuccess: () => {
        haptic.success();
        setConfirming(null);
        toast.show(`${name}’s invite cancelled`, 'info');
      },
      onError: (e) => toast.show(`Could not cancel. ${e.message || 'Try again.'}`, 'danger'),
    });
  };
  const cName = confirming ? guestName(confirming) : '';
  const cWin = confirming ? timeWindow(confirming.timeFrom, confirming.timeTo) : '';

  return (
    <View style={{ gap }}>
      {upcoming.length ? (
        <ActivityList title="Upcoming">
          {upcoming.map((i, n) => (
            <InviteRow key={i.id ?? n} invite={i} showStatus={false} today={today} onPress={() => show(i)} />
          ))}
        </ActivityList>
      ) : null}
      {past.length ? (
        <ActivityList title="Earlier">
          {past.map((i, n) => (
            <InviteRow key={i.id ?? n} invite={i} showStatus today={today} onPress={() => show(i)} />
          ))}
        </ActivityList>
      ) : null}
      <InviteSheet invite={selected} open={open && !!selected} onClose={() => setOpen(false)} onCancel={askCancel} />
      <ConfirmSheet
        visible={!!confirming}
        onClose={() => setConfirming(null)}
        title={`Cancel ${cName}’s invite?`}
        from={{ title: 'Invited', subtitle: confirming?.code ? `Code ${confirming.code}` : undefined, icon: Ticket, module: 'visitors' }}
        to={{ title: 'Cancelled', subtitle: 'The code stops working', icon: Ban }}
        detailsTitle="Invitation"
        confirmLabel="Swipe to cancel invite"
        onConfirm={doCancel}
        loading={cancel.isPending}
        note={`Nobody is messaged, so tell ${cName || 'the guest'} yourself. This can’t be undone.`}>
        {confirming ? (
          <SummaryCard
            hideEmpty
            rows={[
              { label: 'Guest', value: cName },
              { label: 'Day', value: dateLabel(confirming.visitDate, today) },
              { label: 'Time', value: cWin || 'Any time' },
            ]}
          />
        ) : null}
      </ConfirmSheet>
    </View>
  );
}

const styles = themedStyles(() => ({
  center: { alignSelf: 'center' },
  code: { alignSelf: 'stretch', gap: space.sm },
  codeBlock: { gap: space.sm, paddingTop: space.xxs },
}));
