// The four Support forms (web: SupportView's Raise Ticket / Request Asset / Admin Requests →
// Requests & Complaints). Each builds the same record the website posts to /tickets — the raiser's
// name, email, id, phone and department name are attached exactly as submitTicket() & co. do.
//
// useRequestForm() holds the state and the flow: `review()` (the screen's sticky bar, enabled once the
// required fields are in) builds the record and opens the ConfirmSheet; `send()` (its swipe) posts that
// very record. <RequestFields> draws the fields (single column, required first): PillFields for short
// text, multiline fields for the longer note, the project code as a Payno AccountRow. `note` is what
// is still missing, or — once it can be sent — where the request goes. A server error is an Alert over
// the confirm sheet, so the swipe can be tried again.

import { Hash, PenLine } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useMyProfile } from '@/api/me';
import { type Project, useProjects } from '@/api/reimbursements';
import { type ConfigItem, type Ticket, type TicketCategory, useCreateTicket, useDepartments, useSupportConfig } from '@/api/support';
import { useSession } from '@/auth/session';
import { ProjectPicker } from '@/features/reimbursements/project-picker';
import { ASSET_TYPES, priorityLabel, PRIORITIES, subjectLabel, TICKET_TYPES, typeLabel, URGENCIES } from '@/features/support/format';
import { todayIst } from '@/lib/dates';
import { space } from '@/theme/tokens';
import { haptic, PillField, SectionHeader, SelectField, type SummaryItem, TextField, useLayout } from '@/ui';

import { themedStyles } from '@/theme/themed';

export type RequestKind = TicketCategory;

// Common raiser fields, as the web attaches them to every request.
function useRaiser() {
  const user = useSession((s) => s.user);
  const profile = useMyProfile();
  const departments = useDepartments();
  return () => {
    const me = (profile.data ?? user ?? {}) as Record<string, any>;
    const phone = me.mobile || me.phone || me.data?.mobile || me.data?.phone || '';
    const depts = Array.isArray(departments.data) ? departments.data : [];
    const deptName = me.deptName || depts.find((d) => d && d.id === me.dept)?.name || '';
    return {
      date: todayIst(),
      from: user?.name || '',
      raisedByName: user?.name || '',
      fromEmail: user?.email || '',
      fromId: user?.id || '',
      raisedById: user?.id || '',
      fromPhone: phone,
      dept: deptName,
    };
  };
}

const kekaOf = (p: Project | null) => (p ? p.kekaCode || p.name || '' : '');

const qty = (v: string) => Math.max(1, parseInt(v, 10) || 1);

// One state bag for all four forms; only the fields of the chosen kind are sent.
const BLANK = {
  type: 'technical',
  priority: 'medium',
  subject: '',
  desc: '',
  assetType: '',
  itemType: '',
  complaintType: '',
  quantity: '1',
  urgency: 'normal',
  reason: '',
};
type Fields = typeof BLANK;

// Where the request goes — shown above the button once it can be sent.
export const WHERE: Record<RequestKind, string> = {
  ticket: 'Goes to IT Admin.',
  asset: 'Goes to Admin for approval.',
  admin_request: 'Goes straight to Admin.',
  complaint: 'Goes to Admin.',
};

// Who handles it (the "to" card of the confirm sheet).
export const HANDLER: Record<RequestKind, { title: string; subtitle: string }> = {
  ticket: { title: 'IT Admin', subtitle: 'Fixes it' },
  asset: { title: 'Admin', subtitle: 'Approves it' },
  admin_request: { title: 'Admin', subtitle: 'Arranges it' },
  complaint: { title: 'Admin', subtitle: 'Looks into it' },
};

const SEND: Record<RequestKind, string> = {
  ticket: 'Send request',
  asset: 'Send request',
  admin_request: 'Send request',
  complaint: 'Send complaint',
};

// What is still missing before the request can be sent (the same checks that enable the button).
function missingFor(kind: RequestKind, f: Fields, keka: string) {
  const need: (string | false)[] =
    kind === 'ticket'
      ? [!f.subject.trim() && 'a subject', !keka && 'a project code']
      : kind === 'asset'
        ? [!f.assetType && 'the equipment', !keka && 'a project code']
        : kind === 'admin_request'
          ? [!f.itemType && 'an item', !keka && 'a project code']
          : [!f.complaintType && 'a complaint type', !f.subject.trim() && 'a subject'];
  return need.filter((x): x is string => !!x);
}

const optionsOf = (rows: ConfigItem[], listType: string) =>
  rows.filter((c) => c.listType === listType && typeof c.label === 'string' && c.label.trim()).map((c) => ({ value: c.label, label: c.label }));

export function useRequestForm(kind: RequestKind, onDone: (kind: RequestKind, record: Ticket) => void) {
  const raiser = useRaiser();
  const create = useCreateTicket();
  const projects = useProjects(kind !== 'complaint');
  const config = useSupportConfig(kind === 'admin_request' || kind === 'complaint');
  const [f, setF] = useState<Fields>(BLANK);
  const [project, setProject] = useState<Project | null>(null);
  // The record the confirm sheet shows and the swipe sends (built when the sheet opens).
  const [pending, setPending] = useState<Ticket | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const set = (patch: Partial<Fields>) => setF((x) => ({ ...x, ...patch }));
  const reset = () => {
    setF(BLANK);
    setProject(null);
  };

  const configRows = (Array.isArray(config.data) ? config.data : []).filter((c): c is ConfigItem => !!c && typeof c === 'object');
  const adminItems = optionsOf(configRows, 'admin_item');
  const complaintTypes = optionsOf(configRows, 'complaint_type');

  const keka = kekaOf(project);
  const missing = missingFor(kind, f, keka);
  const ready = !missing.length;
  const blocker = ready ? null : `Add ${missing.join(' and ')} to send.`;

  /** The exact record the website posts for this kind. */
  const build = (): Ticket => {
    const base = { id: 'tk' + Date.now(), category: kind, ...raiser() };
    if (kind === 'ticket') return { ...base, type: f.type, subject: f.subject, desc: f.desc, priority: f.priority, status: 'open', kekaCode: keka };
    if (kind === 'asset') {
      return { ...base, assetType: f.assetType, quantity: qty(f.quantity), urgency: f.urgency, reason: f.reason, status: 'pending_approval', kekaCode: keka };
    }
    if (kind === 'admin_request') {
      return { ...base, itemType: f.itemType, quantity: qty(f.quantity), urgency: f.urgency, reason: f.reason, status: 'open', kekaCode: keka };
    }
    return { ...base, type: f.complaintType, subject: f.subject, desc: f.desc, status: 'open' };
  };

  /** "Review request": the confirm sheet with what will be sent. */
  const review = () => {
    if (!ready || create.isPending) return;
    setPending(build());
    setConfirmOpen(true);
  };

  /** The swipe: post the reviewed record. */
  const send = () => {
    if (!pending || create.isPending) return;
    const record = pending;
    create.mutate(record, {
      onSuccess: (r) => {
        reset();
        setConfirmOpen(false);
        onDone(kind, { ...record, ...(r && typeof r === 'object' && r.t && typeof r.t === 'object' ? r.t : {}) });
      },
      onError: (e) => {
        haptic.error();
        Alert.alert('Couldn’t send your request', e.message || 'Try again.');
      },
    });
  };

  return {
    f,
    set,
    project,
    setProject,
    projects,
    config,
    adminItems,
    complaintTypes,
    ready,
    blocker,
    note: blocker ?? WHERE[kind],
    busy: create.isPending,
    review,
    send,
    pending,
    confirmOpen,
    closeConfirm: () => {
      if (!create.isPending) setConfirmOpen(false);
    },
    reset,
    sendLabel: SEND[kind],
  };
}

export type RequestFormState = ReturnType<typeof useRequestForm>;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** What a request says, as SummaryCard rows (the confirm sheet). Empty values are left out. */
export function requestSummary(t: Ticket): SummaryItem[] {
  const isItem = t.category === 'asset' || t.category === 'admin_request';
  const rows: SummaryItem[] = isItem
    ? [
        { key: 'item', label: t.category === 'asset' ? 'Equipment' : 'Item', value: subjectLabel(t) },
        { key: 'urgency', label: 'Urgency', value: priorityLabel(t) },
        { key: 'code', label: 'Project code', value: text(t.kekaCode) },
        { key: 'why', label: 'Why', value: text(t.reason) },
      ]
    : [
        { key: 'subject', label: 'Subject', value: text(t.subject) },
        { key: 'type', label: 'Type', value: typeLabel(t) },
        ...(t.category === 'ticket'
          ? [
              { key: 'priority', label: 'Priority', value: priorityLabel(t) },
              { key: 'code', label: 'Project code', value: text(t.kekaCode) },
            ]
          : []),
        { key: 'details', label: 'Details', value: text(t.desc) },
      ];
  return rows.filter((r) => r.value != null && r.value !== '' && r.value !== '—');
}

/** The fields of one request kind: single column, required fields first. */
export function RequestFields({ kind, form }: { kind: RequestKind; form: RequestFormState }) {
  const { gap } = useLayout();
  const { f, set, config } = form;

  const projectPicker = (
    <ProjectPicker
      label="Project code *"
      placeholder="Search project code or name…"
      value={form.project}
      onChange={form.setProject}
      projects={Array.isArray(form.projects.data) ? form.projects.data : undefined}
      loading={form.projects.isLoading}
      variant="row"
      module="support"
    />
  );
  // Helper line under the Admin-configured lists (items, complaint types).
  const listHint = (count: number) =>
    config.isLoading || count ? null : config.isError ? 'Couldn’t load the list. Go back and try again.' : 'Nothing set up yet. Ask Admin to add some.';
  const quantity = (
    <PillField
      icon={Hash}
      label="Quantity"
      value={f.quantity}
      onChangeText={(v) => set({ quantity: v.replace(/\D/g, '').slice(0, 4) })}
      keyboardType="number-pad"
    />
  );
  const urgency = <SelectField label="Urgency" value={f.urgency} options={URGENCIES} onChange={(v) => set({ urgency: v })} />;
  const reason = (
    <TextField label="Why do you need it?" value={f.reason} onChangeText={(v) => set({ reason: v })} placeholder="A line or two helps Admin decide" multiline />
  );
  const subject = (placeholder: string) => (
    <PillField icon={PenLine} label="Subject *" value={f.subject} onChangeText={(v) => set({ subject: v })} placeholder={placeholder} />
  );

  return (
    <View style={{ gap }}>
      <SectionHeader title="Details" />
      {kind === 'ticket' ? (
        <View style={styles.fields}>
          {subject('What do you need help with?')}
          {projectPicker}
          <TextField label="Details" value={f.desc} onChangeText={(v) => set({ desc: v })} placeholder="What happened, and when?" multiline />
          <SelectField label="Type" value={f.type} options={TICKET_TYPES} onChange={(v) => set({ type: v })} />
          <SelectField label="Priority" value={f.priority} options={PRIORITIES} onChange={(v) => set({ priority: v })} />
        </View>
      ) : kind === 'asset' ? (
        <View style={styles.fields}>
          <SelectField label="Equipment *" value={f.assetType || null} options={ASSET_TYPES} placeholder="Choose equipment" onChange={(v) => set({ assetType: v })} />
          {projectPicker}
          {quantity}
          {urgency}
          {reason}
        </View>
      ) : kind === 'admin_request' ? (
        <View style={styles.fields}>
          <SelectField
            label="Item *"
            value={f.itemType || null}
            options={form.adminItems}
            placeholder={config.isLoading ? 'Loading…' : 'Choose item'}
            onChange={(v) => set({ itemType: v })}
            disabled={config.isLoading}
            hint={listHint(form.adminItems.length)}
          />
          {projectPicker}
          {quantity}
          {urgency}
          {reason}
        </View>
      ) : (
        <View style={styles.fields}>
          <SelectField
            label="Complaint type *"
            value={f.complaintType || null}
            options={form.complaintTypes}
            placeholder={config.isLoading ? 'Loading…' : 'Choose type'}
            onChange={(v) => set({ complaintType: v })}
            disabled={config.isLoading}
            hint={listHint(form.complaintTypes.length)}
          />
          {subject('In a few words')}
          <TextField label="Details" value={f.desc} onChangeText={(v) => set({ desc: v })} placeholder="What happened, and when?" multiline />
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  fields: { gap: space.md },
}));
