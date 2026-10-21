// Small pieces shared by the Bounty admin screens: a coins field, the phase-wise reward editor, a task
// row for the admin board and a claimant's submission (the website's BountySubmissionView, read from
// the full task GET /bounty_tasks/:id; files open through the per-file download route).

import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Download, ExternalLink, FileText, Image as ImageIcon, Plus, Trash2, Video } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, View } from 'react-native';

import type { BountySubmissionFile, BountySubmissionType, BountyTask } from '@/api/bounty';
import { type AdminClaim, fetchClaimFileLink } from '@/api/bountyadmin';
import { SUBMISSION_ICON } from '@/features/bounty/components';
import { openFileSource } from '@/features/bounty/files';
import { asArray, claimsOf, coins, deadlineLabel, headlineReward, num, submissionTypeOf, taskStatusMeta } from '@/features/bounty/logic';
import { themedStyles } from '@/theme/themed';
import { moduleTone, palette, space } from '@/theme/tokens';
import { ActivityRow, Button, Card, IconButton, isDarkScheme, ListCard, ListRow, ModuleBadge, Text, TextField } from '@/ui';

import { digitsOnly, newPhase, type PhaseDraft, phaseLine, waitingCount } from './logic';

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

// ── Inputs ───────────────────────────────────────────────────────────────────
/** One switch as a row: the whole row is the switch for touch and screen readers. */
export function SwitchRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const offTrack = isDarkScheme() ? palette.hairline : palette.surfaceSunken;
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={({ pressed }) => [styles.switchRow, pressed && styles.pressed, disabled && styles.dim]}>
      <ListRow
        title={title}
        subtitle={subtitle}
        numberOfLines={2}
        subtitleLines={3}
        right={
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Switch value={value} disabled={disabled} trackColor={{ false: offTrack, true: palette.accentDeep }} thumbColor={palette.onAccent} ios_backgroundColor={offTrack} />
          </View>
        }
      />
    </Pressable>
  );
}

/** A whole-number coins field ("coins" after the figure). */
export function CoinsField({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string | null;
  error?: string | null;
  placeholder?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(v) => onChange(digitsOnly(v))}
      keyboardType="number-pad"
      inputMode="numeric"
      placeholder={placeholder ?? '0'}
      hint={hint}
      error={error}
      right={
        <Text variant="label" muted>
          coins
        </Text>
      }
    />
  );
}

/** Rows of "Up to #N · coins each"; only the last may be left without a limit (dash.html:12933). */
export function PhaseEditor({ phases, onChange }: { phases: PhaseDraft[]; onChange: (next: PhaseDraft[]) => void }) {
  const set = (i: number, k: keyof PhaseDraft, v: string) => onChange(phases.map((p, x) => (x === i ? { ...p, [k]: v } : p)));
  return (
    <View style={styles.phases}>
      {phases.map((p, i) => {
        const last = i === phases.length - 1;
        return (
          <Card key={i} tone="frostStrong" style={styles.phase}>
            <View style={styles.phaseHead}>
              <Text variant="labelStrong" style={styles.flex} numberOfLines={1}>
                {p.name || `Phase ${i + 1}`}
              </Text>
              {phases.length > 1 ? (
                <IconButton tone="surface" accessibilityLabel={`Remove ${p.name || `phase ${i + 1}`}`} onPress={() => onChange(phases.filter((_, x) => x !== i))}>
                  <Trash2 size={18} color={palette.dangerInk} strokeWidth={1.8} />
                </IconButton>
              ) : null}
            </View>
            <TextField label="Name" value={p.name} onChangeText={(v) => set(i, 'name', v)} placeholder={`Phase ${i + 1}`} maxLength={40} />
            <TextField
              label={last ? 'Up to which person (blank = no limit)' : 'Up to which person'}
              value={p.upTo}
              onChangeText={(v) => set(i, 'upTo', digitsOnly(v))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder={last ? 'No limit' : 'e.g. 50'}
            />
            <CoinsField label="Coins each" value={p.coins} onChange={(v) => set(i, 'coins', v)} />
          </Card>
        );
      })}
      <Text variant="caption" muted>
        Example: “Up to 50” at 100 coins pays people 1–50; the next phase “Up to 100” at 75 coins pays 51–100.
      </Text>
      <Button title="Add a phase" variant="ghost" size="md" icon={<Plus />} onPress={() => onChange([...phases, newPhase(phases.length)])} />
    </View>
  );
}

// ── The admin board row ──────────────────────────────────────────────────────
export function AdminTaskRow({ task, today, onPress }: { task: BountyTask; today: string; onPress: () => void }) {
  const waiting = waitingCount(task);
  const status = taskStatusMeta(task, today);
  const taken = claimsOf(task).length;
  const cap = num(task.maxAccepts);
  const type = submissionTypeOf(task);
  return (
    <ActivityRow
      module="bounty"
      icon={SUBMISSION_ICON[type] ?? FileText}
      title={task.title || 'Untitled task'}
      subtitle={`${task.creatorName || 'Someone'} · ${cap ? `${taken} of ${cap} joined` : `${taken} joined`}${task.deadline ? ` · due ${deadlineLabel(task.deadline, today)}` : ''}`}
      value={`${coins(headlineReward(task))} coins`}
      status={waiting ? { label: `${waiting} to check`, tone: 'pending' } : status}
      onPress={onPress}
      accessibilityHint="Opens the task"
    />
  );
}

// ── A claimant's submission ──────────────────────────────────────────────────
export function SubmissionView({ taskId, claim, type }: { taskId: string; claim: AdminClaim; type: BountySubmissionType }) {
  const [busy, setBusy] = useState<number | null>(null);
  const sub = claim.submission && typeof claim.submission === 'object' ? claim.submission : undefined;
  // Older rows carry a single linkUrl / fileData instead of the arrays.
  const linkList = asArray<string>(sub?.links).filter((v) => typeof v === 'string' && !!v);
  const links = linkList.length ? linkList : [sub?.linkUrl].filter((v): v is string => typeof v === 'string' && !!v);
  const fileList = asArray<BountySubmissionFile>(sub?.files).filter((f) => !!f && typeof f.fileData === 'string');
  const files: BountySubmissionFile[] = fileList.length ? fileList : sub?.fileData ? [{ fileData: sub.fileData, fileName: sub.fileName }] : [];
  const FileIcon = type === 'image' ? ImageIcon : type === 'video' ? Video : FileText;

  const download = async (index: number, name: string) => {
    setBusy(index);
    try {
      const r = await fetchClaimFileLink(taskId, claim.employeeId, index);
      if (!r?.url) throw new Error('Could not open this file. Please try again.');
      await openFileSource(r.url, r.fileName || name);
    } catch (e) {
      Alert.alert('Couldn’t open the file', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (!sub) {
    return (
      <Text variant="label" muted>
        {claim.hasSubmission ? 'Loading what they sent…' : 'Nothing sent yet.'}
      </Text>
    );
  }

  return (
    <View style={styles.sub}>
      {type === 'text' ? (
        <Card tone="accent">
          <Text variant="body" selectable>
            {sub.text || '—'}
          </Text>
        </Card>
      ) : null}
      {type === 'link' ? (
        links.length ? (
          <ListCard>
            {links.map((u, i) => (
              <ListRow
                key={`${u}-${i}`}
                left={<ModuleBadge module="bounty" icon={ExternalLink} />}
                title={links.length > 1 ? `Link ${i + 1}` : 'Link'}
                subtitle={u}
                subtitleLines={2}
                chevron
                accessibilityLabel={`Open link ${u}`}
                onPress={() => void WebBrowser.openBrowserAsync(withScheme(u)).catch(() => {})}
              />
            ))}
          </ListCard>
        ) : (
          <Text variant="label" muted>
            No link was attached.
          </Text>
        )
      ) : null}
      {type === 'image' || type === 'video' || type === 'document'
        ? files.map((f, i) => {
            const name = f.fileName || `${type} ${i + 1}`;
            const preview = type === 'image' && /^(https?:|data:image)/i.test(f.fileData);
            return (
              <Card key={i} tone="accent" padded={false} style={styles.fileCard}>
                {preview ? <Image source={{ uri: f.fileData }} style={styles.preview} contentFit="cover" transition={150} accessibilityLabel={name} /> : null}
                <View style={styles.fileRow}>
                  <FileIcon size={18} color={moduleTone.bounty.fg} strokeWidth={1.8} style={styles.noShrink} />
                  <Text variant="label" numberOfLines={1} style={styles.flex}>
                    {name}
                  </Text>
                  <IconButton
                    tone="surface"
                    accessibilityLabel={`Open ${name}`}
                    disabled={busy !== null && busy !== i}
                    onPress={() => {
                      if (busy === null) void download(i, f.fileName || `${type}-${i + 1}`);
                    }}>
                    {busy === i ? <ActivityIndicator color={palette.primaryText} /> : <Download size={20} color={palette.text} strokeWidth={1.8} />}
                  </IconButton>
                </View>
              </Card>
            );
          })
        : null}
      {claim.submitNote ? (
        <View style={styles.note}>
          <Text variant="labelStrong" muted>
            Their note
          </Text>
          <Text variant="body" selectable>
            {claim.submitNote}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Up to #3 · 400 coins" lines for a phase-wise task. */
export function PhaseLines({ task }: { task: Pick<BountyTask, 'phases'> }) {
  const list = asArray<{ upTo?: string | number | null; coins: number; name?: string }>(task.phases).filter(Boolean);
  return (
    <View style={styles.note}>
      {list.map((p, i) => (
        <Text key={i} variant="label" muted>
          {`${p.name || `Phase ${i + 1}`}: ${phaseLine(p)}`}
        </Text>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  switchRow: { borderRadius: 16 },
  pressed: { backgroundColor: palette.pressedTint },
  dim: { opacity: 0.55 },
  phases: { gap: space.sm },
  phase: { gap: space.sm },
  phaseHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  noShrink: { flexShrink: 0 },
  sub: { gap: space.sm },
  note: { gap: space.xxs },
  fileCard: { overflow: 'hidden' },
  preview: { height: 220, width: '100%' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.xs },
}));
