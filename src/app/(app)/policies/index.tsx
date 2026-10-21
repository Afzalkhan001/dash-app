// Company policies — the website's PoliciesPanel "Policies" tab (dash.html ~L5023): the published
// policies meant for me (GET /hr/policies). HR admins (Super Admin and HR — dash.html PoliciesPanel
// admin) also get a pencil in the header that opens "Manage" (drafting, publishing, archiving and
// who has read them) in HR setup (app/(app)/admin/hr-time/policies, the hrtime domain).
//
// Payno list (docs/REFERENCE-COMPONENTS.md §3): NavHeader "Policies"; a light SummaryHero holding the
// Lendora RadialArc of the acknowledgements (§2 #22): "2/4" confirmed, with "Confirmed" and "To read"
// as legend dots (only when some policy asks to be confirmed); then "Waiting for you" and "Other policies" (or "All policies" when nothing
// waits) as ActivityLists — each group in the server's order. A row is the policy's badge, its title
// (up to 3 lines), its category and publish date and, in "Other policies", a soft green "Done" pill
// under the text for the ones I have confirmed (the waiting ones don't repeat "To read": their section
// title and the hero say it), so a long title is never squeezed beside a pill on a 320 dp phone. The
// whole row is the button.

import { useRouter } from 'expo-router';
import { PenLine, ScrollText } from 'lucide-react-native';

import { useHrMe } from '@/api/me';
import { needsAck, type PolicySummary, usePolicies } from '@/api/policies';
import { useTodayIst } from '@/features/attendance/use-now';
import { canManagePolicies } from '@/features/hrtime/access';
import { istDate } from '@/features/policies/format';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import {
  ActivityList,
  EmptyState,
  ErrorState,
  ListRow,
  ModuleBadge,
  NavHeader,
  RadialArc,
  Screen,
  SkeletonList,
  StatusPill,
  SummaryHero,
} from '@/ui';

function PolicyRow({ policy: p, today, onPress }: { policy: PolicySummary; today: string; onPress: () => void }) {
  const title = (typeof p.title === 'string' && p.title.trim()) || 'Untitled policy';
  const waiting = needsAck(p);
  // "To read" is the section's own title, so the waiting rows don't repeat it on screen (it is still
  // read out).
  const status = waiting ? 'To read' : p.requires_ack ? 'Done' : null;
  const category = typeof p.category === 'string' ? p.category.trim() : '';
  const published = p.published_at ? `Published ${istDate(p.published_at, today)}` : '';
  const subtitle = [category, published].filter(Boolean).join(' · ') || null;
  return (
    // The kit ActivityRow's anatomy (72 dp, badge 40, medium title), with the pill under the text.
    <ListRow
      size="lg"
      titleWeight="medium"
      left={<ModuleBadge module="policies" icon={ScrollText} />}
      title={title}
      numberOfLines={3}
      subtitle={subtitle}
      subtitleLines={2}
      below={status && !waiting ? <StatusPill label={status} tone="done" /> : undefined}
      chevron
      onPress={onPress}
      accessibilityLabel={[title, subtitle, status].filter(Boolean).join(', ')}
      accessibilityHint="Opens the policy"
    />
  );
}

export default function PoliciesScreen() {
  const router = useRouter();
  const access = useAccess();
  const enabled = access.sections.policies;
  const q = usePolicies(enabled);
  const today = useTodayIst();
  // isPending also covers restoring the saved cache on a cold start (access.loading misses it), so the
  // screen doesn't flash "Policies aren’t on for you" / "No policies yet" before the data is back.
  const hrPending = useHrMe().isPending;

  const manage = canManagePolicies(access.hr, access.user);
  const header = (
    <NavHeader
      title="Policies"
      actions={manage ? [{ icon: PenLine, label: 'Manage policies', onPress: () => router.push('/admin/hr-time/policies') }] : undefined}
    />
  );

  if (access.loading || hrPending) {
    return (
      <Screen header={header}>
        <SkeletonList rows={5} tone="surface" />
      </Screen>
    );
  }
  if (!enabled) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={<ScrollText color={palette.textMuted} strokeWidth={1.8} />}
          title="Policies aren’t on for you"
          message="Ask HR to switch them on."
        />
      </Screen>
    );
  }

  const list = Array.isArray(q.data) ? q.data.filter((p): p is PolicySummary => !!p && typeof p === 'object' && !!p.id) : [];
  // "To read" first, then the rest — each group in the server's order.
  const toRead = list.filter(needsAck);
  const rest = list.filter((p) => !needsAck(p));
  // Of the policies that ask to be confirmed, how many I have confirmed.
  const asking = list.filter((p) => !!p.requires_ack).length;
  const confirmed = Math.max(0, asking - toRead.length);
  const open = (id: string) => router.push(`/policies/${id}`);
  const ready = !q.isPending && !q.isError;

  return (
    <Screen header={header} onRefresh={() => q.refetch()}>
      {ready && asking > 0 ? (
        <SummaryHero key="hero" icon={ScrollText} module="policies" label={toRead.length ? 'Read and confirmed' : 'All read and confirmed'}>
          <RadialArc
            value={confirmed}
            total={asking}
            size={168}
            caption={asking === 1 ? 'policy' : 'policies'}
            legend={[
              { label: 'Confirmed', value: confirmed },
              { label: 'To read', value: toRead.length },
            ]}
            accessibilityLabel={`${confirmed} of ${asking} policies read and confirmed, ${toRead.length} to read`}
          />
        </SummaryHero>
      ) : null}

      {q.isPending ? (
        <SkeletonList key="list" rows={5} avatar tone="surface" />
      ) : q.isError ? (
        <ErrorState key="list" message={q.error?.message ?? ''} onRetry={() => void q.refetch()} />
      ) : !list.length ? (
        <EmptyState
          key="list"
          icon={<ScrollText color={palette.textMuted} strokeWidth={1.8} />}
          title="No policies yet"
          message="Company policies show here once HR shares them."
        />
      ) : toRead.length ? (
        // The hero above already gives the count, so the title doesn't repeat it.
        <ActivityList key="list" title="Waiting for you">
          {toRead.map((p) => (
            <PolicyRow key={p.id} policy={p} today={today} onPress={() => open(p.id)} />
          ))}
        </ActivityList>
      ) : null}

      {ready && rest.length ? (
        <ActivityList key="rest" title={toRead.length ? 'Other policies' : 'All policies'}>
          {rest.map((p) => (
            <PolicyRow key={p.id} policy={p} today={today} onPress={() => open(p.id)} />
          ))}
        </ActivityList>
      ) : null}
    </Screen>
  );
}
