// The roster's irreversible or access-changing actions, each a ConfirmSheet + SwipeToConfirm that says
// what happens and who is told (PLAN §2.1.6, docs/port/hr-people.md §4.2):
//   ResignSheet   Mark resigned / Rejoin (EmpRoster toggleResign, dash.html:5760). Blocked while they
//                 hold IT assets (:5713). Resigning sweeps their bounty wallet into the company wallet
//                 (routes/users.js:270) and Rejoin does not bring it back — the sheet says how many coins.
//   RoleSheet     Change the account type (changeRoleInline :5625 / the edit form's Account type).
//   RemoveSheet   Remove for good (DESTRUCTIVE roles): blocked while assets are held, warns about active
//                 tasks and bookings (:5727), then DELETE /users and only then the roster invitation.
// None of these send an email or WhatsApp (the server sends nothing for them); the sheets say so.

import { Briefcase, Check, PackageX, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react-native';
import { useState } from 'react';

import {
  removeEmployee,
  type RosterRecord,
  saveRosterPerson,
  useActiveWork,
  useAssetList,
  useInvalidatePeople,
  useWalletBalance,
} from '@/api/people';
import { useSession } from '@/auth/session';
import { ACCOUNT_TYPES } from '@/features/people/access';
import { heldAssets, roleLabel } from '@/features/people/roster';
import { useTodayIst } from '@/features/attendance/use-now';
import { dateLabel } from '@/lib/dates';
import { plural } from '@/lib/format';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Button, ConfirmSheet, ListCard, ListRow, Sheet, SummaryCard, toast } from '@/ui';

const NO_MESSAGE = 'No one is emailed or messaged';

/** Assets still with them: the sheet that blocks resign / remove until they are collected. */
function HeldAssetsSheet({ visible, onClose, name, action, assets }: { visible: boolean; onClose: () => void; name: string; action: string; assets: ReturnType<typeof heldAssets> }) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Collect their assets first"
      subtitle={`${name} still has ${plural(assets.length, 'asset')}. Collect ${assets.length === 1 ? 'it' : 'them'} before you ${action}.`}
      footer={<Button title="OK" variant="primary" onPress={onClose} />}>
      <ActivityList>
        {assets.map((a) => (
          <ActivityRow key={a.id} module="support" icon={PackageX} title={a.name} subtitle={[a.assetId, a.serial].filter(Boolean).join(' · ') || null} />
        ))}
      </ActivityList>
    </Sheet>
  );
}

// ── Resign / Rejoin ──────────────────────────────────────────────────────────

export function ResignSheet({ row, visible, onClose }: { row: RosterRecord; visible: boolean; onClose: () => void }) {
  const me = useSession((s) => s.user);
  const today = useTodayIst();
  const invalidate = useInvalidatePeople();
  const resigning = !row.resigned;
  const assets = useAssetList(visible && resigning);
  const wallet = useWalletBalance(row.invited ? null : row.id, visible && resigning);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const held = resigning ? heldAssets(row, assets.data) : [];
  const checking = resigning && assets.isPending;
  // The website blocks on what it knows about assets; with no list at all, don't guess "none".
  const unchecked = resigning && !assets.data && assets.isError;

  if (visible && held.length) {
    return <HeldAssetsSheet visible onClose={onClose} name={row.name} action="mark them as resigned" assets={held} />;
  }

  const coins = wallet.data;
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const patch = resigning
        ? { resigned: true, resignedAt: new Date().toISOString(), resignedBy: me?.name ?? '', resignedById: me?.id ?? '' }
        : { resigned: false, resignedAt: null, resignedBy: null, resignedById: null };
      const r = await saveRosterPerson(row, patch);
      await invalidate();
      onClose();
      if (r.mirrorError) toast.show(`Saved, but their invitation was not updated: ${r.mirrorError}`, 'danger');
      else toast.show(resigning ? `${row.name} is marked as resigned.` : `${row.name} is back on the active roster.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      title={resigning ? 'Mark as resigned' : 'Rejoin'}
      from={{ title: row.name, subtitle: roleLabel(row.role), avatar: { name: row.name } }}
      to={resigning ? { title: 'Resigned', subtitle: dateLabel(today, today), icon: UserX, module: 'people' } : { title: 'Active', subtitle: 'Back on the roster', icon: UserCheck, module: 'people' }}
      detailsTitle="What happens"
      confirmLabel={resigning ? 'Swipe to mark resigned' : 'Swipe to rejoin'}
      onConfirm={confirm}
      loading={busy}
      disabled={checking || unchecked}
      note={checking ? 'Checking their assets…' : unchecked ? 'Their IT assets could not be checked.' : NO_MESSAGE}>
      {unchecked ? (
        <Banner
          tone="warning"
          title="Couldn’t check their IT assets"
          message="Anything still with them has to be collected first."
          action={{ label: 'Try again', onPress: () => void assets.refetch() }}
          style={styles.below}
        />
      ) : null}
      <SummaryCard
        rows={
          resigning
            ? [
                { key: 'list', label: 'Roster', value: 'Moves to Resigned' },
                {
                  key: 'coins',
                  label: 'Bounty coins',
                  value: row.invited ? 'None (not signed up)' : coins == null ? (wallet.isPending ? 'Checking…' : 'Any left') : plural(coins, 'coin'),
                  hint: row.invited ? null : 'Go to the company wallet now. Rejoining does not bring them back.',
                },
              ]
            : [
                { key: 'list', label: 'Roster', value: 'Back to Active' },
                { key: 'coins', label: 'Bounty coins', value: 'Stay with the company', hint: 'Coins swept when they resigned are not returned.' },
              ]
        }
      />
      {error ? <Banner tone="danger" title="Couldn’t save" message={error} style={styles.gap} /> : null}
    </ConfirmSheet>
  );
}

// ── Account type ─────────────────────────────────────────────────────────────

export function RoleSheet({ row, visible, onClose }: { row: RosterRecord; visible: boolean; onClose: () => void }) {
  const invalidate = useInvalidatePeople();
  const [next, setNext] = useState<string | null>(null);
  // 'list' → pick a type; 'confirm' → swipe. In between, the list's Modal closes before the confirm opens.
  const [stage, setStage] = useState<'list' | 'between' | 'confirm'>('list');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setNext(null);
    setStage('list');
    setError(null);
    onClose();
  };
  const pick = (r: string) => {
    setNext(r);
    setStage('between');
    setTimeout(() => setStage('confirm'), 320);
  };
  const confirm = async () => {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      const r = await saveRosterPerson(row, { role: next });
      await invalidate();
      close();
      if (r.mirrorError) toast.show(`Saved, but their invitation was not updated: ${r.mirrorError}`, 'danger');
      else toast.show(`${row.name} is now ${roleLabel(next)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet visible={visible && stage === 'list'} onClose={close} title="Account type" subtitle={`${row.name} is ${roleLabel(row.role)} now.`}>
        <ListCard>
          {ACCOUNT_TYPES.map((r) => (
            <ListRow
              key={r}
              left={<Briefcase size={20} color={r === row.role ? palette.primaryText : palette.textMuted} />}
              title={roleLabel(r)}
              right={r === row.role ? <Check size={20} color={palette.primaryText} strokeWidth={2} /> : undefined}
              disabled={r === row.role}
              onPress={r === row.role ? undefined : () => pick(r)}
              accessibilityHint={r === row.role ? 'Their account type now' : undefined}
            />
          ))}
        </ListCard>
      </Sheet>
      <ConfirmSheet
        visible={visible && stage === 'confirm' && !!next}
        onClose={close}
        title="Change account type"
        from={{ title: roleLabel(row.role), subtitle: 'Now', icon: Briefcase, module: 'people' }}
        to={{ title: roleLabel(next), subtitle: 'From now on', icon: ShieldCheck, module: 'people' }}
        detailsTitle="What changes"
        confirmLabel="Swipe to change"
        onConfirm={confirm}
        loading={busy}
        note={NO_MESSAGE}>
        <SummaryCard
          rows={[
            { key: 'who', label: 'Person', value: row.name },
            { key: 'access', label: 'Their menus', value: 'Follow the new type', hint: 'They see it the next time they open DASH.' },
          ]}
        />
        {error ? <Banner tone="danger" title="Couldn’t save" message={error} style={styles.gap} /> : null}
      </ConfirmSheet>
    </>
  );
}

// ── Remove for good ──────────────────────────────────────────────────────────

export function RemoveSheet({ row, visible, onClose, onRemoved }: { row: RosterRecord; visible: boolean; onClose: () => void; onRemoved: () => void }) {
  const invalidate = useInvalidatePeople();
  const assets = useAssetList(visible);
  const work = useActiveWork(row.name, visible && !row.invited);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const held = heldAssets(row, assets.data);
  if (visible && held.length) {
    return <HeldAssetsSheet visible onClose={onClose} name={row.name} action="remove them" assets={held} />;
  }
  const checking = assets.isPending || (!row.invited && work.isPending);
  const unchecked = !assets.data && assets.isError;
  const tasks = work.data?.tasks ?? 0;
  const bookings = work.data?.bookings ?? 0;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await removeEmployee(row);
      await invalidate();
      onClose();
      onRemoved();
      if (r.inviteError) toast.show(`Their account is gone, but the invitation is still there: ${r.inviteError}`, 'danger');
      else toast.show(`${row.name} was removed.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      title="Remove for good"
      subtitle="This can’t be undone. Mark them as resigned instead to keep their record."
      from={{ title: row.name, subtitle: roleLabel(row.role), avatar: { name: row.name } }}
      to={{ title: 'Removed', subtitle: row.invited ? 'Invitation deleted' : 'Account deleted', icon: Trash2, module: 'people' }}
      detailsTitle="Before you remove"
      confirmLabel="Swipe to remove for good"
      onConfirm={confirm}
      loading={busy}
      disabled={checking || unchecked}
      note={checking ? 'Checking their assets and work…' : unchecked ? 'Their IT assets could not be checked.' : NO_MESSAGE}>
      {unchecked ? (
        <Banner
          tone="warning"
          title="Couldn’t check their IT assets"
          message="Anything still with them has to be collected first."
          action={{ label: 'Try again', onPress: () => void assets.refetch() }}
          style={styles.below}
        />
      ) : null}
      <SummaryCard
        rows={[
          ...(row.invited
            ? [{ key: 'inv', label: 'Invitation', value: 'Deleted', hint: 'They can no longer sign up.' }]
            : [
                { key: 'tasks', label: 'Active tasks', value: work.isPending ? 'Checking…' : String(tasks), valueColor: tasks ? palette.warningInk : undefined },
                { key: 'bookings', label: 'Active bookings', value: work.isPending ? 'Checking…' : String(bookings), valueColor: bookings ? palette.warningInk : undefined },
                { key: 'acct', label: 'Account', value: 'Deleted', hint: 'Their tasks, leave and history keep only their name.' },
              ]),
        ]}
      />
      {tasks || bookings ? (
        <Banner
          tone="warning"
          title="They still have work"
          message={`${[tasks ? plural(tasks, 'active task') : '', bookings ? plural(bookings, 'active booking') : ''].filter(Boolean).join(' and ')}. Reassign it first if it still matters.`}
          style={styles.gap}
        />
      ) : null}
      {error ? <Banner tone="danger" title="Couldn’t remove" message={error} style={styles.gap} /> : null}
    </ConfirmSheet>
  );
}

const styles = themedStyles(() => ({
  gap: { marginTop: space.sm },
  below: { marginBottom: space.sm },
}));
