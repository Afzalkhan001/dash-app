// Bounty tasks, admin side (dash.html BountyTasksBoard :12547): the board as the people who post,
// manage or oversee tasks see it. Filters: To check (a submission waits on me), Mine (I posted it —
// creators only, as the website's "Created by Me") and All. Each task opens its own screen with the
// claims and the Manage menu. "Post a task" sits in the bottom bar for creators.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { ListChecks, Plus } from 'lucide-react-native';
import { useState } from 'react';

import type { BountyTask } from '@/api/bounty';
import { useAdminTasks } from '@/api/bountyadmin';
import { useTodayIst } from '@/features/attendance/use-now';
import { boardTasks } from '@/features/bounty/logic';
import { canDecideClaim, canReviewTask } from '@/features/bountyadmin/access';
import { AdminTaskRow } from '@/features/bountyadmin/components';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { waitingCount } from '@/features/bountyadmin/logic';
import { palette } from '@/theme/tokens';
import { ActionBar, ActivityList, Button, Card, EmptyState, ErrorState, NavHeader, Screen, Segmented, SkeletonList } from '@/ui';

const TITLE = 'Bounty tasks';
type Show = 'check' | 'mine' | 'all';

export default function AdminTasksScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.tasks} ready={ready} title={TITLE}>
      <Board />
    </AdminGate>
  );
}

function Board() {
  const router = useRouter();
  const params = useLocalSearchParams<{ show?: string }>();
  const today = useTodayIst();
  const { user, tenant, gates: g } = useBountyAdmin();
  const q = useAdminTasks();
  const initial: Show = params.show === 'check' ? 'check' : g.create && !g.adminRole ? 'mine' : 'all';
  const [show, setShow] = useState<Show>(initial);

  const all = boardTasks(q.data);
  const toCheck = all.filter((t) => !t.cancelledAt && waitingCount(t) > 0 && canDecideClaim(t, user, tenant));
  const mine = all.filter((t) => !!user && t.creatorId === user.id);
  // The website lists every task for everyone; on the phone the admin board keeps to the ones this
  // person can open (posted by them, or any task for Master / Super Admin and the App Manager).
  const reviewable = all.filter((t) => canReviewTask(t, user));
  const list: BountyTask[] = show === 'check' ? toCheck : show === 'mine' ? mine : reviewable;

  const options = [
    { key: 'check' as const, label: 'To check', badge: toCheck.length || undefined },
    ...(g.create ? [{ key: 'mine' as const, label: 'Mine' }] : []),
    { key: 'all' as const, label: 'All' },
  ];

  const empty =
    show === 'check'
      ? { title: 'Nothing to check', message: 'When someone sends work on a task you can approve, it shows up here.' }
      : show === 'mine'
        ? { title: 'No tasks posted yet', message: 'Post a task for the company and pay coins for the work.' }
        : { title: 'No tasks yet', message: 'Tasks posted in the company show up here.' };

  return (
    <Screen
      header={<NavHeader title={TITLE} />}
      onRefresh={() => q.refetch()}
      footer={
        g.create ? (
          <ActionBar>
            <Button title="Post a task" icon={<Plus />} onPress={() => router.push('/admin/bounty/tasks/new')} />
          </ActionBar>
        ) : undefined
      }>
      <Segmented options={options} value={show} onChange={setShow} />
      {q.isLoading ? (
        <SkeletonList rows={4} />
      ) : q.error && !q.data ? (
        <Card>
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : list.length ? (
        <ActivityList>
          {list.map((t) => (
            <AdminTaskRow key={t.id} task={t} today={today} onPress={() => router.push(`/admin/bounty/tasks/${encodeURIComponent(t.id)}`)} />
          ))}
        </ActivityList>
      ) : (
        <Card>
          <EmptyState icon={<ListChecks color={palette.textMuted} />} title={empty.title} message={empty.message} />
        </Card>
      )}
    </Screen>
  );
}
