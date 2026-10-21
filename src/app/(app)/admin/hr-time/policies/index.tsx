// Policies (manage) — the website's Policies → Manage tab (dash.html PolicyManage ~L4994):
// GET /hr/policies?all=1 (hr_policies.js ~L80). Super Admin and HR with Policies on.
// Drafts / Published / Archived; each row says who it is for and, for a published policy that asks
// to be read, how far along that is (tap → the editor, which has the acknowledgements). + writes a
// new one.

import { useRouter } from 'expo-router';
import { Plus, ScrollText } from 'lucide-react-native';
import { useState } from 'react';

import { type PolicySummary } from '@/api/policies';
import { useAllPolicies, usePolicyDepartments } from '@/api/hrtime';
import { useTodayIst } from '@/features/attendance/use-now';
import { errorText, GateFallback, useHrTimeGate } from '@/features/hrtime/ui';
import { dateLabel } from '@/lib/dates';
import { moduleTone } from '@/theme/tokens';
import { ActivityList, ActivityRow, Button, Card, EmptyState, ErrorState, NavHeader, Screen, Segmented, SkeletonList } from '@/ui';

type Tab = 'draft' | 'published' | 'archived';

export default function ManagePoliciesScreen() {
  const router = useRouter();
  const today = useTodayIst();
  const { pending, allowed } = useHrTimeGate('policies');
  const q = useAllPolicies(allowed);
  const depts = usePolicyDepartments(allowed);
  const [tab, setTab] = useState<Tab>('published');
  const header = (
    <NavHeader title="Manage policies" actions={allowed ? [{ icon: Plus, label: 'New policy', onPress: () => router.push('/admin/hr-time/policies/new') }] : undefined} />
  );
  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const all = (Array.isArray(q.data) ? q.data : []).filter((p): p is PolicySummary => !!p && !!p.id);
  const count = (t: Tab) => all.filter((p) => p.status === t).length;
  const list = all.filter((p) => p.status === tab);
  const deptName = new Map((depts.data ?? []).map((d) => [d.id, d.name]));
  const audience = (p: PolicySummary) =>
    !p.audience?.length ? 'Everyone' : p.audience.map((id) => deptName.get(id) ?? 'A removed team').join(', ');
  const WORD: Record<Tab, string> = { draft: 'drafts', published: 'published policies', archived: 'archived policies' };

  return (
    <Screen header={header} onRefresh={() => Promise.all([q.refetch(), depts.refetch()])}>
      <Segmented
        options={[
          { key: 'draft', label: 'Drafts', badge: count('draft') || undefined },
          { key: 'published', label: 'Published' },
          { key: 'archived', label: 'Archived' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />
      {q.isPending ? (
        <SkeletonList rows={4} avatar tone="surface" />
      ) : q.error && !all.length ? (
        <ErrorState message={errorText(q.error)} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        <Card tone="surface">
          <EmptyState
            icon={<ScrollText color={moduleTone.policies.fg} strokeWidth={1.8} />}
            title={`No ${WORD[tab]}`}
            message={tab === 'draft' ? 'A new policy starts as a draft. Nobody sees it until you publish it.' : undefined}
            action={tab === 'draft' ? <Button title="New policy" icon={<Plus />} onPress={() => router.push('/admin/hr-time/policies/new')} /> : undefined}
          />
        </Card>
      ) : (
        <ActivityList>
          {list.map((p) => (
            <ActivityRow
              key={p.id}
              module="policies"
              icon={ScrollText}
              title={p.title || 'Untitled policy'}
              subtitle={[p.category, `Version ${p.version}`, audience(p)].filter(Boolean).join(' · ')}
              note={
                p.status === 'published'
                  ? `Published ${dateLabel(p.published_at, today)}${p.requires_ack ? ' · asks to be read' : ''}`
                  : p.status === 'draft'
                    ? `Last changed ${dateLabel(p.updated_at, today)}`
                    : `Archived ${dateLabel(p.updated_at, today)}`
              }
              chevron
              onPress={() => router.push(`/admin/hr-time/policies/${p.id}`)}
            />
          ))}
        </ActivityList>
      )}
    </Screen>
  );
}
