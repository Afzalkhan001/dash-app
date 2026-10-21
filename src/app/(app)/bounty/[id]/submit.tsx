// Send your work for a bounty task — the website's "Submit Your Work" modal (dash.html ~L13056).
// What is asked for follows the task's submissionType (text / link / image / video / document) and
// how many links/files it allows (maxAttachments, 1–10). The body is exactly the website's:
//   { userId, submitNote, submission: { text } | { linkUrl, links } | { fileData, fileName, files[] } }
// ?direct=1 → no claim yet: POST /claim_and_submit (accepts + submits in one go)
// otherwise → finish my existing claim: POST /submit
//
// Form template (docs/DESIGN.md §10.3): a short frosted summary (task + reward + who checks it), one
// column of fields (links as Payno PillFields), errors inline under their field, a server error as a
// danger Banner at the end, and the submit pinned in the ActionBar.

import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, FileSearch, FileText, Images, Link2, Paperclip, Plus, Send, Video, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { type BountySubmission, type BountyTask, claimAndSubmitBounty, submitBountyClaim, useBountyTasks } from '@/api/bounty';
import { isApiError } from '@/api/client';
import { useSession } from '@/auth/session';
import { CoinBadge } from '@/features/bounty/components';
import { fileSizeLabel, MAX_PAYLOAD_CHARS, pickVideo } from '@/features/bounty/files';
import { useMergeBountyTask } from '@/features/bounty/hooks';
import { asArray, attachmentCap, claimReward, headlineReward, myClaimOf, submissionTypeOf } from '@/features/bounty/logic';
import { type PickedFile, pickDocument, pickImage } from '@/lib/files';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import {
  FIELD_LABEL_INSET,
  ActionBar,
  ActionRow,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FieldMessage,
  haptic,
  IconButton,
  NavHeader,
  PillField,
  Screen,
  Skeleton,
  Text,
  TextField,
  toast,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
const FILE_TYPES = ['image', 'video', 'document'];

// Where a message shows: under the field it is about, or (server errors) as a Banner at the end.
type FormError = { at: 'text' | 'link' | 'files' | 'submit'; message: string };

export default function BountySubmitScreen() {
  const { id, direct } = useLocalSearchParams<{ id: string; direct?: string }>();
  const router = useRouter();
  const userId = useSession((s) => s.user?.id);
  const tasksQ = useBountyTasks();
  const merge = useMergeBountyTask();
  const isDirect = direct === '1';
  // Opened from a link with nothing behind it: land on the task (or, when it is gone, on Bounty
  // rewards) instead of a dead "back".
  const leave = () => (router.canGoBack() ? router.back() : router.replace(id ? `/bounty/${encodeURIComponent(id)}` : '/bounty'));
  const leaveMissing = () => (router.canGoBack() ? router.back() : router.replace('/bounty'));

  const [text, setText] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<FormError | null>(null);
  const [picking, setPicking] = useState(false);

  const task = asArray<BountyTask>(tasksQ.data).find((t) => !!t && t.id === id);
  const type = task ? submissionTypeOf(task) : 'text';
  const cap = task ? attachmentCap(task) : 1;

  const send = useMutation({
    mutationFn: async (submission: BountySubmission) => {
      const r = isDirect ? await claimAndSubmitBounty(id, note.trim(), submission) : await submitBountyClaim(id, note.trim(), submission);
      if (isApiError(r)) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      haptic.success();
      merge(r);
      if (r?.autoApprovalPending) Alert.alert('Work sent', `Your work was sent. ${r.autoApprovalError || ''}`.trim());
      else toast.show('Work sent');
      leave();
    },
    onError: (e: Error) => {
      haptic.error();
      setError({ at: 'submit', message: e.message });
    },
  });

  const header = <NavHeader title="Send your work" />;

  if (!task) {
    return (
      <Screen header={header}>
        {tasksQ.isLoading ? (
          <View style={{ gap: space.md }}>
            <Skeleton height={96} radius={radius.xl} />
            <Skeleton height={140} radius={radius.md} />
          </View>
        ) : tasksQ.error && !Array.isArray(tasksQ.data) ? (
          <ErrorState message={tasksQ.error.message} onRetry={() => void tasksQ.refetch()} />
        ) : (
          <EmptyState
            icon={<FileSearch color={palette.textMuted} />}
            title="Task not found"
            message="This task is no longer on your board."
            action={<Button title="Go back" variant="accent" size="md" onPress={leaveMissing} />}
          />
        )}
      </Screen>
    );
  }

  const mine = myClaimOf(task, userId);
  const reward = mine ? claimReward(task, mine) : headlineReward(task);
  const isFileType = FILE_TYPES.includes(type);

  const addFile = async (how: 'camera' | 'library' | 'video' | 'document') => {
    if (files.length >= cap || picking) return;
    setPicking(true);
    setError(null);
    try {
      const f =
        how === 'camera' ? await pickImage('camera') : how === 'library' ? await pickImage('library') : how === 'video' ? await pickVideo() : await pickDocument(['*/*']);
      if (f) setFiles((cur) => [...cur, f].slice(0, cap));
    } catch (e) {
      setError({ at: 'files', message: e instanceof Error ? e.message : 'Could not attach that file.' });
    } finally {
      setPicking(false);
    }
  };

  const block = (at: FormError['at'], message: string) => {
    haptic.warning();
    setError({ at, message });
  };

  const submit = () => {
    setError(null);
    const submission: BountySubmission = {};
    if (type === 'text') {
      if (!text.trim()) return block('text', 'Type your answer first.');
      submission.text = text;
    }
    if (type === 'link') {
      const ls = links.map((v) => v.trim()).filter(Boolean);
      if (!ls.length) return block('link', 'Add a link first.');
      // Both shapes, like the website: links[] carries all, linkUrl mirrors the first.
      submission.linkUrl = ls[0]!;
      submission.links = ls;
    }
    if (isFileType) {
      if (!files.length) return block('files', type === 'image' ? 'Add a photo first.' : type === 'video' ? 'Add a video first.' : 'Add a file first.');
      const total = files.reduce((s, f) => s + f.dataUrl.length, 0);
      if (total > MAX_PAYLOAD_CHARS) return block('files', 'These files are too big to send together. Remove one or pick smaller files.');
      const list = files.map((f) => ({ fileData: f.dataUrl, fileName: f.name }));
      submission.fileData = list[0]!.fileData;
      submission.fileName = list[0]!.fileName;
      submission.files = list;
    }
    send.mutate(submission);
  };

  const full = files.length >= cap;
  const errorAt = (at: FormError['at']) => (error?.at === at ? error.message : null);

  return (
    <Screen
      header={header}
      footer={
        <ActionBar note={picking ? 'Attaching your file…' : null}>
          <Button title="Send your work" icon={<Send />} loading={send.isPending} disabled={picking} onPress={submit} />
        </ActionBar>
      }>
      {/* What this is for */}
      <Card tone="frostStrong" style={{ gap: space.xs }}>
        <View style={styles.summaryHead}>
          <Text variant="bodyStrong" numberOfLines={3} style={styles.flexText}>
            {task.title || 'Untitled task'}
          </Text>
          <CoinBadge amount={reward} />
        </View>
        {/* Not clipped: who pays, and when, is the point of this line (long names need 3 lines at 1.3x). */}
        <Text variant="caption" muted>
          {isDirect ? 'Sending this also accepts the task. ' : ''}
          {task.requiresApproval === false ? 'Coins are paid as soon as you send it.' : `${task.creatorName || 'The task owner'} checks it, then pays the coins.`}
        </Text>
      </Card>

      {type === 'text' ? (
        <TextField
          label="Your answer"
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (error?.at === 'text') setError(null);
          }}
          placeholder="Type your answer here"
          multiline
          error={errorAt('text')}
          style={{ minHeight: 160 }}
        />
      ) : null}

      {type === 'link' ? (
        <View style={{ gap: space.sm }}>
          {links.map((v, i) => (
            <PillField
              key={i}
              icon={Link2}
              label={i === 0 ? (cap > 1 ? `Links (up to ${cap})` : 'Link') : undefined}
              accessibilityLabel={`Link ${i + 1}`}
              value={v}
              onChangeText={(nv) => {
                setLinks((cur) => cur.map((x, k) => (k === i ? nv : x)));
                if (error?.at === 'link') setError(null);
              }}
              placeholder="https://"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              error={i === 0 ? errorAt('link') : null}
              trailing={
                links.length > 1 ? (
                  <IconButton size={32} tone="surface" accessibilityLabel={`Remove link ${i + 1}`} onPress={() => setLinks((cur) => cur.filter((_, k) => k !== i))}>
                    <X size={16} color={palette.textMuted} />
                  </IconButton>
                ) : undefined
              }
            />
          ))}
          {links.length < cap ? (
            <Button
              title="Add another link"
              variant="text"
              icon={<Plus />}
              onPress={() => setLinks((cur) => [...cur, ''])}
            />
          ) : null}
        </View>
      ) : null}

      {isFileType ? (
        <View style={{ gap: space.sm }}>
          <Text variant="labelStrong" muted style={FIELD_LABEL_INSET}>
            {`${type === 'image' ? 'Photos' : type === 'video' ? 'Videos' : 'Files'}${cap > 1 ? ` (up to ${cap})` : ''}`}
          </Text>
          {files.map((f, i) => (
            <Card key={`${f.name}-${i}`} padded={false} style={styles.fileCard}>
              {f.type.startsWith('image/') ? (
                <Image source={{ uri: f.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={f.name} />
              ) : (
                <View style={[styles.thumb, styles.thumbIcon]}>
                  {type === 'video' ? <Video size={22} color={moduleTone.bounty.fg} strokeWidth={1.8} /> : <FileText size={22} color={moduleTone.bounty.fg} strokeWidth={1.8} />}
                </View>
              )}
              <View style={[styles.flexText, { gap: 2 }]}>
                <Text variant="labelStrong" numberOfLines={1}>
                  {f.name}
                </Text>
                <Text variant="caption" muted tabular numberOfLines={1}>
                  {fileSizeLabel(f.size)}
                </Text>
              </View>
              <IconButton
                accessibilityLabel={`Remove ${f.name}`}
                onPress={() => {
                  setFiles((cur) => cur.filter((_, k) => k !== i));
                  setError((e) => (e?.at === 'files' ? null : e));
                }}>
                <X size={18} color={palette.textMuted} />
              </IconButton>
            </Card>
          ))}
          {!full ? (
            type === 'image' ? (
              <ActionRow context="screen">
                <Button title="Camera" variant="ghost" size="md" disabled={picking} icon={<Camera />} onPress={() => void addFile('camera')} />
                <Button title="Photos" variant="ghost" size="md" disabled={picking} icon={<Images />} onPress={() => void addFile('library')} />
              </ActionRow>
            ) : (
              <Button
                title={type === 'video' ? 'Choose a video' : 'Choose a file'}
                variant="ghost"
                size="md"
                loading={picking}
                icon={type === 'video' ? <Video /> : <Paperclip />}
                onPress={() => void addFile(type === 'video' ? 'video' : 'document')}
              />
            )
          ) : cap > 1 ? (
            <Text variant="caption" muted>
              That’s the most this task allows.
            </Text>
          ) : null}
          {errorAt('files') ? (
            <FieldMessage error={errorAt('files')} />
          ) : (
            <FieldMessage hint={type === 'image' ? 'Photos are made smaller before sending.' : 'Up to 8 MB per file.'} />
          )}
        </View>
      ) : null}

      <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything the reviewer should know" multiline />

      {error?.at === 'submit' ? <Banner tone="danger" title="Couldn’t send your work" message={error.message} /> : null}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  summaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flexText: { flex: 1, minWidth: 0, gap: 2 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingLeft: space.sm, paddingRight: space.xs },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, flexShrink: 0 },
  thumbIcon: { backgroundColor: moduleTone.bounty.bg, alignItems: 'center', justifyContent: 'center' },
}));
