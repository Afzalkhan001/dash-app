// One post as its creator sees it in the News studio: the picture, the words, and every setting the
// website's card and form show (status, kind, type, branches, schedule, expiry, pop-up frequency, link
// and button, file, Home banner). Edit and Delete only on my own posts unless I am Super Admin
// (dash.html:19523). Delete is permanent (server.js:9179) and swiped to confirm.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Megaphone, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useAnnouncements } from '@/api/announcements';
import { useDeletePost } from '@/api/newsroom';
import { AnnouncementImage } from '@/features/announcements/parts';
import { useTodayIst } from '@/features/attendance/use-now';
import { canManagePost } from '@/features/newsroom/access';
import { branchesLabel, isPopup, popupFreqLabel, postStatus, postTypeLabel } from '@/features/newsroom/format';
import { useNewsroomAccess } from '@/features/newsroom/gate';
import { postIcon } from '@/features/newsroom/icons';
import { dateLabel, stampLabel } from '@/lib/dates';
import { palette, space } from '@/theme/tokens';
import {
  ActionRow,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  SkeletonList,
  SuccessSheet,
  SummaryCard,
  Text,
  toast,
} from '@/ui';

// A long link has no spaces to wrap at: let it break after / . ? & = on a 320 dp phone.
const breakable = (url: string) => url.replace(/([/.?&=])/g, '$1\u200B');

export default function NewsPostScreen() {
  const router = useRouter();
  const today = useTodayIst();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, ready, studio } = useNewsroomAccess();
  const q = useAnnouncements();
  const del = useDeletePost();
  const [confirm, setConfirm] = useState(false);
  const [gone, setGone] = useState<string | null>(null);

  if (ready && !studio) return <Redirect href="/" />;

  if (gone) {
    return (
      <Screen header={<NavHeader title="Post" />}>
        <SuccessSheet
          visible
          onClose={() => router.back()}
          onPrimary={() => router.back()}
          title="Post deleted"
          subtitle={`“${gone}” is gone from Home, News and the office TVs.`}
        />
      </Screen>
    );
  }

  const a = (q.data ?? []).find((x) => x.id === id) ?? null;
  if (!a) {
    return (
      <Screen header={<NavHeader title="Post" />}>
        {q.isPending ? (
          <SkeletonList rows={6} />
        ) : q.isError ? (
          <ErrorState message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
        ) : (
          <EmptyState icon={<Megaphone color={palette.textMuted} />} title="This post is gone" message="Someone may have deleted it." />
        )}
      </Screen>
    );
  }

  const popup = isPopup(a);
  const st = postStatus(a);
  const canManage = canManagePost(user, a);
  const fileType = !popup && ['image', 'video', 'excel', 'ppt'].includes(String(a.type));

  return (
    <Screen
      header={
        <NavHeader
          title={popup ? 'Pop-up' : 'Post'}
          subtitle={st.label}
          actions={canManage ? [{ key: 'edit', icon: Pencil, label: 'Edit post', onPress: () => router.push(`/admin/news/compose?id=${encodeURIComponent(a.id)}`) }] : []}
        />
      }
      onRefresh={() => q.refetch()}>
      {a.hasMedia && (popup || a.type === 'image') ? <AnnouncementImage ann={a} /> : null}

      <Card>
        <Text variant="title" numberOfLines={4}>
          {a.title || '(untitled)'}
        </Text>
        {a.body ? (
          <Text variant="body" muted style={{ marginTop: space.xs }}>
            {a.body}
          </Text>
        ) : null}
      </Card>

      <SummaryCard
        rows={[
          { key: 'status', label: 'Status', value: st.label, status: st.tone },
          { key: 'kind', label: 'What it is', value: popup ? 'Pop-up over Home' : 'Announcement' },
          ...(popup ? [{ key: 'freq', label: 'Shows', value: popupFreqLabel(a.popupFrequency) }] : [{ key: 'type', label: 'Type', value: postTypeLabel(a) }]),
          { key: 'branches', label: 'Visible to', value: branchesLabel(a.branches) },
          ...(a.scheduledAt ? [{ key: 'sched', label: st.label === 'Scheduled' ? 'Goes live' : 'Went live', value: stampLabel(a.scheduledAt, today) }] : []),
          { key: 'exp', label: 'Visible until', value: a.expiresAt ? `End of ${dateLabel(a.expiresAt, today)}` : 'Until deleted' },
          ...(a.linkUrl ? [{ key: 'link', label: 'Link', value: breakable(a.linkUrl) }] : []),
          ...(a.linkUrl && a.ctaText ? [{ key: 'cta', label: 'Button', value: a.ctaText }] : []),
          ...(fileType ? [{ key: 'file', label: 'File', value: a.fileName || (a.hasMedia ? 'Attached' : 'None') }] : []),
          ...(!popup ? [{ key: 'banner', label: 'Home banner', value: a.hasHomeBanner ? 'Yes' : 'No' }] : []),
          ...(!popup && (a.type === 'image' || a.type === 'video') ? [{ key: 'bleed', label: 'Full screen', value: a.fullBleed ? 'Yes' : 'No' }] : []),
          { key: 'by', label: 'Posted by', value: a.createdBy || '—' },
          { key: 'at', label: 'Posted', value: stampLabel(a.createdAt, today) },
        ]}
      />

      {canManage ? (
        <View style={{ paddingTop: space.xs }}>
          <ActionRow context="screen">
            <Button variant="danger" title="Delete" icon={<Trash2 />} onPress={() => setConfirm(true)} />
            <Button title="Edit" icon={<Pencil />} onPress={() => router.push(`/admin/news/compose?id=${encodeURIComponent(a.id)}`)} />
          </ActionRow>
        </View>
      ) : (
        <Text variant="caption" muted align="center">
          Only {a.createdBy || 'the person who posted it'} or a Super Admin can change this post.
        </Text>
      )}

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this post?"
        from={{ title: a.title || '(untitled)', subtitle: st.label, icon: postIcon(a), module: 'news' }}
        to={{ title: 'Deleted', subtitle: 'For everyone', icon: Trash2, module: 'security' }}
        confirmLabel="Swipe to delete"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(a.id, {
            onSuccess: () => {
              setConfirm(false);
              setGone(a.title || 'The post');
            },
            onError: (e) => toast.show(`Couldn’t delete: ${e.message}`, 'danger'),
          })
        }
        note="It disappears from Home, News and every office TV at once. This can’t be undone. No one is notified."
      />
    </Screen>
  );
}
