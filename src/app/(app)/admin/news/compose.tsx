// New post (no `id`) or Edit post (`?id=`): the News studio's form (features/newsroom/compose-form).
// Creators only; an edit also needs it to be my own post unless I am Super Admin (dash.html:19523).

import { Redirect, useLocalSearchParams } from 'expo-router';
import { Megaphone } from 'lucide-react-native';

import { useAnnouncements } from '@/api/announcements';
import { canManagePost } from '@/features/newsroom/access';
import { ComposeForm } from '@/features/newsroom/compose-form';
import { useNewsroomAccess } from '@/features/newsroom/gate';
import { palette } from '@/theme/tokens';
import { EmptyState, ErrorState, NavHeader, Screen, SkeletonList } from '@/ui';

export default function ComposeNewsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user, ready, studio } = useNewsroomAccess();
  const q = useAnnouncements();

  if (ready && !studio) return <Redirect href="/" />;
  if (!id) return <ComposeForm initial={null} />;

  const a = (q.data ?? []).find((x) => x.id === id) ?? null;
  if (!a) {
    return (
      <Screen header={<NavHeader title="Edit post" />}>
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
  if (ready && !canManagePost(user, a)) return <Redirect href="/admin/news" />;
  return <ComposeForm key={a.id} initial={a} />;
}
