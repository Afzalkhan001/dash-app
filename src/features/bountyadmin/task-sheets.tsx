// The Manage sheets of one bounty task (dash.html BountyTasksBoard): change the reward (:12769, with
// the website's top-up warning), extend the deadline (:12738), remind (:12578: preview counts, then
// send — WhatsApp and email to real people), and cancel (:12811). Each saves through the server's own
// route and hands back the updated task.

import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { BountyTask } from '@/api/bounty';
import {
  cancelBountyTask,
  editBountyReward,
  editBountyTask,
  fetchRemindPreview,
  type RemindPreview,
  sendRemind,
  useInvalidateBountyAdmin,
} from '@/api/bountyadmin';
import { coins, deadlineLabel, num } from '@/features/bounty/logic';
import { space } from '@/theme/tokens';
import { Banner, Button, ConfirmSheet, DateField, Sheet, SummaryCard, Text, TextField, toast } from '@/ui';

import { CoinsField, PhaseEditor, SwitchRow } from './components';
import { type PhaseDraft, phaseDrafts, phaseProblem } from './logic';

const problem = (e: unknown) => (e instanceof Error && e.message) || 'Please try again.';

// ── Change reward ────────────────────────────────────────────────────────────
export function RewardSheet({ task, visible, onClose }: { task: BountyTask; visible: boolean; onClose: () => void }) {
  const invalidate = useInvalidateBountyAdmin();
  const [phaseWise, setPhaseWise] = useState(!!task.phaseWiseCoins);
  const [reward, setReward] = useState(String(task.reward ?? ''));
  const [phases, setPhases] = useState<PhaseDraft[]>(() => phaseDrafts(task));
  const [saving, setSaving] = useState(false);
  // Fresh values each time the sheet opens (adjusted during render, not in an effect).
  const [was, setWas] = useState(visible);
  if (visible !== was) {
    setWas(visible);
    if (visible) {
      setPhaseWise(!!task.phaseWiseCoins);
      setReward(String(task.reward ?? ''));
      setPhases(phaseDrafts(task));
    }
  }
  const paid = (Array.isArray(task.claims) ? task.claims : []).filter((c) => c?.status === 'completed').length;
  const err = phaseWise ? phaseProblem(phases) : Math.round(Number(reward)) > 0 ? null : 'Enter a positive reward.';

  const save = async () => {
    if (err) return;
    setSaving(true);
    try {
      await editBountyReward(task.id, phaseWise ? { phaseWiseCoins: true, phases } : { phaseWiseCoins: false, reward: Math.round(Number(reward)) });
      await invalidate();
      onClose();
      toast.show('Reward changed', 'success');
    } catch (e) {
      Alert.alert('Couldn’t change the reward', problem(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      title="Change the reward"
      subtitle={task.title}
      confirmLabel="Swipe to change reward"
      onConfirm={() => void save()}
      loading={saving}
      disabled={!!err}
      note={err ?? 'Coins move as soon as you swipe. No message is sent.'}>
      <View style={{ gap: space.md }}>
        <Banner
          tone="warning"
          title="This moves real coins"
          message={`Raise it and the ${paid ? `${paid} ${paid === 1 ? 'person' : 'people'} already paid get` : 'people already paid get'} the difference at once. Lower it and nobody gives coins back. Work still waiting keeps the reward it was taken at.`}
        />
        <SwitchRow title="Phase-wise coins" subtitle="Different rewards by joining order." value={phaseWise} onChange={setPhaseWise} />
        {phaseWise ? <PhaseEditor phases={phases} onChange={setPhases} /> : <CoinsField label="Reward for each person" value={reward} onChange={setReward} />}
      </View>
    </ConfirmSheet>
  );
}

// ── Extend deadline ──────────────────────────────────────────────────────────
export function ExtendSheet({ task, visible, onClose, today }: { task: BountyTask; visible: boolean; onClose: () => void; today: string }) {
  const invalidate = useInvalidateBountyAdmin();
  const current = task.deadline || '';
  const [next, setNext] = useState(current);
  const [saving, setSaving] = useState(false);
  const [was, setWas] = useState(visible);
  if (visible !== was) {
    setWas(visible);
    if (visible) setNext(current);
  }
  // dash.html:12731: picking an earlier date is a shortening, almost always a slip.
  const err = !next ? 'Pick the new deadline.' : current && next < current ? 'That is before the current deadline. Pick a later date.' : null;
  const save = async () => {
    if (err) return;
    setSaving(true);
    try {
      await editBountyTask(task.id, { deadline: next });
      await invalidate();
      onClose();
      toast.show(`Deadline moved to ${deadlineLabel(next, today)}`, 'success');
    } catch (e) {
      Alert.alert('Couldn’t change the deadline', problem(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={() => !saving && onClose()}
      title="Extend the deadline"
      subtitle={current ? `Now ${deadlineLabel(current, today)}` : 'No deadline set'}
      footer={<Button title="Save deadline" loading={saving} disabled={!!err || next === current} onPress={() => void save()} />}>
      <DateField label="New deadline" value={next || null} onChange={setNext} minimumDate={current && current > today ? current : today} error={next && next !== current ? err : null} />
    </Sheet>
  );
}

// ── Remind ───────────────────────────────────────────────────────────────────
/** Asks the server who a reminder would reach; returns null (after explaining) when it can't be sent. */
export async function loadRemindPreview(id: string): Promise<RemindPreview | null> {
  try {
    const pv = await fetchRemindPreview(id);
    if (!pv.canSend) {
      Alert.alert('Can’t send a reminder now', pv.blockedReason || 'A reminder can’t be sent for this task right now.');
      return null;
    }
    return pv;
  } catch (e) {
    Alert.alert('Couldn’t check who to remind', problem(e));
    return null;
  }
}

export function RemindSheet({ task, preview, onClose }: { task: BountyTask; preview: RemindPreview | null; onClose: () => void }) {
  const invalidate = useInvalidateBountyAdmin();
  const [sending, setSending] = useState(false);
  const pv = preview;
  const narrowed = !!pv?.audience && (pv.audience.departments.length > 0 || pv.audience.professionalTypes.length > 0);
  const send = async () => {
    setSending(true);
    try {
      const r = await sendRemind(task.id);
      await invalidate();
      onClose();
      toast.show(r?.message || 'Reminder sent.', 'success');
    } catch (e) {
      Alert.alert('Reminder not sent', problem(e));
    } finally {
      setSending(false);
    }
  };
  return (
    <ConfirmSheet
      visible={!!pv}
      onClose={onClose}
      title="Send a reminder?"
      subtitle={task.title}
      confirmLabel="Swipe to send reminder"
      onConfirm={() => void send()}
      loading={sending}
      note="You can send one reminder every 24 hours.">
      {pv ? (
        <View style={{ gap: space.sm }}>
          <Text variant="body">
            {`${pv.willRemind} ${pv.willRemind === 1 ? 'person' : 'people'} ${narrowed ? 'this task is for' : 'in the company'} who haven’t taken part yet get a message about it.`}
          </Text>
          <SummaryCard
            rows={[
              { key: 'wa', label: 'On WhatsApp', value: num(pv.viaWhatsApp) },
              { key: 'em', label: 'By email (no mobile number)', value: num(pv.emailOnly) },
              { key: 'none', label: 'Can’t be reached', value: num(pv.noContact) },
              { key: 'done', label: 'Already took part', value: num(pv.alreadyTookPart) },
            ]}
          />
        </View>
      ) : null}
    </ConfirmSheet>
  );
}

// ── Cancel task ──────────────────────────────────────────────────────────────
export function CancelTaskSheet({ task, visible, onClose, onDone }: { task: BountyTask; visible: boolean; onClose: () => void; onDone?: () => void }) {
  const invalidate = useInvalidateBountyAdmin();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const active = (Array.isArray(task.claims) ? task.claims : []).filter((c) => ['claimed', 'in_progress', 'submitted'].includes(String(c?.status)));
  const held = active.reduce((s, c) => s + num(c.reward ?? task.reward), 0);
  const save = async () => {
    setSaving(true);
    try {
      await cancelBountyTask(task.id, reason.trim());
      await invalidate();
      onClose();
      toast.show('Task cancelled', 'success');
      onDone?.();
    } catch (e) {
      Alert.alert('Couldn’t cancel the task', problem(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      title="Cancel this task?"
      subtitle={task.title}
      confirmLabel="Swipe to cancel task"
      onConfirm={() => void save()}
      loading={saving}
      note="This can’t be undone. No message is sent to the people taking part.">
      <View style={{ gap: space.md }}>
        <SummaryCard
          rows={[
            { key: 'active', label: 'Still working on it', value: active.length ? `${active.length}` : 'Nobody' },
            { key: 'back', label: 'Coins back to the poster', value: `${coins(held)} coins` },
            { key: 'paid', label: 'Already paid', value: 'Stays paid' },
          ]}
        />
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={300} placeholder="Shown on the task" />
      </View>
    </ConfirmSheet>
  );
}

