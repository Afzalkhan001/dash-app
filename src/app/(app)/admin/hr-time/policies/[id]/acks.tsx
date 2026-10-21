// Who has read a policy — the website's PolicyAcks (dash.html ~L4983): GET /hr/policies/:id/acks
// (hr_policies.js ~L183) → "X of Y confirmed version N", Waiting / Everyone, and the people.
// Super Admin and HR with Policies on. Read-only; nobody is messaged (there is no reminder route).

import { useLocalSearchParams } from 'expo-router';
import { Eye } from 'lucide-react-native';
import { useState } from 'react';

import { usePolicyAcks } from '@/api/hrtime';
import { useTodayIst } from '@/features/attendance/use-now';
import { errorText, GateFallback, useHrTimeGate } from '@/features/hrtime/ui';
import { dateLabel } from '@/lib/dates';
import { ActivityList, Avatar, EmptyState, ErrorState, ListRow, NavHeader, RadialArc, Screen, Segmented, SkeletonList, StatusPill, SummaryHero } from '@/ui';

export default function PolicyAcksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useTodayIst();
  const { pending, allowed } = useHrTimeGate('policies');
  const q = usePolicyAcks(id, allowed);
  const [tab, setTab] = useState<'waiting' | 'all'>('waiting');
  const header = <NavHeader title="Who has read it" />;
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const d = q.data;
  const people = (d?.people ?? []).filter((p) => p && p.id).sort((a, b) => Number(!!a.acked_at) - Number(!!b.acked_at) || a.name.localeCompare(b.name));
  const waiting = people.filter((p) => !p.acked_at);
  const shown = tab === 'waiting' ? waiting : people;

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {q.isPending ? (
        <SkeletonList rows={6} avatar tone="surface" />
      ) : q.error || !d ? (
        <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <SummaryHero icon={Eye} module="policies" label={`Confirmed version ${d.version}`}>
            <RadialArc
              value={d.acknowledged}
              total={d.total}
              size={168}
              caption="people"
              legend={[
                { label: 'Confirmed', value: d.acknowledged },
                { label: 'Waiting', value: d.total - d.acknowledged },
              ]}
              accessibilityLabel={`${d.acknowledged} of ${d.total} people confirmed version ${d.version}`}
            />
          </SummaryHero>
          <Segmented
            options={[
              { key: 'waiting', label: 'Waiting', badge: waiting.length || undefined },
              { key: 'all', label: 'Everyone' },
            ]}
            value={tab}
            onChange={(k) => setTab(k as 'waiting' | 'all')}
          />
          {shown.length ? (
            <ActivityList>
              {shown.map((p) => (
                <ListRow
                  key={p.id}
                  size="lg"
                  left={<Avatar name={p.name} />}
                  title={p.name}
                  subtitle={[p.department || 'No team', p.acked_at ? `confirmed ${dateLabel(p.acked_at, today)}` : null].filter(Boolean).join(' · ')}
                  subtitleLines={2}
                  below={p.acked_at ? undefined : <StatusPill label="Waiting" tone="pending" />}
                />
              ))}
            </ActivityList>
          ) : (
            tab === 'waiting' && people.length ? (
            <EmptyState icon={<Eye strokeWidth={1.8} />} title="Everyone has confirmed" message="Nobody is waiting on this version." />
          ) : (
            <EmptyState icon={<Eye strokeWidth={1.8} />} title="Nobody to ask" message="No one in this policy’s teams yet." />
          )
          )}
        </>
      )}
    </Screen>
  );
}
