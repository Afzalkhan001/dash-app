// /portal/bills/[id] — one bill, state first: the amount, its status and one plain line on where the
// money stands; then the attached bill file (GET /vendor/bills/versions/:versionId/file); then the
// progress timeline. Layout (docs/REFERENCE-COMPONENTS.md §3, detail): NavHeader, Payno's light
// SummaryHero (the bill's icon and description, the amount with greyed paise, the status pill and
// the plain line), then frosted cards for the file and the progress. The vendor API only lists bills, so the bill comes from that list. Payment
// dates/references are not part of the vendor's view of a bill (vendor_bills.js forVendorBill strips
// them), so payment is described by its status.

import { useLocalSearchParams } from 'expo-router';
import { HandCoins, Receipt } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useVendorBills, useVendorMe } from '@/api/vendor';
import { billStatus } from '@/features/vendor/constants';
import { FileRow, type FileSource, FileViewerSheet } from '@/features/vendor/files';
import { dateIN, fileSize } from '@/features/vendor/format';
import { billTimeline, Timeline } from '@/features/vendor/timeline';
import { SectionCard } from '@/features/vendor/ui';
import { palette, radius, space } from '@/theme/tokens';
import { Banner, EmptyState, ErrorState, NavHeader, Screen, Skeleton, SkeletonList, StatusPill, SummaryHero, Text, useLayout } from '@/ui';

// Where the money stands, in one line (rejected bills get the notice below instead).
function paymentNote(status: string, projectApprovalNeeded: boolean) {
  switch (status) {
    case 'pending_keka_approval':
    case 'pending_keka_reapproval':
      return 'Waiting for the project owner to approve it.';
    case 'pending_accounts_approval':
      return projectApprovalNeeded ? 'Approved by the project. Waiting for Accounts.' : 'Waiting for Accounts to approve it.';
    case 'accepted':
      return 'Approved. Accounts will start the payment soon.';
    case 'payment_processing':
      return 'Accounts has started the payment.';
    case 'received':
      return 'Paid. The payment was confirmed as received.';
    case 'not_received':
      return 'Reported as not received. Accounts is checking.';
    default:
      return '';
  }
}

export default function VendorBillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gap } = useLayout();
  const me = useVendorMe();
  const approved = me.data?.status === 'approved';
  const q = useVendorBills(approved);
  const [viewing, setViewing] = useState<FileSource | null>(null);
  const bill = (Array.isArray(q.data) ? q.data : []).find((b) => !!b && b.id === id);
  const amount = Number(bill?.version?.amount || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const st = billStatus(bill?.status ?? '');
  const rejected = bill?.status === 'rejected_keka' || bill?.status === 'rejected_accounts';
  const version = bill?.version;
  // Matches the timeline: when no project approval was needed, don't say the project approved it.
  const note = paymentNote(bill?.status ?? '', version?.keka_approval_required !== false);
  const fileMeta = version
    ? [version.mime_type === 'application/pdf' ? 'PDF' : version.mime_type?.startsWith('image/') ? 'Image' : '', fileSize(version.file_size)].filter(Boolean).join(' · ')
    : '';

  return (
    <>
      <Screen
        header={<NavHeader title={bill?.is_advance ? 'Vendor advance' : 'Bill'} />}
        onRefresh={() => Promise.all([me.refetch(), ...(approved ? [q.refetch()] : [])])}>
        {me.isPending || (approved && q.isPending) ? (
          <View style={{ gap }}>
            <Skeleton height={220} radius={radius.xxl} />
            <SkeletonList rows={1} />
            <Skeleton height={300} radius={radius.xl} />
          </View>
        ) : me.isError && !me.data ? (
          <ErrorState message={me.error?.message ?? 'Could not load your account.'} onRetry={() => void me.refetch()} />
        ) : !approved ? (
          <EmptyState icon={<Receipt color={palette.textMuted} />} title="Bills open after approval" message="Once you’re approved, bills raised for you show here." />
        ) : q.isError ? (
          <ErrorState message={q.error?.message ?? 'Could not load this bill.'} onRetry={() => void q.refetch()} />
        ) : !bill ? (
          <EmptyState icon={<Receipt color={palette.textMuted} />} title="Bill not found" message="It may have been removed. Pull down to refresh." />
        ) : (
          <View style={{ gap }}>
            <SummaryHero
              icon={bill.is_advance ? HandCoins : Receipt}
              module="pay"
              label={`Submitted ${dateIN(bill.created_at)}`}
              value={safeAmount}
              currency="₹"
              decimals={2}>
              <View style={{ gap: space.xs }}>
                {/* The header already says Bill or Vendor advance; the description reads in full here. */}
                {bill.version?.description ? <Text variant="body">{bill.version.description}</Text> : null}
                <StatusPill label={st.label} tone={st.tone} style={{ alignSelf: 'flex-start' }} />
                {note && !rejected ? (
                  <Text variant="label" muted>
                    {note}
                  </Text>
                ) : null}
              </View>
            </SummaryHero>

            {rejected ? (
              <Banner tone="danger" title="Rejected" message="The Tamada team member who sent it will upload a corrected bill. Nothing to do for you." />
            ) : null}

            {version?.file_name ? (
              <SectionCard title="Bill file">
                <FileRow
                  name={version.file_name}
                  meta={fileMeta || undefined}
                  onPress={() => setViewing({ kind: 'bill', versionId: version.id, title: version.file_name || 'Bill' })}
                />
              </SectionCard>
            ) : null}

            <SectionCard title="Progress">
              <Timeline steps={billTimeline(bill)} />
            </SectionCard>
          </View>
        )}
      </Screen>
      <FileViewerSheet source={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
