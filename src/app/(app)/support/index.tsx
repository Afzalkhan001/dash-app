// Help & support (web: SupportView), in the order you need it:
//   1. a light SummaryHero: how many of my requests are still open (its ↗ opens them all), what waits
//      for approval, and the one main action "Raise a request" (/support/new picks the kind);
//   2. my help requests — still-open ones first, the latest 5, "See all" for the rest (/support/requests);
//   3. a link to "Wi-Fi & contacts" — branch Wi-Fi and staff to call (/support/contacts).
// Old links ?tab=centre open the contacts screen.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { LifeBuoy, Plus, Wifi } from 'lucide-react-native';

import { useMyTickets } from '@/api/support';
import { isOpenStatus } from '@/features/support/format';
import { asTickets, openFirst, SupportRequestRow } from '@/features/support/request-row';
import { palette, radius } from '@/theme/tokens';
import { ActivityList, EmptyState, ErrorState, ListCard, ListRow, ModuleBadge, NavHeader, Screen, Skeleton, SummaryHero } from '@/ui';

const PREVIEW = 5; // the full list is one tap away ("See all")

export default function SupportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tickets = useMyTickets();

  if (params.tab === 'centre') return <Redirect href="/support/contacts" />;

  const list = asTickets(tickets.data);
  const loaded = !!tickets.data || list.length > 0;
  const loading = !loaded && tickets.isLoading;
  const failed = !loaded && !loading && tickets.isError;
  const openN = list.filter((t) => isOpenStatus(t.status)).length;
  const approvalN = list.filter((t) => t.status === 'pending_approval').length;
  const preview = openFirst(list).slice(0, PREVIEW);
  const seeAll = () => router.push('/support/requests');

  return (
    <Screen header={<NavHeader title="Help & support" />} onRefresh={() => tickets.refetch()}>
      {/* 1 · State + the one action; the action is there in every state. */}
      <SummaryHero
        icon={LifeBuoy}
        module="support"
        label="Open requests"
        onArrowPress={list.length ? seeAll : undefined}
        arrowLabel="See all my help requests"
        value={loaded ? openN : undefined}
        unit={openN === 1 ? 'request' : 'requests'}
        figure={loading ? <Skeleton width={120} height={48} radius={radius.sm} /> : failed ? null : undefined}
        info={approvalN ? { label: 'Waiting for approval', value: String(approvalN) } : undefined}
        sub={loaded ? (list.length ? (openN ? undefined : 'Nothing open. Everything you raised is closed.') : 'Ask IT for help, request equipment or raise a complaint.') : undefined}
        action={{ title: 'Raise a request', icon: <Plus />, onPress: () => router.push('/support/new') }}
      />

      {/* 2 · One Screen slot for every state, so the entrance plays once (§12). */}
      {list.length ? (
        <ActivityList
          title="My help requests"
          onSeeAll={list.length > PREVIEW ? seeAll : undefined}
          seeAllAccessibilityLabel="See all my help requests">
          {preview.map((t, i) => (
            <SupportRequestRow key={t.id ?? i} t={t} onPress={() => router.push(`/support/${encodeURIComponent(t.id)}`)} />
          ))}
        </ActivityList>
      ) : loading ? (
        <ActivityList title="My help requests" loading loadingRows={3} />
      ) : failed ? (
        <ErrorState message={tickets.error?.message ?? ''} onRetry={() => void tickets.refetch()} />
      ) : (
        <EmptyState icon={<LifeBuoy color={palette.textMuted} />} title="No requests yet" message="What you raise shows up here, with where it stands." />
      )}

      {/* 3 · Wi-Fi and who to call. */}
      <ListCard>
        <ListRow
          left={<ModuleBadge module="support" icon={Wifi} />}
          title="Wi-Fi & contacts"
          subtitle="Branch Wi-Fi and who to call"
          subtitleLines={2}
          chevron
          onPress={() => router.push('/support/contacts')}
        />
      </ListCard>
    </Screen>
  );
}
