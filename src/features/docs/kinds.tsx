// /admin/docs/<kind>: one screen per document (features/docs/access DOC_GATES has the gates).

import { Redirect } from 'expo-router';

import { AssetPdfScreen, AuditPdfScreen, BountyPdfScreen } from '@/features/docs/screens-admin';
import { PettyStatementPdfScreen, VendorMasterPdfScreen, VendorSummaryPdfScreen } from '@/features/docs/screens-money';
import { ReviewsPdfScreen, SchedulePdfScreen, TimesheetPdfScreen } from '@/features/docs/screens-team';

export function DocKindScreen({ kind, params }: { kind: string; params: Record<string, string | undefined> }) {
  switch (kind) {
    case 'reviews':
      return <ReviewsPdfScreen person={params.person} />;
    case 'schedule':
      return <SchedulePdfScreen />;
    case 'timesheet':
      return <TimesheetPdfScreen />;
    case 'bounty':
      return <BountyPdfScreen />;
    case 'audit':
      return <AuditPdfScreen />;
    case 'asset':
      return <AssetPdfScreen id={params.id} />;
    case 'vendors':
      return <VendorMasterPdfScreen />;
    case 'vendor':
      return <VendorSummaryPdfScreen id={params.id} />;
    case 'petty':
      return <PettyStatementPdfScreen batchId={params.batchId} requestId={params.request} />;
    default:
      return <Redirect href="/admin/docs" />;
  }
}
