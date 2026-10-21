// "What you sent" — my submission for a task (GET /bounty_tasks/:id/my_submission), shown like the
// website's BountySubmissionView. Loaded when the sheet opens (never cached: older submissions carry
// their files inline as data URLs). Files are downloaded through the per-file link route, which mints
// a fresh 2-minute link each time.

import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Download, ExternalLink, FileText, Image as ImageIcon, Video } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import {
  type BountyMySubmission,
  type BountySubmissionFile,
  type BountyTask,
  fetchBountySubmissionFileLink,
  fetchMyBountySubmission,
} from '@/api/bounty';
import { isApiError } from '@/api/client';
import { useSession } from '@/auth/session';
import { useTodayIst } from '@/features/attendance/use-now';
import { moduleTone, palette, radius, space } from '@/theme/tokens';
import { Banner, Card, ErrorState, IconButton, ListCard, ListRow, ModuleBadge, Sheet, Skeleton, StatusPill, Text } from '@/ui';

import { openFileSource } from './files';
import { asArray, claimStatusMeta, dateTimeLabel, submissionTypeOf } from './logic';

import { themedStyles } from '@/theme/themed';
const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

type Loaded = { loading: boolean; error: string | null; data: BountyMySubmission | null };

export function MySubmissionSheet({ task, visible, onClose }: { task: BountyTask; visible: boolean; onClose: () => void }) {
  const userId = useSession((s) => s.user?.id) ?? '';
  const today = useTodayIst();
  const [state, setState] = useState<Loaded>({ loading: true, error: null, data: null });
  const [busy, setBusy] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Each time the sheet opens it starts from a fresh load (state adjusted during render, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setState({ loading: true, error: null, data: null });
  }

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void fetchMyBountySubmission(task.id).then((r) => {
      if (!alive) return;
      if (isApiError(r)) setState({ loading: false, error: r.error, data: null });
      else setState({ loading: false, error: null, data: r && typeof r === 'object' ? r : null });
    });
    return () => {
      alive = false;
    };
  }, [visible, task.id, attempt]);

  const download = async (index: number, name: string) => {
    setBusy(index);
    try {
      const r = await fetchBountySubmissionFileLink(task.id, userId, index);
      if (isApiError(r) || !r.url) throw new Error(isApiError(r) ? r.error : 'Could not download this file. Please try again.');
      await openFileSource(r.url, r.fileName || name || 'submission');
    } catch (e) {
      Alert.alert('Download', e instanceof Error ? e.message : 'Could not download this file.');
    } finally {
      setBusy(null);
    }
  };

  const data = state.data;
  const sub = data?.submission && typeof data.submission === 'object' ? data.submission : undefined;
  const type = data?.submissionType || submissionTypeOf(task);
  // Guard every list: older rows carry a single linkUrl / fileData instead of the arrays.
  const linkList = asArray<string>(sub?.links).filter((v) => typeof v === 'string' && !!v);
  const links = linkList.length ? linkList : [sub?.linkUrl].filter((v): v is string => typeof v === 'string' && !!v);
  const fileList = asArray<BountySubmissionFile>(sub?.files).filter((f) => !!f && typeof f.fileData === 'string');
  const files: BountySubmissionFile[] = fileList.length ? fileList : sub?.fileData ? [{ fileData: sub.fileData, fileName: sub.fileName }] : [];
  const status = data ? claimStatusMeta(task, data) : null;
  const FileIcon = type === 'image' ? ImageIcon : type === 'video' ? Video : FileText;

  return (
    <Sheet visible={visible} onClose={onClose} title="What you sent" subtitle={task.title}>
      {state.loading ? (
        <View style={{ gap: space.sm }} accessibilityLabel="Loading your submission" accessibilityRole="progressbar">
          <View style={styles.headRow}>
            <Skeleton height={14} width="48%" radius={7} />
            <Skeleton height={24} width={96} radius={12} />
          </View>
          <Skeleton height={140} radius={radius.xl} />
        </View>
      ) : state.error ? (
        <ErrorState
          message={state.error}
          onRetry={() => {
            setState({ loading: true, error: null, data: null });
            setAttempt((n) => n + 1);
          }}
        />
      ) : data ? (
        <>
          <View style={styles.headRow}>
            <Text variant="label" muted numberOfLines={2} style={styles.headText}>
              Sent {dateTimeLabel(data.submittedAt, today)}
            </Text>
            {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
          </View>

          {data.status === 'rejected' && data.rejectReason ? <Banner tone="danger" title="Rejected" message={data.rejectReason} /> : null}

          {type === 'text' ? (
            <Card tone="accent">
              <Text variant="body" selectable>
                {sub?.text || '—'}
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
                      <FileIcon size={18} color={moduleTone.bounty.fg} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                      <Text variant="label" numberOfLines={1} style={styles.headText}>
                        {name}
                      </Text>
                      <IconButton
                        tone="surface"
                        accessibilityLabel={`Download ${name}`}
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

          {data.submitNote ? (
            <View style={{ gap: space.xxs }}>
              <Text variant="labelStrong" muted>
                Your note
              </Text>
              <Text variant="body" selectable>
                {data.submitNote}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headText: { flex: 1, minWidth: 0 },
  fileCard: { overflow: 'hidden' },
  preview: { height: 220, width: '100%' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.xs },
}));
