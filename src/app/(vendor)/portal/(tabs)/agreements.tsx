// Agreements — the website's VendorAgreementsSection (dash.html ~32652): "To sign" (open ones first,
// then the ones whose deadline has passed) and "Signed". An agreement whose internal countersignature
// is still to come reads as Signed from the vendor's side. A section with nothing in it is hidden.
// Tapping one opens /portal/agreements/[id] to read, sign or open it.
// Layout (docs/REFERENCE-COMPONENTS.md §3): the tab-root bar (centred "Agreements"); while something can
// still be signed, Payno's light SummaryHero says how many and the nearest deadline, with "Read and
// sign" as its one primary pill (it opens the most urgent one); then each section is an ActivityList.
// "To sign" rows keep their pill (To sign / Expired tells them apart); "Signed" rows don't repeat it.

import { useRouter } from 'expo-router';
import { FileSignature } from 'lucide-react-native';
import { View } from 'react-native';

import { useVendorAgreements, useVendorMe } from '@/api/vendor';
import { useNow } from '@/features/attendance/use-now';
import { agreementExpired, agreementPending, agreementSigned } from '@/features/vendor/constants';
import { dateTimeIN } from '@/features/vendor/format';
import { AgreementRow } from '@/features/vendor/rows';
import { palette, radius } from '@/theme/tokens';
import { ActivityList, EmptyState, ErrorState, Screen, Skeleton, SkeletonList, SummaryHero, TabRootHeader, useLayout } from '@/ui';

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

export default function VendorAgreements() {
  const router = useRouter();
  const now = useNow();
  const { gap } = useLayout();
  const me = useVendorMe();
  const approved = me.data?.status === 'approved';
  const q = useVendorAgreements(approved);
  const list = (Array.isArray(q.data) ? q.data : []).filter(Boolean);
  // Open ones first, then the ones whose deadline has passed.
  const pending = list.filter(agreementPending).sort((a, b) => Number(agreementExpired(a, now)) - Number(agreementExpired(b, now)));
  const signed = list.filter(agreementSigned);
  // What can still be signed, the nearest deadline first (no deadline last).
  const open = pending.filter((a) => !agreementExpired(a, now)).sort((a, b) => time(a.deadline_at) - time(b.deadline_at));
  const next = open[0];
  const go = (id: string) => router.push(`/portal/agreements/${id}`);

  const refresh = () => Promise.all([me.refetch(), ...(approved ? [q.refetch()] : [])]);

  return (
    <Screen withTabBar onRefresh={refresh} header={<TabRootHeader overline="Vendor portal" title="Agreements" />}>
      {me.isPending || (approved && q.isPending) ? (
        <View style={{ gap }}>
          <Skeleton height={220} radius={radius.xxl} />
          <SkeletonList rows={3} avatar tone="surface" />
        </View>
      ) : me.isError && !me.data ? (
        <ErrorState message={me.error?.message ?? 'Could not load your account.'} onRetry={() => void me.refetch()} />
      ) : !approved ? (
        <EmptyState
          icon={<FileSignature color={palette.textMuted} />}
          title="Agreements open after approval"
          message="Once you’re approved, agreements to sign show here."
        />
      ) : q.isError ? (
        <ErrorState message={q.error?.message ?? 'Could not load your agreements.'} onRetry={() => void q.refetch()} />
      ) : !pending.length && !signed.length ? (
        <EmptyState icon={<FileSignature color={palette.textMuted} />} title="No agreements yet" message="Agreements sent to you for signing show here." />
      ) : (
        <View style={{ gap }}>
          {next ? (
            <SummaryHero
              icon={FileSignature}
              module="vendor"
              label="Waiting for your signature"
              value={open.length}
              unit={open.length === 1 ? 'agreement' : 'agreements'}
              sub={next.deadline_at ? `Next deadline • ${dateTimeIN(next.deadline_at)}` : 'No signing deadline'}
              action={{ title: open.length === 1 ? 'Read and sign' : 'Sign the next one', icon: <FileSignature />, onPress: () => go(next.id) }}
            />
          ) : null}

          {pending.length ? (
            <ActivityList title="To sign">
              {pending.map((a) => (
                <AgreementRow key={a.id} agreement={a} now={now} onPress={() => go(a.id)} />
              ))}
            </ActivityList>
          ) : null}

          {signed.length ? (
            <ActivityList title="Signed">
              {/* No "Signed" pill: the title and each row's "Signed Mon, 12 Aug" already say it. */}
              {signed.map((a) => (
                <AgreementRow key={a.id} agreement={a} now={now} showStatus={false} onPress={() => go(a.id)} />
              ))}
            </ActivityList>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
