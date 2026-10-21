// New expense claim (web: ReimbursementForm), as a Payno "send money" flow:
//   1. the amount first, typed on the NumericKeypad (on its deep wash at the bottom) into a giant
//      AmountEntry — tap the amount again to change it;
//   2. what it was for as four SelectTiles (Food / Fuel / Accommodation / Transportation);
//   3. the bill photo, camera first;
//   4. the project code as an AccountRow with a "Change" pill (the searchable sheet, recent codes first);
//   5. "Review claim" opens the ConfirmSheet (amount → who checks it, the details, Swipe to send claim),
//      and once it is sent a SuccessSheet shows the claim number with "View claim" / "Done".
// Same checks and the same request body as the web (there is no date or description on the web form
// or in the server's record, so none here). Every field is required; problems show under their field,
// a server error as a danger Banner inside the confirm sheet.

import { useRouter } from 'expo-router';
import { ArrowRight, BriefcaseBusiness } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  activeProjects,
  MAX_DATA_URL_CHARS,
  type Project,
  PURPOSE_LABEL,
  type Reimbursement,
  useMyReimbursements,
  useProjects,
  useSubmitReimbursement,
} from '@/api/reimbursements';
import { purposeLabel, reimbursementRef, reimbursementStatus } from '@/features/reimbursements/format';
import { ProjectPicker } from '@/features/reimbursements/project-picker';
import { purposeIcon } from '@/features/reimbursements/purpose-icon';
import { ReceiptPicker } from '@/features/reimbursements/receipt-picker';
import type { PickedFile } from '@/lib/files';
import { inr } from '@/lib/format';
import { space } from '@/theme/tokens';
import {
  ActionBar,
  AmountEntry,
  amountValue,
  Banner,
  Button,
  ConfirmSheet,
  FieldMessage,
  haptic,
  KeypadWash,
  NavHeader,
  NumericKeypad,
  PressableScale,
  Screen,
  SelectTiles,
  SuccessSheet,
  SummaryCard,
  Text,
  useAmountKeypad,
} from '@/ui';

const PURPOSE_OPTIONS = Object.entries(PURPOSE_LABEL).map(([value, label]) => ({ value, label, icon: purposeIcon(value) }));

type FieldErrors = { project?: string; amount?: string; purpose?: string; file?: string };

// The project codes on the person's own claims, newest first (at most 5, active ones only), so the
// usual pick is one tap. The claims come from the list's own query (same key), so nothing new is fetched.
function recentProjects(claims: Reimbursement[] | undefined, projects: Project[] | undefined): Project[] {
  const byId = new Map(activeProjects(projects).map((p) => [String(p.id), p] as const));
  const out: Project[] = [];
  const seen = new Set<string>();
  const newest = [...(Array.isArray(claims) ? claims : [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  for (const c of newest) {
    const id = c.project_id ? String(c.project_id) : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const p = byId.get(id);
    if (p) out.push(p);
    if (out.length >= 5) break;
  }
  return out;
}

export default function NewExpenseClaim() {
  const router = useRouter();
  const projects = useProjects();
  const mine = useMyReimbursements();
  const submit = useSubmitReimbursement();
  const [project, setProject] = useState<Project | null>(null);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState<string | null>(null);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [msg, setMsg] = useState('');
  // The keypad is open on arrival (the amount comes first) and whenever the amount is tapped.
  const [keypad, setKeypad] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<Reimbursement | null>(null);

  const clear = (k: keyof FieldErrors) => {
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const pad = useAmountKeypad(amount, (v) => {
    setAmount(v);
    clear('amount');
  });
  const value = amountValue(amount);

  // The web's checks — every problem is shown under its own field at once — then the confirm sheet.
  const review = () => {
    const next: FieldErrors = {};
    if (!project) next.project = 'Pick a project code.';
    if (!(value > 0)) next.amount = 'Enter the amount.';
    if (!purpose) next.purpose = 'Choose what it was for.';
    if (!file) next.file = 'Add a photo of the bill.';
    else if (String(file.dataUrl || '').length > MAX_DATA_URL_CHARS) next.file = 'That file is too big. Try a smaller one.';
    setErrors(next);
    setMsg('');
    if (Object.values(next).some(Boolean)) {
      haptic.warning();
      if (next.amount) setKeypad(true);
      return;
    }
    setConfirming(true);
  };

  const send = () => {
    if (!project || !purpose || !file || submit.isPending) return;
    setMsg('');
    submit.mutate(
      {
        kekaCode: project.kekaCode || project.name || '',
        projectId: project.id,
        purpose,
        amount: value,
        fileData: file.dataUrl,
        fileName: file.name,
      },
      {
        onSuccess: (r) => {
          haptic.success();
          setConfirming(false);
          // The success sheet rises once the confirm sheet has gone.
          const claim = r.reimbursement ?? ({ id: '', status: 'pending_keka_approval' } as Reimbursement);
          setTimeout(() => setSent(claim), 380);
        },
        onError: (e) => {
          haptic.error();
          setMsg(e.message);
        },
      },
    );
  };

  const owner = project?.costCodeOwner ? String(project.costCodeOwner) : '';
  const projectHint = project
    ? owner
      ? `Project owner: ${owner}`
      : 'No project owner set. Ask HR.'
    : 'Not sure? Ask your manager which project this is for.';
  const recent = recentProjects(mine.data, projects.data);
  const sentTo = sent?.status === 'pending_accounts_approval' ? 'Accounts' : sent?.keka_owner_name || owner || 'the project owner';
  const sentStatus = sent ? reimbursementStatus(sent) : null;

  const footer = keypad ? (
    <KeypadWash fade={56}>
      <View style={{ gap: space.sm }}>
        <NumericKeypad onKey={pad.onKey} decimal={pad.decimal} />
        <Button title={value > 0 ? 'Done' : 'Close keypad'} variant="accent" onPress={() => setKeypad(false)} />
      </View>
    </KeypadWash>
  ) : (
    <ActionBar>
      <Button title="Review claim" icon={<ArrowRight />} onPress={review} />
    </ActionBar>
  );

  return (
    <>
      <Screen header={<NavHeader title="New expense claim" />} footer={footer}>
        <PressableScale
          onPress={() => setKeypad(true)}
          disabled={keypad}
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityLabel={`Amount spent: ${value > 0 ? inr(value) : 'not entered'}`}
          accessibilityHint={keypad ? undefined : 'Opens the keypad to change it'}>
          <AmountEntry
            label="Amount spent"
            value={amount}
            caret={keypad}
            helper={keypad ? 'The total on the bill' : value > 0 ? 'Tap to change' : 'Tap to enter'}
            error={errors.amount}
          />
        </PressableScale>

        <View style={{ gap: space.xs }}>
          <Text variant="labelStrong" muted numberOfLines={1}>
            Spent on
          </Text>
          <SelectTiles
            accessibilityLabel="Spent on"
            options={PURPOSE_OPTIONS}
            value={purpose}
            onChange={(v) => {
              setPurpose(v);
              clear('purpose');
              setKeypad(false);
            }}
          />
          <FieldMessage error={errors.purpose} />
        </View>

        <ReceiptPicker
          label="Bill photo"
          value={file}
          error={errors.file}
          onChange={(f) => {
            setFile(f);
            clear('file');
          }}
        />

        <ProjectPicker
          variant="row"
          label="Project code"
          value={project}
          onChange={(p) => {
            setProject(p);
            clear('project');
          }}
          projects={projects.data}
          loading={projects.isLoading}
          error={errors.project}
          hint={projectHint}
          recent={recent}
        />
      </Screen>

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Send this claim?"
        from={{ title: inr(value), subtitle: purpose ? purposeLabel(purpose) : undefined, icon: purposeIcon(purpose ?? undefined), module: 'expenses' }}
        to={
          owner
            ? { title: owner, subtitle: 'Project owner checks it', avatar: { name: owner } }
            : { title: 'Project owner', subtitle: 'Checks it first', icon: BriefcaseBusiness, module: 'expenses' }
        }
        detailsTitle="Claim details"
        confirmLabel="Swipe to send claim"
        onConfirm={send}
        loading={submit.isPending}
        note="If it’s rejected, you can fix it and send it again.">
        <SummaryCard
          rows={[
            { key: 'for', label: 'Spent on', value: purpose ? purposeLabel(purpose) : null },
            { key: 'code', label: 'Project code', value: project?.kekaCode || project?.name || null, hint: project?.kekaCode ? project.name || null : null },
            { key: 'bill', label: 'Bill', value: file ? (String(file.type || '').startsWith('image/') ? 'Photo added' : file.name || 'PDF added') : null },
          ]}
          total={{ label: 'Amount', value: inr(value) }}
        />
        {msg ? <Banner tone="danger" title="Couldn’t send" message={msg} /> : null}
      </ConfirmSheet>

      <SuccessSheet
        visible={!!sent}
        onClose={() => router.back()}
        title="Claim sent"
        subtitle={`Sent to ${sentTo} to approve.`}
        secondaryLabel={sent?.id ? 'View claim' : undefined}
        onSecondary={() => {
          if (sent?.id) router.replace(`/reimbursements/${encodeURIComponent(sent.id)}`);
        }}
        onPrimary={() => router.back()}>
        <SummaryCard
          hideEmpty
          rows={[
            { key: 'ref', label: 'Claim number', value: sent?.id ? reimbursementRef(sent) : null },
            { key: 'for', label: 'Spent on', value: purpose ? purposeLabel(purpose) : null },
            { key: 'amount', label: 'Amount', value: inr(value) },
            { key: 'status', label: 'Status', value: sentStatus?.label ?? null, status: sentStatus?.tone ?? null },
          ]}
        />
      </SuccessSheet>
    </>
  );
}
