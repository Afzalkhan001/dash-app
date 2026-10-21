// Post a bounty task — the website's "Create Bounty Task" (dash.html:12911-12992) in three short steps:
//   1. What     title, what to do (both required), category, department, deadline
//   2. Reward   a flat reward or Phase-wise Coins, and how many people can take part — with what I can
//               still fund shown on top (allocated − reserved − spent, never earned coins)
//   3. Rules    what people send (type + how many), who it is for, approval, a reference file / link
// Then a ConfirmSheet (swipe) → POST /bounty_tasks → SuccessSheet. The checks are the website's own;
// the server re-checks them and that I can afford at least one person.

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Paperclip } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { type BountySubmissionType, useBountyDepartments, useBountyWallet } from '@/api/bounty';
import { createBountyTask, type NewTaskInput, useInvalidateBountyAdmin } from '@/api/bountyadmin';
import { useTodayIst } from '@/features/attendance/use-now';
import { asArray, coins, deadlineLabel, profTypeLabel, SUBMISSION_TYPE_LABEL } from '@/features/bounty/logic';
import { CoinsField, PhaseEditor, SwitchRow } from '@/features/bountyadmin/components';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { cheapestPhase, creatorAvailable, digitsOnly, newPhase, type PhaseDraft, phaseLine, phaseProblem } from '@/features/bountyadmin/logic';
import { FileError, pickDocument } from '@/lib/files';
import { space } from '@/theme/tokens';
import {
  AccountRow,
  ActionBar,
  Banner,
  Button,
  ConfirmSheet,
  DateField,
  NavHeader,
  Screen,
  SelectField,
  SuccessSheet,
  SummaryCard,
  Text,
  TextField,
  toast,
} from '@/ui';

const TITLE = 'Post a task';
const STEPS = ['What', 'Reward', 'Rules'] as const;
const TYPES: BountySubmissionType[] = ['text', 'link', 'image', 'video', 'document'];
const COUNTABLE: Record<string, { noun: string; verb: string }> = {
  link: { noun: 'links', verb: 'paste' },
  image: { noun: 'images', verb: 'upload' },
  video: { noun: 'videos', verb: 'upload' },
  document: { noun: 'files', verb: 'upload' },
};
const REF_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/*',
  'video/*',
];

type Form = {
  title: string;
  desc: string;
  category: string;
  deptId: string;
  deadline: string;
  reward: string;
  phaseWiseCoins: boolean;
  phases: PhaseDraft[];
  maxAccepts: string;
  submissionType: BountySubmissionType;
  maxAttachments: string;
  eligibility: string;
  targetProfType: string;
  requiresApproval: boolean;
  referenceFileData: string;
  referenceFileName: string;
  referenceUrl: string;
};

const EMPTY: Form = {
  title: '',
  desc: '',
  category: '',
  deptId: '',
  deadline: '',
  reward: '',
  phaseWiseCoins: false,
  phases: [newPhase(0)],
  maxAccepts: '',
  submissionType: 'text',
  maxAttachments: '1',
  eligibility: '',
  targetProfType: '',
  requiresApproval: true,
  referenceFileData: '',
  referenceFileName: '',
  referenceUrl: '',
};

export default function NewTaskScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.create} ready={ready} title={TITLE}>
      <NewTask />
    </AdminGate>
  );
}

function NewTask() {
  const router = useRouter();
  const qc = useQueryClient();
  const invalidate = useInvalidateBountyAdmin();
  const today = useTodayIst();
  const { user, tenant } = useBountyAdmin();
  const walletQ = useBountyWallet();
  const deptsQ = useBountyDepartments();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setError(null);
  };
  const available = creatorAvailable(walletQ.data);
  const depts = asArray<{ id: string; name: string }>(deptsQ.data);
  const deptName = depts.find((d) => d.id === f.deptId)?.name;
  const profTypes = asArray<{ id?: string; label?: string; active?: boolean }>(tenant?.profTypes).filter((t) => t && t.id && t.active !== false);
  const countable = COUNTABLE[f.submissionType];

  // The website's checks for each step, in its own order (dash.html:12627-12660).
  const stepProblem = (s: number): string | null => {
    if (s === 0) {
      if (!f.title.trim()) return 'Task title is required.';
      if (!f.desc.trim()) return 'Task description is required.';
      return null;
    }
    if (s === 1) {
      if (f.phaseWiseCoins) {
        const p = phaseProblem(f.phases);
        if (p) return p;
        if (cheapestPhase(f.phases) > available) return 'You don’t have enough coins to pay even one person.';
      } else {
        const amt = Math.round(Number(f.reward));
        if (!amt || amt <= 0) return 'Enter a positive reward.';
        if (amt > available) return `You have ${coins(available)} coins to fund tasks.`;
      }
      if (f.maxAccepts !== '') {
        const n = Math.round(Number(f.maxAccepts));
        if (!Number.isFinite(n) || n <= 0) return 'How many can take part must be a positive number, or left blank for no limit.';
      }
      return null;
    }
    if (countable) {
      const n = Math.floor(Number(f.maxAttachments));
      if (!n || n < 1 || n > 10) return `How many ${countable.noun} must be between 1 and 10.`;
    }
    return null;
  };

  const next = () => {
    const p = stepProblem(step);
    if (p) {
      setError(p);
      return;
    }
    setError(null);
    if (step < STEPS.length - 1) setStep(step + 1);
    else setConfirm(true);
  };

  const pickRef = async () => {
    setPicking(true);
    try {
      const file = await pickDocument(REF_TYPES);
      if (file) setF((x) => ({ ...x, referenceFileData: file.dataUrl, referenceFileName: file.name }));
    } catch (e) {
      Alert.alert('Couldn’t add the file', e instanceof FileError || e instanceof Error ? e.message : 'Please try another file.');
    } finally {
      setPicking(false);
    }
  };

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    const body: NewTaskInput = {
      title: f.title.trim(),
      desc: f.desc.trim(),
      category: f.category.trim(),
      deptId: f.deptId,
      deadline: f.deadline,
      reward: f.phaseWiseCoins ? Math.round(Number(f.phases[0]?.coins)) : Math.round(Number(f.reward)),
      eligibility: f.eligibility.trim(),
      targetProfType: f.targetProfType,
      submissionType: f.submissionType,
      requiresApproval: f.requiresApproval,
      maxAccepts: f.maxAccepts === '' ? null : Math.round(Number(f.maxAccepts)),
      maxAttachments: countable ? f.maxAttachments : '1',
      phaseWiseCoins: f.phaseWiseCoins,
      phases: f.phaseWiseCoins ? f.phases : [newPhase(0)],
      referenceFileData: f.referenceFileData,
      referenceFileName: f.referenceFileName,
      referenceUrl: f.referenceUrl.trim(),
    };
    try {
      const t = await createBountyTask(body, user.id);
      await invalidate();
      void qc.invalidateQueries({ queryKey: ['bounty', 'tasks'] });
      setConfirm(false);
      setTimeout(() => setDone(t?.id || ''), 400);
    } catch (e) {
      Alert.alert('Couldn’t post the task', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!walletQ.isLoading && walletQ.data && available <= 0 && !done) {
    // Nothing to fund a task with: say so instead of a form that can't succeed.
    return (
      <Screen header={<NavHeader title={TITLE} />}>
        <Banner tone="warning" title="No coins to fund a task" message="Ask your Super Admin to give you bounty coins, then post the task." />
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const rewardText = f.phaseWiseCoins ? f.phases.map((p) => phaseLine(p)).join('\n') : `${coins(f.reward)} coins each`;

  return (
    <>
      <Screen
        header={<NavHeader title={TITLE} subtitle={`Step ${step + 1} of 3 · ${STEPS[step]}`} />}
        footer={
          <ActionBar note={error}>
            <Button title={step < 2 ? 'Next' : 'Review and post'} onPress={next} />
            {step > 0 ? (
              <Button
                title="Back"
                variant="ghost"
                onPress={() => {
                  setError(null);
                  setStep(step - 1);
                }}
              />
            ) : null}
          </ActionBar>
        }>
        {step === 0 ? (
          <View style={{ gap: space.md }}>
            <TextField label="Task title" value={f.title} onChangeText={(v) => set('title', v)} maxLength={120} placeholder="e.g. Cut a 30-second teaser" />
            <TextField
              label="What to do"
              value={f.desc}
              onChangeText={(v) => set('desc', v)}
              multiline
              maxLength={2000}
              counter
              placeholder="What needs to be done, and what counts as done"
            />
            <TextField label="Category (optional)" value={f.category} onChangeText={(v) => set('category', v)} maxLength={40} placeholder="e.g. Editing, Design" />
            <SelectField
              label="Department"
              value={f.deptId || 'any'}
              options={[{ value: 'any', label: 'Anyone in the company' }, ...depts.map((d) => ({ value: d.id, label: d.name }))]}
              onChange={(v) => set('deptId', v === 'any' ? '' : v)}
              hint={f.deptId ? 'Only this department’s people will see it and can take it.' : 'Everyone can see and take it.'}
            />
            <DateField label="Deadline (optional)" value={f.deadline || null} onChange={(v) => set('deadline', v)} minimumDate={today} />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={{ gap: space.md }}>
            <SummaryCard rows={[{ key: 'av', label: 'You can fund', value: walletQ.isLoading ? '…' : `${coins(available)} coins` }]} />
            <SwitchRow
              title="Phase-wise coins"
              subtitle={f.phaseWiseCoins ? 'Different rewards by joining order (first 50 get one amount, the next 50 another…).' : 'Off: everyone who takes part gets the same reward.'}
              value={f.phaseWiseCoins}
              onChange={(v) => set('phaseWiseCoins', v)}
            />
            {f.phaseWiseCoins ? (
              <PhaseEditor phases={f.phases} onChange={(p) => set('phases', p)} />
            ) : (
              <CoinsField label="Reward for each person" value={f.reward} onChange={(v) => set('reward', v)} />
            )}
            <TextField
              label="How many people can take part (optional)"
              value={f.maxAccepts}
              onChangeText={(v) => set('maxAccepts', digitsOnly(v))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="No limit"
              hint={f.maxAccepts ? `The task closes to new people once ${f.maxAccepts} have taken part.` : 'Each person can take part once.'}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: space.md }}>
            <SelectField
              label="What people send"
              value={f.submissionType}
              options={TYPES.map((t) => ({ value: t, label: SUBMISSION_TYPE_LABEL[t] }))}
              onChange={(v) => set('submissionType', v)}
            />
            {countable ? (
              <TextField
                label={`How many ${countable.noun} may each person ${countable.verb}?`}
                value={f.maxAttachments}
                onChangeText={(v) => set('maxAttachments', digitsOnly(v).slice(0, 2))}
                keyboardType="number-pad"
                inputMode="numeric"
                hint="Between 1 and 10."
              />
            ) : null}
            <TextField label="Who can do it (optional)" value={f.eligibility} onChangeText={(v) => set('eligibility', v)} maxLength={120} placeholder="e.g. Editors only" />
            {profTypes.length ? (
              <SelectField
                label="Only for one kind of professional (optional)"
                value={f.targetProfType || 'none'}
                options={[{ value: 'none', label: 'Everyone' }, ...profTypes.map((t) => ({ value: String(t.id), label: `${profTypeLabel(String(t.id), tenant)} only` }))]}
                onChange={(v) => set('targetProfType', v === 'none' ? '' : v)}
              />
            ) : null}
            <SwitchRow
              title="Check work before paying"
              subtitle={f.requiresApproval ? 'You check each piece of work before coins are paid.' : 'Coins are paid the moment someone sends their work. No check.'}
              value={f.requiresApproval}
              onChange={(v) => set('requiresApproval', v)}
            />
            <Text variant="labelStrong" muted>
              Reference (optional)
            </Text>
            {f.referenceFileName ? (
              <AccountRow
                icon={Paperclip}
                module="bounty"
                title="Reference file"
                sub={f.referenceFileName}
                actionLabel="Remove"
                onPress={() => setF((x) => ({ ...x, referenceFileData: '', referenceFileName: '' }))}
                accessibilityLabel={`Remove reference file ${f.referenceFileName}`}
              />
            ) : (
              <Button title={picking ? 'Opening…' : 'Add a file'} variant="ghost" icon={<Paperclip />} loading={picking} onPress={() => void pickRef()} />
            )}
            <TextField
              label="Reference link"
              value={f.referenceUrl}
              onChangeText={(v) => set('referenceUrl', v)}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https:// Drive folder, video, website…"
            />
          </View>
        ) : null}
      </Screen>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Post this task?"
        subtitle={f.title.trim()}
        confirmLabel="Swipe to post task"
        onConfirm={() => void submit()}
        loading={saving}
        note={
          deptName
            ? `Only ${deptName} sees it on Bounty rewards. No message is sent.`
            : 'Everyone in the company sees it on Bounty rewards. No message is sent; use Remind later.'
        }>
        <SummaryCard
          rows={[
            { key: 'reward', label: f.phaseWiseCoins ? 'Reward by order' : 'Reward', value: rewardText },
            { key: 'spots', label: 'People', value: f.maxAccepts ? `Up to ${f.maxAccepts}` : 'No limit' },
            { key: 'due', label: 'Deadline', value: f.deadline ? deadlineLabel(f.deadline, today) : 'None' },
            { key: 'send', label: 'They send', value: `${SUBMISSION_TYPE_LABEL[f.submissionType]}${countable && Number(f.maxAttachments) > 1 ? ` · up to ${f.maxAttachments}` : ''}` },
            { key: 'check', label: 'Paying', value: f.requiresApproval ? 'After you check the work' : 'At once, no check' },
            { key: 'for', label: 'For', value: deptName || 'Everyone' },
          ]}
        />
      </ConfirmSheet>

      <SuccessSheet
        visible={done !== null}
        onClose={() => router.back()}
        title="Task posted"
        subtitle="Coins are held from your funds only when someone takes it."
        primaryLabel="Done"
        onPrimary={() => router.back()}
        secondaryLabel={done ? 'Open task' : undefined}
        onSecondary={
          done
            ? () => {
                toast.show('Task posted', 'success');
                router.replace(`/admin/bounty/tasks/${encodeURIComponent(done)}`);
              }
            : undefined
        }
      />
    </>
  );
}
