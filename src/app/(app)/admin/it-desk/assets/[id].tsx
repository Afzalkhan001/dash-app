// One asset (web: the Asset Details modal and the row ⋮ menu, dash.html:20718–20980). Read from the
// cached list (there is no GET by id). Everything the website shows: the 15 fields, the description,
// the assignment timeline (one entry made up from the assignment date when an assigned asset has no
// history, as the website does), and the actions:
//   Assign       person picker (employees, professionals, managers, admins + invited people) → swipe.
//                The server emails + WhatsApps the person a link to acknowledge it.
//   Return       optional remarks → swipe. No one is messaged.
//   Condition    Good / Fair / Not working (plus a legacy value already on the asset). Only that changes.
//   Resend link  when an acknowledgement is waiting → swipe (email + WhatsApp again).
//   Fix name     when the employee number matches nobody → pick the right person (name + email only).
//   Delete       swipe; can't be undone.
// History is read fresh just before assign / return (api/itdesk), so a website edit isn't lost.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Link2, MoreHorizontal, Package, Send, Trash2, Undo2, UserPlus, Wrench } from 'lucide-react-native';
import { useState } from 'react';

import { useAssets, useAssetWrites } from '@/api/itdesk';
import { useTodayIst } from '@/features/attendance/use-now';
import { ASSIGNABLE_ROLES, canSeeAssets } from '@/features/itdesk/access';
import { ACK_WORDS, ackState, ASSET_CONDITIONS, type AssignCandidate, assetIcon, assignPool, conditionTone, conditionWords, holderOf, isAssigned } from '@/features/itdesk/format';
import { useAssetDirectory } from '@/features/itdesk/ui';
import { PersonPicker } from '@/features/shared/person-picker';
import { dateLabel, stampLabel } from '@/lib/dates';
import { firstName, inr } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  ActionBar,
  ActionRow,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  EventTimeline,
  MenuSheet,
  NavHeader,
  Screen,
  SelectTiles,
  Sheet,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  SummaryHero,
  Text,
  TextField,
  toast,
} from '@/ui';

type Done = { title: string; subtitle: string; back?: boolean };

export default function AssetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useAccess();
  const allowed = canSeeAssets(access);
  const today = useTodayIst();
  const assets = useAssets(allowed);
  const { users, invitees, dir } = useAssetDirectory(allowed);
  const w = useAssetWrites();

  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState<'assign' | 'link' | null>(null);
  const [assignTo, setAssignTo] = useState<AssignCandidate | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const [condOpen, setCondOpen] = useState(false);
  const [cond, setCond] = useState('');
  const [resending, setResending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  if (access.user && !allowed) return <Redirect href="/" />;

  const a = (assets.data ?? []).find((x) => x.id === id) ?? null;

  if (!a) {
    return (
      <Screen header={<NavHeader title="Asset" />}>
        {done ? (
          <SuccessSheet visible onClose={() => router.back()} onPrimary={() => router.back()} title={done.title} subtitle={done.subtitle} />
        ) : assets.isPending ? (
          <SkeletonList rows={6} />
        ) : assets.isError ? (
          <ErrorState message={assets.error?.message ?? ''} onRetry={() => void assets.refetch()} />
        ) : (
          <EmptyState icon={<Package color={palette.textMuted} />} title="This asset is gone" message="Someone may have deleted it." />
        )}
      </Screen>
    );
  }

  const assigned = isAssigned(a);
  const holder = holderOf(a, dir);
  const noName = assigned && !!dir && !holder;
  const ack = ackState(a);
  const pool = assignPool(users.data ?? [], invitees.data ?? [], ASSIGNABLE_ROLES);
  const condOptions = [...ASSET_CONDITIONS, ...(a.condition && !ASSET_CONDITIONS.includes(a.condition) ? [a.condition] : [])];
  const Icon = assetIcon(a.assetType, a.category);

  // dash.html:20941 — an assigned asset with no history gets one entry made up from its assignment date.
  const timeline = a.history.length
    ? a.history
    : assigned
      ? [{ action: 'assigned', to: holder || `Employee ${a.assignedToEmpNo}`, at: a.assignmentDate || undefined, note: undefined, from: undefined }]
      : [];
  const events = [...timeline].reverse().map((h, i) => {
    const given = h.action === 'assigned';
    return {
      key: `${i}`,
      label: given ? `Given to ${h.to || 'someone'}` : `Returned by ${h.from || 'someone'}`,
      at: h.at ? (h.at.length === 10 ? dateLabel(h.at, today) : stampLabel(h.at, today)) : undefined,
      note: !given ? h.note : undefined,
      tone: given ? ('info' as const) : ('neutral' as const),
    };
  });

  const fail = (what: string) => (e: Error) => toast.show(`Couldn’t ${what}: ${e.message}`, 'danger');

  const menuItems = [
    { key: 'cond', label: 'Change condition', icon: Wrench, onPress: () => openCondition() },
    ...(ack === 'waiting' ? [{ key: 'resend', label: 'Send the acknowledgement link again', icon: Send, onPress: () => setResending(true) }] : []),
    ...(noName ? [{ key: 'link', label: 'Fix the employee name', icon: Link2, onPress: () => setPicking('link') }] : []),
    { key: 'delete', label: 'Delete asset', icon: Trash2, tone: 'danger' as const, onPress: () => setDeleting(true) },
  ];
  function openCondition() {
    setCond(a?.condition || 'Good');
    setCondOpen(true);
  }

  return (
    <Screen
      header={<NavHeader title={a.name} subtitle={[a.assetId, a.category].filter(Boolean).join(' · ') || undefined} actions={[{ icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) }]} />}
      onRefresh={() => assets.refetch()}
      footer={
        <ActionBar>
          <ActionRow context="bar">
            <Button variant="accent" title="Condition" icon={<Wrench />} onPress={openCondition} />
            {assigned ? (
              <Button
                variant="primary"
                title="Take it back"
                icon={<Undo2 />}
                onPress={() => {
                  setNote('');
                  setReturning(true);
                }}
              />
            ) : (
              <Button variant="primary" title="Assign" icon={<UserPlus />} onPress={() => setPicking('assign')} />
            )}
          </ActionRow>
        </ActionBar>
      }>
      <SummaryHero
        icon={Icon}
        module="support"
        label={[a.category, a.assetType].filter(Boolean).join(' · ') || 'Asset'}
        value={a.price}
        currency="₹"
        decimals={0}
        info={assigned ? { label: holder ? `With ${holder}` : `Employee ${a.assignedToEmpNo}`, value: ACK_WORDS[ack].label } : { label: 'In stock' }}
        sub={assigned && a.assignmentDate ? `Given on ${dateLabel(a.assignmentDate, today)}` : a.returnedAt ? `Back since ${dateLabel(a.returnedAt, today)}` : undefined}
      />

      {noName ? (
        <Banner
          tone="warning"
          title={`Employee ${a.assignedToEmpNo} matches nobody`}
          message="No one in DASH or the invitations has this employee number. Pick the right person to attach their name."
          action={{ label: 'Fix', onPress: () => setPicking('link') }}
        />
      ) : null}
      {ack === 'waiting' ? (
        <Banner
          tone="info"
          title={`Waiting for ${holder ? firstName(holder) : 'them'} to acknowledge`}
          message="They got an email with a link to confirm they have it."
          action={{ label: 'Send again', onPress: () => setResending(true) }}
        />
      ) : null}

      {a.description ? (
        <Card style={styles.note}>
          <Text variant="labelStrong" muted>
            Description
          </Text>
          <Text variant="body">{a.description}</Text>
        </Card>
      ) : null}

      <SummaryCard
        rows={[
          { key: 'id', label: 'Asset ID', value: a.assetId || '—' },
          { key: 'serial', label: 'Serial number', value: a.serial || '—' },
          { key: 'cat', label: 'Category', value: a.category || '—' },
          { key: 'type', label: 'Type', value: a.assetType || '—' },
          { key: 'loc', label: 'Location', value: a.location || '—' },
          { key: 'bought', label: 'Bought on', value: a.purchaseDate ? dateLabel(a.purchaseDate, today) : '—' },
          { key: 'ws', label: 'Warranty', value: a.warrantyStatus || '—', status: a.warrantyStatus === 'Active' ? 'done' : a.warrantyStatus === 'Expired' ? 'failed' : null },
          { key: 'we', label: 'Warranty ends', value: a.warrantyExpiry ? dateLabel(a.warrantyExpiry, today) : '—' },
          { key: 'cond', label: 'Condition', value: conditionWords(a.condition), status: a.condition ? conditionTone(a.condition) : null },
          { key: 'price', label: 'Value', value: inr(a.price) },
          { key: 'emp', label: 'Employee number', value: a.assignedToEmpNo || '—' },
          { key: 'who', label: 'With', value: assigned ? holder || 'No name found' : 'In stock' },
          { key: 'on', label: 'Given on', value: a.assignmentDate ? dateLabel(a.assignmentDate, today) : '—' },
          ...(a.ackToken || a.acknowledged ? [{ key: 'ack', label: 'Acknowledged', value: a.acknowledged ? (a.acknowledgedAt ? stampLabel(a.acknowledgedAt, today) : 'Yes') : 'Not yet', status: a.acknowledged ? ('done' as const) : ('pending' as const) }] : []),
          ...(a.returnNote ? [{ key: 'ret', label: 'Last return note', value: a.returnNote }] : []),
        ]}
      />

      <Card style={styles.note}>
        <Text variant="labelStrong" muted>
          Who has had it
        </Text>
        {events.length ? <EventTimeline events={events} /> : <Text variant="body" muted>No one has had it yet.</Text>}
      </Card>

      <MenuSheet visible={menu} onClose={() => setMenu(false)} title={a.name} items={menuItems} />

      <PersonPicker
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'link' ? `Who is employee ${a.assignedToEmpNo}?` : `Give ${a.name} to`}
        people={pool}
        loading={users.isPending}
        recentKey="itdesk.assign"
        allowOnLeave
        onPick={(p) => {
          const c = pool.find((x) => x.id === p.id) ?? null;
          const mode = picking;
          setPicking(null);
          if (!c) return;
          if (mode === 'assign') setAssignTo(c);
          else
            w.link.mutate(
              { id: a.id, name: c.name, email: c.email },
              { onSuccess: () => toast.show(`Linked to ${c.name}`, 'success'), onError: fail('link the name') },
            );
        }}
      />

      <ConfirmSheet
        visible={!!assignTo}
        onClose={() => setAssignTo(null)}
        title="Give this asset?"
        from={{ title: a.name, subtitle: a.assetId || a.serial || undefined, icon: Icon, module: 'support' }}
        to={{ title: assignTo?.name ?? '', subtitle: assignTo?.notSignedUp ? 'Not signed up yet' : assignTo?.employeeNumber ? `Employee ${assignTo.employeeNumber}` : undefined, avatar: { name: assignTo?.name ?? '' } }}
        confirmLabel="Swipe to assign"
        loading={w.assign.isPending}
        // The server only counts it as assigned, and only sends the acknowledgement link, when there is
        // an employee number (routes/assets.js:96–97). Without one the asset would look in stock.
        disabled={!assignTo?.employeeNumber}
        onConfirm={() =>
          assignTo &&
          w.assign.mutate(
            { id: a.id, person: { name: assignTo.name, employeeNumber: assignTo.employeeNumber ?? '', email: assignTo.email }, today },
            {
              onSuccess: () => {
                const who = assignTo.name;
                setAssignTo(null);
                setDone({ title: 'Asset assigned', subtitle: `${who} gets an email and a WhatsApp with a link to confirm they have it.` });
              },
              onError: (e) => {
                setAssignTo(null);
                fail('assign it')(e);
              },
            },
          )
        }
        note={
          assignTo && !assignTo.employeeNumber
            ? `${firstName(assignTo.name)} has no employee number in DASH yet, so the asset can’t be given to them. Add their employee number first.`
            : `${assignTo ? firstName(assignTo.name) : 'The employee'} gets an email and a WhatsApp with a link to acknowledge it.`
        }>
        <SummaryCard
          rows={[
            { key: 'serial', label: 'Serial number', value: a.serial || '—' },
            { key: 'cond', label: 'Condition', value: conditionWords(a.condition) },
            { key: 'on', label: 'Given on', value: dateLabel(today, today) },
          ]}
        />
      </ConfirmSheet>

      <ConfirmSheet
        visible={returning}
        onClose={() => setReturning(false)}
        title="Take this asset back?"
        from={{ title: holder || `Employee ${a.assignedToEmpNo}`, subtitle: 'Has it now', avatar: { name: holder || '?' } }}
        to={{ title: 'In stock', subtitle: a.location || undefined, icon: Package, module: 'support' }}
        confirmLabel="Swipe to take it back"
        loading={w.giveBack.isPending}
        onConfirm={() =>
          w.giveBack.mutate(
            { id: a.id, note: note.trim() },
            {
              onSuccess: () => {
                setReturning(false);
                setDone({ title: 'Back in stock', subtitle: `${a.name} is available to give to someone else.` });
              },
              onError: (e) => {
                setReturning(false);
                fail('take it back')(e);
              },
            },
          )
        }
        note="No one is messaged. The return goes into its history.">
        <TextField label="Remarks (optional)" value={note} onChangeText={setNote} placeholder="e.g. Good condition, charger missing" multiline maxLength={300} counter />
      </ConfirmSheet>

      <Sheet
        visible={condOpen}
        onClose={() => setCondOpen(false)}
        title="Condition"
        subtitle={assigned ? `It stays with ${holder || `employee ${a.assignedToEmpNo}`}. Only the condition changes.` : 'It stays in stock. Only the condition changes.'}
        footer={
          <Button
            title="Save"
            loading={w.condition.isPending}
            disabled={!cond || cond === a.condition}
            onPress={() =>
              w.condition.mutate(
                { id: a.id, condition: cond },
                {
                  onSuccess: () => {
                    setCondOpen(false);
                    toast.show(`Condition set to ${conditionWords(cond).toLowerCase()}`, 'success');
                  },
                  onError: fail('save the condition'),
                },
              )
            }
          />
        }>
        <SelectTiles value={cond} onChange={setCond} accessibilityLabel="Condition" options={condOptions.map((c) => ({ value: c, label: conditionWords(c) }))} />
      </Sheet>

      <ConfirmSheet
        visible={resending}
        onClose={() => setResending(false)}
        title="Send the link again?"
        from={{ title: a.name, subtitle: 'Acknowledgement link', icon: Send, module: 'support' }}
        to={{ title: holder || `Employee ${a.assignedToEmpNo}`, subtitle: 'Email and WhatsApp', avatar: { name: holder || '?' } }}
        confirmLabel="Swipe to send"
        loading={w.resend.isPending}
        onConfirm={() =>
          w.resend.mutate(a.id, {
            onSuccess: () => {
              setResending(false);
              toast.show(`Sent to ${holder || 'them'} again`, 'success');
            },
            onError: (e) => {
              setResending(false);
              fail('send it')(e);
            },
          })
        }
        note={`${holder ? firstName(holder) : 'The employee'} gets the same email and WhatsApp again.`}
      />

      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${a.name}?`}
        from={{ title: a.name, subtitle: a.assetId || a.serial || undefined, icon: Icon, module: 'support' }}
        to={{ title: 'Deleted', subtitle: 'With its history', icon: Trash2, module: 'security' }}
        confirmLabel="Swipe to delete"
        loading={w.remove.isPending}
        onConfirm={() =>
          w.remove.mutate(a.id, {
            onSuccess: () => {
              setDeleting(false);
              setDone({ title: 'Asset deleted', subtitle: `${a.name} and its history are gone.`, back: true });
            },
            onError: (e) => {
              setDeleting(false);
              fail('delete it')(e);
            },
          })
        }
        note={assigned ? `This can’t be undone. ${holder || 'The employee'} still has it — take it back first if it was returned. No one is notified.` : 'This can’t be undone. No one is notified.'}
      />

      <SuccessSheet
        visible={!!done}
        onClose={() => (done?.back ? router.back() : setDone(null))}
        onPrimary={() => (done?.back ? router.back() : setDone(null))}
        title={done?.title ?? ''}
        subtitle={done?.subtitle}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  note: { gap: space.xs },
}));
