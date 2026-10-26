// One asset (web: the Asset Details modal and the row ⋮ menu, dash.html:20718–20980). Read from the
// cached list (there is no GET by id). Everything the website shows: the 15 fields, the third party
// and the Comments, the description, the assignment timeline (one entry made up from the assignment
// date when an assigned asset has no history, as the website does), and the actions:
//   Assign       person picker (employees, professionals, managers, admins + invited people) → swipe.
//                The server emails + WhatsApps the person a link to acknowledge it.
//   Allocate     to a third party (vendor, client, contractor): name, organisation, phone, e-mail,
//                remarks → swipe. Comments get the "Allocated to X (Org)" label; the third party is
//                e-mailed "Asset Assigned" only when an e-mail is given. Only from stock.
//   Return       optional remarks → swipe. The employee gets an "Asset Recovered" e-mail; from a third
//                party, they get it when an e-mail is on file, and the label comes out of Comments.
//   Condition    Good / Fair / Not working (plus a legacy value already on the asset). Only that changes.
//   Resend link  when an acknowledgement is waiting → swipe (email + WhatsApp again).
//   Fix name     when the employee number matches nobody → pick the right person (name + email only).
//   Delete       swipe; can't be undone.
// History is read fresh just before assign / return (api/itdesk), so a website edit isn't lost.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Link2, MoreHorizontal, Package, Send, Trash2, Undo2, UserPlus, Wrench } from 'lucide-react-native';
import { useState } from 'react';

import { TP_BLANK, type TpInput, tpCommentsLabel, tpEmailOk, tpProblem, useAssets, useAssetWrites } from '@/api/itdesk';
import { useTodayIst } from '@/features/attendance/use-now';
import { ASSIGNABLE_ROLES, canSeeAssets } from '@/features/itdesk/access';
import {
  ACK_WORDS,
  ackState,
  ASSET_CONDITIONS,
  type AssignCandidate,
  assetIcon,
  assignPool,
  conditionIcon,
  conditionTone,
  conditionWords,
  holderOf,
  isAllocated,
  isAssigned,
} from '@/features/itdesk/format';
import { useAssetDirectory } from '@/features/itdesk/ui';
import { PersonPicker } from '@/features/shared/person-picker';
import { dateLabel, stampLabel } from '@/lib/dates';
import { firstName } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { themedStyles } from '@/theme/themed';
import { palette, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
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
  const [allocating, setAllocating] = useState<'form' | 'confirm' | null>(null);
  const [tp, setTp] = useState<TpInput>(TP_BLANK);
  const [tpTried, setTpTried] = useState(false);

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
  const allocated = isAllocated(a);
  const party = allocated ? a.thirdParty : null;
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
  // dash.html:21102: an allocation shows who outside DASH has it, with the organisation and remarks.
  const events = [...timeline].reverse().map((h, i) => {
    const given = h.action === 'assigned';
    const alloc = h.action === 'allocated';
    return {
      key: `${i}`,
      label: alloc
        ? `Allocated to ${h.to || 'a third party'}`
        : given
          ? `Given to ${h.to || 'someone'}`
          : `Returned by ${h.from || 'someone'}${h.thirdParty ? ' (third party)' : ''}`,
      at: h.at ? (h.at.length === 10 ? dateLabel(h.at, today) : stampLabel(h.at, today)) : undefined,
      detail: alloc ? [h.org, h.note].filter(Boolean).join(' — ') || undefined : undefined,
      note: !given && !alloc ? h.note : undefined,
      tone: alloc ? ('wait' as const) : given ? ('info' as const) : ('neutral' as const),
    };
  });

  const fail = (what: string) => (e: Error) => toast.show(`Couldn’t ${what}: ${e.message}`, 'danger');

  // Condition is the footer's own button, so the menu holds only what the footer doesn't.
  const menuItems = [
    // dash.html:20841: only an asset in stock can go to a third party.
    ...(!assigned && !allocated ? [{ key: 'allocate', label: 'Allocate to a third party', hint: 'A vendor, client or contractor', icon: Building2, onPress: () => openAllocate() }] : []),
    ...(ack === 'waiting' ? [{ key: 'resend', label: 'Send the link again', hint: 'Email and WhatsApp', icon: Send, onPress: () => setResending(true) }] : []),
    ...(noName ? [{ key: 'link', label: 'Fix the employee name', icon: Link2, onPress: () => setPicking('link') }] : []),
    { key: 'delete', label: 'Delete asset', icon: Trash2, tone: 'danger' as const, onPress: () => setDeleting(true) },
  ];
  function openCondition() {
    setCond(a?.condition || 'Good');
    setCondOpen(true);
  }
  function openAllocate() {
    setTp(TP_BLANK);
    setTpTried(false);
    setAllocating('form');
  }
  const setTpField = (k: keyof TpInput) => (v: string) => setTp((x) => ({ ...x, [k]: v }));
  const tpBad = tpProblem(tp);
  const takeBack = () => {
    setNote('');
    setReturning(true);
  };

  return (
    <Screen
      header={<NavHeader title={a.name} subtitle={[a.assetId, a.category].filter(Boolean).join(' · ') || undefined} actions={[{ icon: MoreHorizontal, label: 'More actions', onPress: () => setMenu(true) }]} />}
      onRefresh={() => assets.refetch()}
      footer={
        <ActionBar>
          <ActionRow context="bar">
            <Button variant="accent" title="Condition" icon={<Wrench />} onPress={openCondition} />
            {assigned ? (
              <Button variant="primary" title="Take it back" icon={<Undo2 />} onPress={takeBack} />
            ) : allocated ? (
              <Button variant="primary" title="Return from third party" icon={<Undo2 />} onPress={takeBack} />
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
        decimals={2}
        // The waiting banner below says "waiting" in full, so the chip doesn't say it again.
        info={
          assigned
            ? { label: holder ? `With ${holder}` : `Employee ${a.assignedToEmpNo}`, value: ack === 'waiting' ? undefined : ACK_WORDS[ack].label }
            : party
              ? { label: `With ${party.name}`, value: 'Third party' }
              : { label: 'In stock' }
        }
        sub={
          assigned && a.assignmentDate
            ? `Given on ${dateLabel(a.assignmentDate, today)}`
            : party
              ? party.allocatedAt
                ? `Allocated on ${dateLabel(party.allocatedAt, today)}`
                : undefined
              : a.returnedAt
                ? `Back since ${dateLabel(a.returnedAt, today)}`
                : undefined
        }
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

      {a.comments ? (
        <Card style={styles.note}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            Comments
          </Text>
          <Text variant="body">{a.comments}</Text>
        </Card>
      ) : null}

      {a.description ? (
        <Card style={styles.note}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
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
          // Value, who has it and when it was given are in the hero above; said once.
          ...(assigned ? [{ key: 'emp', label: 'Employee number', value: a.assignedToEmpNo }] : []),
          // dash.html:21077: who outside DASH has it.
          ...(party
            ? [
                { key: 'tp', label: 'Allocated to', value: party.name },
                { key: 'org', label: 'Organisation', value: party.organisation || '—' },
                { key: 'tel', label: 'Contact', value: party.phone || '—' },
                { key: 'mail', label: 'E-mail', value: party.email || '—' },
              ]
            : []),
          ...(a.ackToken || a.acknowledged ? [{ key: 'ack', label: 'Acknowledged', value: a.acknowledged ? (a.acknowledgedAt ? stampLabel(a.acknowledgedAt, today) : 'Yes') : 'Not yet', status: a.acknowledged ? ('done' as const) : ('pending' as const) }] : []),
          ...(a.returnNote ? [{ key: 'ret', label: 'Last return note', value: a.returnNote }] : []),
        ]}
      />

      <Card style={styles.note}>
        <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
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
        title={party ? 'Return from third party?' : 'Take this asset back?'}
        from={
          party
            ? { title: party.name, subtitle: party.organisation || 'Third party', icon: Building2, module: 'support' }
            : { title: holder || `Employee ${a.assignedToEmpNo}`, subtitle: 'Has it now', avatar: { name: holder || '?' } }
        }
        to={{ title: 'In stock', subtitle: a.location || undefined, icon: Package, module: 'support' }}
        confirmLabel={party ? 'Swipe to return it' : 'Swipe to take it back'}
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
        note={
          party
            ? party.email
              ? `${firstName(party.name)} gets an “Asset Recovered” e-mail with your remarks. The “Allocated to” label comes out of Comments.`
              : 'No e-mail is on file for them, so no one is messaged. The “Allocated to” label comes out of Comments.'
            : `${holder ? firstName(holder) : 'The employee'} gets an “Asset Recovered” e-mail with your remarks. The return goes into its history.`
        }>
        <TextField label="Remarks (optional)" value={note} onChangeText={setNote} placeholder="e.g. Good condition, charger missing" multiline maxLength={300} counter />
      </ConfirmSheet>

      <Sheet
        visible={condOpen}
        onClose={() => setCondOpen(false)}
        title="Condition"
        subtitle={
          assigned
            ? `It stays with ${holder || `employee ${a.assignedToEmpNo}`}. Only the condition changes.`
            : party
              ? `It stays with ${party.name}. Only the condition changes.`
              : 'It stays in stock. Only the condition changes.'
        }
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
        <SelectTiles value={cond} onChange={setCond} accessibilityLabel="Condition" options={condOptions.map((c) => ({ value: c, label: conditionWords(c), icon: conditionIcon(c) }))} />
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
        note={
          assigned
            ? `This can’t be undone. ${holder || 'The employee'} still has it — take it back first if it was returned. No one is notified.`
            : party
              ? `This can’t be undone. ${party.name} still has it — return it first if it came back. No one is notified.`
              : 'This can’t be undone. No one is notified.'
        }
      />

      {/* Allocate to a third party (dash.html:20886): the form, then a swipe that names who is told. */}
      <Sheet
        visible={allocating === 'form'}
        onClose={() => setAllocating(null)}
        title="Allocate to a third party"
        subtitle="A vendor, client or contractor outside DASH"
        dirty={!!(tp.name || tp.org || tp.phone || tp.email || tp.note)}
        footer={
          <Button
            title="Continue"
            icon={<Building2 />}
            onPress={() => {
              setTpTried(true);
              if (!tpBad) setAllocating('confirm');
            }}
          />
        }>
        <Text variant="caption" muted>
          It leaves your stock and its Comments say who has it. No employee is notified.
        </Text>
        <TextField
          label="Allocated to (person or company)"
          value={tp.name}
          onChangeText={setTpField('name')}
          placeholder="e.g. Ravi Kumar"
          autoCapitalize="words"
          maxLength={120}
          error={tpTried && tp.name.trim().length < 2 ? 'Say who the asset is allocated to.' : null}
        />
        <TextField label="Organisation (optional)" value={tp.org} onChangeText={setTpField('org')} placeholder="e.g. Sai Studios" autoCapitalize="words" maxLength={120} />
        <TextField label="Phone (optional)" value={tp.phone} onChangeText={setTpField('phone')} placeholder="e.g. 9876543210" keyboardType="phone-pad" maxLength={30} />
        <TextField
          label="E-mail (optional)"
          value={tp.email}
          onChangeText={setTpField('email')}
          placeholder="e.g. ravi@saistudios.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={120}
          hint="If given, they are e-mailed that the asset was assigned to them."
          error={tpEmailOk(tp) ? null : 'That does not look like an e-mail address.'}
        />
        <TextField label="Remarks (optional)" value={tp.note} onChangeText={setTpField('note')} placeholder="e.g. for the shoot, return by 30 Oct" maxLength={300} />
        {tp.name.trim() ? <Banner tone="warning" title="Comments will read" message={tpCommentsLabel(tp) + (a.comments.trim() ? ` · ${a.comments.trim()}` : '')} /> : null}
        {tpTried && tpBad && tp.name.trim().length >= 2 && tpEmailOk(tp) ? <Banner tone="danger" message={tpBad} /> : null}
      </Sheet>

      <ConfirmSheet
        visible={allocating === 'confirm'}
        onClose={() => setAllocating('form')}
        title="Allocate this asset?"
        from={{ title: a.name, subtitle: a.assetId || a.serial || undefined, icon: Icon, module: 'support' }}
        to={{ title: tp.name.trim(), subtitle: tp.org.trim() || 'Third party', icon: Building2, module: 'support' }}
        confirmLabel="Swipe to allocate"
        loading={w.allocate.isPending}
        onConfirm={() =>
          w.allocate.mutate(
            { id: a.id, tp },
            {
              onSuccess: () => {
                const who = tp.name.trim();
                setAllocating(null);
                setDone({ title: 'Asset allocated', subtitle: `${a.name} is with ${who}. Return it from its page when it comes back.` });
              },
              onError: (e) => {
                setAllocating(null);
                fail('allocate it')(e);
              },
            },
          )
        }
        note={tp.email.trim() ? `${firstName(tp.name.trim())} gets an “Asset Assigned” e-mail at ${tp.email.trim()}.` : 'No one is messaged: no e-mail was given.'}>
        <SummaryCard
          rows={[
            { key: 'label', label: 'Comments', value: tpCommentsLabel(tp) + (a.comments.trim() ? ` · ${a.comments.trim()}` : '') },
            ...(tp.phone.trim() ? [{ key: 'tel', label: 'Contact', value: tp.phone.trim() }] : []),
            { key: 'on', label: 'Allocated on', value: dateLabel(today, today) },
          ]}
        />
      </ConfirmSheet>

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
