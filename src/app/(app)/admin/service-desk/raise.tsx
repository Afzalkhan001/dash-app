// Raise for someone (web: ITTaskOnBehalf, dash.html:6842–6987) — the IT Admin raises an IT ticket or an
// equipment request on a colleague's behalf; it appears in that person's own help requests.
//
// SelectTiles (IT help · Equipment) → who it is for (an AccountRow that opens the person picker:
// everyone except master_admin / announcement_viewer, plus people invited who haven't signed up yet,
// marked "Not signed up yet") → the form (the web's fields; the project code is required) → "Review"
// in the sticky bar → ConfirmSheet (them → who handles it, what will be sent, who is told) → swipe →
// SuccessSheet. "Raised by you" lists what this person raised for others (raisedOnBehalfById).
//
//   POST /tickets { id, category, …, status: 'open' | 'pending_approval', date, createdAt, kekaCode,
//                   from, raisedByName, fromEmail, fromId, raisedById, fromPhone, dept,
//                   raisedOnBehalfBy, raisedOnBehalfById }   (identityFor, dash.html:6862)

import { Redirect, useRouter } from 'expo-router';
import { Hash, PenLine, Send, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { Project } from '@/api/reimbursements';
import { useProjects } from '@/api/reimbursements';
import { type DeskTicket, useRaiseForSomeone, useWhitelist } from '@/api/servicedesk';
import { useDepartments } from '@/api/support';
import { useTodayIst } from '@/features/attendance/use-now';
import { canRaiseForSomeone, NON_PERSON_ROLES } from '@/features/servicedesk/access';
import { firstName, raiserOf, refOf, whatOf, whenOf } from '@/features/servicedesk/format';
import { DeskRow } from '@/features/servicedesk/desk-row';
import { useDesk } from '@/features/servicedesk/use-desk';
import { type PickPerson, PersonPicker, usePickablePeople } from '@/features/shared/person-picker';
import { ProjectPicker } from '@/features/shared/project-picker';
import { ASSET_TYPES, CATEGORY, PRIORITIES, raisedShort, ticketStatus, TICKET_TYPES, URGENCIES } from '@/features/support/format';
import { todayIst } from '@/lib/dates';
import { useAccess } from '@/lib/use-access';
import { space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Banner,
  ActivityList,
  Button,
  ConfirmSheet,
  haptic,
  NavHeader,
  PillField,
  Screen,
  SectionHeader,
  SelectField,
  SelectTiles,
  SuccessSheet,
  SummaryCard,
  type SummaryItem,
  TextField,
} from '@/ui';

import { themedStyles } from '@/theme/themed';

type Kind = 'ticket' | 'asset';
const SHEET_SWAP_MS = 400;
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** "a, b and c" */
const listWords = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');

const BLANK = { type: 'technical', priority: 'medium', subject: '', desc: '', assetType: '', quantity: '1', urgency: 'normal', reason: '' };

/** Signed-up people (dash.html:6859) + invited people not signed up yet (6861), as picker rows. */
function candidates(users: PickPerson[] | undefined, wl: ReturnType<typeof useWhitelist>['data'], deptNameOf: (id: string) => string): PickPerson[] {
  const signed = (Array.isArray(users) ? users : []).filter((u) => !NON_PERSON_ROLES.includes(String(u.role)) && (u.name || s(u.extra?.email)));
  const emails = new Set(signed.map((u) => s(u.extra?.email).toLowerCase()).filter(Boolean));
  const invited: PickPerson[] = (Array.isArray(wl) ? wl : [])
    .filter((w) => !NON_PERSON_ROLES.includes(String(w.role)) && (w.name || w.email) && !emails.has(String(w.email || '').toLowerCase()))
    .map((w) => ({
      id: `wl_${w.id}`,
      name: w.name || w.email || '',
      role: w.role,
      jobTitle: 'Not signed up yet',
      // An invitation stores the department id; the picker shows its name.
      dept: w.deptName || deptNameOf(s(w.dept)) || w.dept,
      extra: { email: w.email, mobile: w.mobile || w.phone || '', dept: w.dept, deptName: w.deptName, notSignedUp: true },
    }));
  return [...signed, ...invited].sort((a, b) => a.name.localeCompare(b.name));
}

export default function RaiseForSomeoneScreen() {
  const router = useRouter();
  const access = useAccess();
  const me = access.user;
  const allowed = !!me && canRaiseForSomeone(me.role, access.web('tasks'));
  const today = useTodayIst();

  const users = usePickablePeople({ enabled: allowed, keep: ['email', 'mobile', 'phone', 'dept', 'deptName'] });
  const wl = useWhitelist(allowed);
  const departments = useDepartments(allowed);
  const projects = useProjects(allowed);
  const desk = useDesk({ enabled: allowed });
  const raise = useRaiseForSomeone();

  const [kind, setKind] = useState<Kind>('ticket');
  const [f, setF] = useState(BLANK);
  const [person, setPerson] = useState<PickPerson | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<DeskTicket | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sent, setSent] = useState<DeskTicket | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  if (me && !allowed) return <Redirect href="/" />;

  const set = (patch: Partial<typeof BLANK>) => setF((x) => ({ ...x, ...patch }));
  const keka = project ? project.kekaCode || project.name || '' : '';
  const missing = [
    !person && 'who it’s for',
    kind === 'ticket' ? !f.subject.trim() && 'a subject' : !f.assetType && 'the equipment',
    !keka && 'a project code',
  ].filter((x): x is string => !!x);
  const ready = !missing.length;
  const people = candidates(users.data, wl.data, (id) => (id && Array.isArray(departments.data) ? departments.data.find((d) => d.id === id)?.name || '' : ''));
  const notSignedUp = !!person?.extra?.notSignedUp;

  /** dash.html:6862 identityFor — the person's details, and who raised it for them. */
  const identity = (p: PickPerson) => {
    const deptId = s(p.extra?.dept);
    const deptName = s(p.extra?.deptName) || (Array.isArray(departments.data) ? departments.data.find((d) => d.id === deptId)?.name : '') || '';
    const phone = s(p.extra?.mobile) || s(p.extra?.phone);
    return {
      from: p.name,
      raisedByName: p.name,
      fromEmail: s(p.extra?.email),
      fromId: p.id,
      raisedById: p.id,
      fromPhone: phone,
      dept: deptName,
      raisedOnBehalfBy: me?.name || '',
      raisedOnBehalfById: me?.id || '',
    };
  };

  const build = (p: PickPerson): DeskTicket => {
    const base = { id: `tk${Date.now()}`, date: todayIst(), createdAt: new Date().toISOString(), kekaCode: keka, ...identity(p) };
    if (kind === 'ticket') return { ...base, category: 'ticket', type: f.type, subject: f.subject.trim(), desc: f.desc.trim(), priority: f.priority, status: 'open' };
    return {
      ...base,
      category: 'asset',
      assetType: f.assetType,
      quantity: Math.max(1, parseInt(f.quantity, 10) || 1),
      urgency: f.urgency,
      reason: f.reason.trim(),
      status: 'pending_approval',
    };
  };

  const review = () => {
    if (!ready || !person || raise.isPending) return;
    setPending(build(person));
    setConfirmOpen(true);
  };

  const send = () => {
    if (!pending || raise.isPending) return;
    const record = pending;
    raise.mutate(record, {
      onSuccess: (r) => {
        haptic.success();
        setConfirmOpen(false);
        setSent({ ...record, ...(r && typeof r === 'object' && r.t && typeof r.t === 'object' ? r.t : {}) });
        setTimeout(() => setDoneOpen(true), SHEET_SWAP_MS);
        setF(BLANK);
        setProject(null);
        setPerson(null);
      },
      onError: (e) => {
        haptic.error();
        Alert.alert('Couldn’t raise it', e.message || 'Try again.');
      },
    });
  };

  const summary = (t: DeskTicket): SummaryItem[] =>
    (t.category === 'asset'
      ? [
          { key: 'item', label: 'Equipment', value: whatOf(t) },
          { key: 'urgency', label: 'Urgency', value: URGENCIES.find((u) => u.value === t.urgency)?.label },
          { key: 'code', label: 'Project code', value: s(t.kekaCode) },
          { key: 'why', label: 'Why', value: s(t.reason) },
        ]
      : [
          { key: 'subject', label: 'Subject', value: s(t.subject) },
          { key: 'type', label: 'Type', value: TICKET_TYPES.find((x) => x.value === t.type)?.label },
          { key: 'priority', label: 'Priority', value: PRIORITIES.find((x) => x.value === t.priority)?.label },
          { key: 'code', label: 'Project code', value: s(t.kekaCode) },
          { key: 'details', label: 'Details', value: s(t.desc) },
        ]
    ).filter((r) => !!r.value);

  const mine = desk.all.filter((t) => !!me?.id && t.raisedOnBehalfById === me.id).sort((a, b) => (whenOf(a) < whenOf(b) ? 1 : -1));
  const inSlice = new Set(desk.items.map((t) => t.id));
  const pendingKind: Kind = pending?.category === 'asset' ? 'asset' : 'ticket';
  const who = pending ? raiserOf(pending) : '';
  const told =
    pendingKind === 'asset'
      ? 'Super Admin is told it needs approval.'
      : 'IT Admins are told.';
  const pendingInvited = !!pending && String(pending.fromId || '').startsWith('wl_');
  const confirmNote = pendingInvited
    ? `${firstName(who)} isn’t signed up yet, so gets no message. ${told}`
    : `${firstName(who)} gets a confirmation by email and WhatsApp. ${told}`;

  const projectPicker = (
    <ProjectPicker
      label="Project code *"
      placeholder="Search project code or name…"
      value={project}
      onChange={setProject}
      projects={Array.isArray(projects.data) ? projects.data : undefined}
      loading={projects.isLoading}
      variant="row"
      module="support"
    />
  );

  return (
    <Screen
      header={<NavHeader title="Raise for someone" />}
      footer={
        <ActionBar note={ready ? 'It shows in their own help requests.' : `Add ${listWords(missing)} to send.`}>
          <Button title="Review" icon={<Send />} disabled={!ready} loading={raise.isPending} onPress={review} />
        </ActionBar>
      }>
      <View style={styles.block}>
        <SectionHeader title="What is it?" />
        <SelectTiles<Kind>
          accessibilityLabel="Kind of request"
          value={kind}
          onChange={(k) => {
            if (raise.isPending) return;
            setKind(k);
          }}
          options={(['ticket', 'asset'] as const).map((k) => ({ value: k, label: CATEGORY[k]!.label, icon: CATEGORY[k]!.icon }))}
        />
      </View>

      <View style={styles.block}>
        <SectionHeader title="For" />
        <AccountRow
          icon={UserRound}
          module="support"
          title={person?.name ?? 'Choose a person'}
          sub={person ? (notSignedUp ? person.dept || 'Invited' : [person.jobTitle, person.dept].filter(Boolean).join(' · ')) || 'Chosen' : 'Anyone in the company'}
          actionLabel={person ? 'Change' : 'Choose'}
          onChange={() => setPicking(true)}
          onPress={() => setPicking(true)}
          accessibilityLabel={person ? `For ${person.name}` : 'Choose who it is for'}
        />
        {notSignedUp ? <Banner tone="warning" title="Not signed up yet" message="It shows in their help requests once they sign in." /> : null}
      </View>

      <View style={styles.block}>
        <SectionHeader title="About the request" />
        {kind === 'ticket' ? (
          <View style={styles.fields}>
            <PillField icon={PenLine} label="Subject *" value={f.subject} onChangeText={(v) => set({ subject: v })} placeholder="What needs fixing?" />
            {projectPicker}
            <TextField label="Details" value={f.desc} onChangeText={(v) => set({ desc: v })} placeholder="What happened, and when?" multiline />
            <SelectField label="Type" value={f.type} options={TICKET_TYPES} onChange={(v) => set({ type: v })} />
            <SelectField label="Priority" value={f.priority} options={PRIORITIES} onChange={(v) => set({ priority: v })} />
          </View>
        ) : (
          <View style={styles.fields}>
            <SelectField label="Equipment *" value={f.assetType || null} options={ASSET_TYPES} placeholder="Choose equipment" onChange={(v) => set({ assetType: v })} />
            {projectPicker}
            <PillField
              icon={Hash}
              label="Quantity"
              value={f.quantity}
              onChangeText={(v) => set({ quantity: v.replace(/\D/g, '').slice(0, 4) })}
              keyboardType="number-pad"
            />
            <SelectField label="Urgency" value={f.urgency} options={URGENCIES} onChange={(v) => set({ urgency: v })} />
            <TextField label="Why do they need it?" value={f.reason} onChangeText={(v) => set({ reason: v })} placeholder="A line or two helps the approver" multiline />
          </View>
        )}
      </View>

      <ActivityList title="Raised by you" loading={!desk.tickets.data && !desk.tickets.isError}>
        {mine.slice(0, 10).map((t) => (
          <DeskRow
            key={t.id}
            t={t}
            note={`Raised ${raisedShort(t, today)} · ${refOf(t)}`}
            // Equipment still waiting for approval is outside an IT Admin's desk unless they approve
            // (dash.html:21163), so the request screen would say "not found": list it, don't open it.
            onPress={inSlice.has(t.id) ? () => router.push(`/admin/service-desk/${encodeURIComponent(t.id)}`) : undefined}
          />
        ))}
      </ActivityList>

      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Who is it for?"
        people={people}
        loading={users.isPending}
        allowOnLeave
        recentKey="servicedesk.raise"
        selectedId={person?.id}
        onPick={setPerson}
      />

      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => {
          if (!raise.isPending) setConfirmOpen(false);
        }}
        title={`Raise this for ${firstName(who)}?`}
        from={{ title: who, subtitle: pendingKind === 'asset' ? 'Needs it' : 'Has the problem', avatar: { name: who } }}
        to={
          pendingKind === 'asset'
            ? { title: 'Approver', subtitle: 'IT & Admin approves it', icon: CATEGORY.asset!.icon, module: 'support' }
            : { title: 'IT Admin', subtitle: 'Picks it up', icon: CATEGORY.ticket!.icon, module: 'support' }
        }
        detailsTitle={CATEGORY[pendingKind]!.label}
        confirmLabel="Swipe to raise it"
        onConfirm={send}
        loading={raise.isPending}
        note={confirmNote}>
        {pending ? <SummaryCard rows={summary(pending)} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={doneOpen && !!sent}
        onClose={() => setDoneOpen(false)}
        title={sent ? `Raised for ${raiserOf(sent)}` : 'Raised'}
        subtitle="It shows in their help requests and on the service desk."
        secondaryLabel="Raise another"
        onSecondary={() => setDoneOpen(false)}
        primaryLabel="Done"
        onPrimary={() => {
          setDoneOpen(false);
          if (router.canGoBack()) router.back();
          else router.replace('/admin/service-desk');
        }}>
        {sent ? (
          <SummaryCard
            rows={[
              { key: 'ref', label: 'Reference', value: refOf(sent) },
              { key: 'what', label: 'Request', value: whatOf(sent) },
              { key: 'status', label: 'Status', value: ticketStatus(sent.status).label, status: ticketStatus(sent.status).tone },
            ]}
          />
        ) : null}
      </SuccessSheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  block: { gap: space.sm },
  fields: { gap: space.md },
}));
