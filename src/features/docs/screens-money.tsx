// Money documents: the petty cash Statement of Expenses, the Vendor master list and one vendor's summary.

import { Redirect } from 'expo-router';
import { ReceiptText, Store, Users } from 'lucide-react-native';
import { useState } from 'react';

import { useAccountsVendor, useAccountsVendors } from '@/api/accounts';
import { usePettyCashOverview, usePettyCashStatement } from '@/api/petty-cash';
import { useTodayIst } from '@/features/attendance/use-now';
import { checkLabel } from '@/features/accounts/vendor-format';
import { canPettyStatementPdf, canVendorMasterPdf, canVendorSummaryPdf } from '@/features/docs/access';
import { DocScreen } from '@/features/docs/doc-screen';
import { pdfDate, pettyStatementHtml, vendorMasterDoc, vendorSummaryDoc } from '@/features/docs/templates';
import { inr, plural } from '@/lib/format';
import { letterheadOf } from '@/lib/pdf';
import { useAccess } from '@/lib/use-access';
import { PillField, SelectField } from '@/ui';

// ── Petty cash statement ─────────────────────────────────────────────────────
export function PettyStatementPdfScreen({ batchId, requestId }: { batchId?: string; requestId?: string }) {
  const access = useAccess();
  const today = useTodayIst();
  const allowed = canPettyStatementPdf(access);
  const overview = usePettyCashOverview(allowed && !batchId && !requestId);
  const batches = [...new Map((overview.data?.subs ?? []).filter((s) => !!s.batchId).map((s) => [s.batchId!, s])).values()].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  );
  const [pick, setPick] = useState('');
  const chosen = batchId || pick || batches[0]?.batchId || '';
  const q = usePettyCashStatement(allowed ? chosen : '', allowed ? requestId : undefined);
  if (!allowed) return <Redirect href="/" />;

  const st = q.data;
  const total = (st?.statements ?? []).reduce((n, s) => n + (Number(s.total) || 0), 0);
  const doc = st ? { html: pettyStatementHtml(st, letterheadOf(access.tenant)), fileName: `Statement_of_Expenses_${chosen || requestId || today}`, title: 'Statement of Expenses' } : null;
  const listLoading = !batchId && !requestId && overview.isPending;
  return (
    <DocScreen
      title="Statement of expenses"
      icon={ReceiptText}
      module="pettyCash"
      heroLabel={st ? st.employee?.name || 'Statement' : 'Petty cash bills'}
      value={st ? total : undefined}
      currency="₹"
      unit="in bills"
      sub={st ? plural(st.statements?.length ?? 0, 'project code') : undefined}
      loading={listLoading || ((!!chosen || !!requestId) && q.isPending)}
      error={q.isError && !q.data ? q.error?.message || 'Couldn’t load the statement.' : null}
      onRetry={() => void q.refetch()}
      onRefresh={() => Promise.all([q.refetch(), overview.refetch()])}
      empty={!chosen && !requestId && !listLoading ?{ title: 'No bills submitted yet', message: 'Statements appear here once you submit petty cash bills.' } : null}
      controls={
        !batchId && !requestId && batches.length > 1 ? (
          <SelectField
            label="Submission"
            value={chosen}
            options={batches.map((s) => ({ value: s.batchId!, label: [pdfDate(s.createdAt), s.kekaCode || s.projectName, inr(s.amount)].filter(Boolean).join(' · ') }))}
            onChange={setPick}
          />
        ) : null
      }
      doc={doc}
    />
  );
}

// ── Vendor master ────────────────────────────────────────────────────────────
export function VendorMasterPdfScreen() {
  const access = useAccess();
  const today = useTodayIst();
  const allowed = canVendorMasterPdf(access);
  const [text, setText] = useState('');
  const [now] = useState(() => new Date());
  const q = useAccountsVendors({ status: 'approved' }, allowed);
  if (!allowed) return <Redirect href="/" />;

  const needle = text.trim().toLowerCase();
  const rows = (q.data ?? []).filter((v) => !needle || [v.legalEntityName, v.tradeName, v.vendorCode, v.contactPerson, v.pan, v.gstin].some((x) => String(x || '').toLowerCase().includes(needle)));
  const doc = q.data ? vendorMasterDoc({ rows, filterText: text.trim(), letterhead: letterheadOf(access.tenant), today, now, by: access.user?.name }) : null;
  return (
    <DocScreen
      title="Vendor master PDF"
      icon={Users}
      module="vendor"
      heroLabel="Approved vendors"
      value={q.data ? rows.length : undefined}
      unit={rows.length === 1 ? 'vendor' : 'vendors'}
      sub="Bank details are left out, as on the website."
      loading={q.isPending}
      error={q.isError && !q.data ? q.error?.message || 'Couldn’t load the vendors.' : null}
      onRetry={() => void q.refetch()}
      onRefresh={() => q.refetch()}
      controls={<PillField value={text} onChangeText={setText} placeholder="Filter by name, code, PAN or GSTIN" accessibilityLabel="Filter vendors" />}
      note="Confidential: vendor tax details."
      doc={doc}
    />
  );
}

// ── One vendor ───────────────────────────────────────────────────────────────
export function VendorSummaryPdfScreen({ id }: { id?: string }) {
  const access = useAccess();
  const allowed = canVendorSummaryPdf(access);
  const list = useAccountsVendors({ status: 'approved' }, allowed && !id);
  const [pick, setPick] = useState(id || '');
  const chosen = id || pick || list.data?.[0]?.id || '';
  const q = useAccountsVendor(chosen, allowed && !!chosen);
  if (!allowed) return <Redirect href="/" />;

  const v = q.data;
  const doc = v ? vendorSummaryDoc(v, { letterhead: letterheadOf(access.tenant), showAccount: false, by: access.user?.name, checkLabel }) : null;
  return (
    <DocScreen
      title="Vendor summary"
      icon={Store}
      module="vendor"
      heroLabel={v ? v.business.legalEntityName : 'Vendor'}
      value={v ? (v.documents ?? []).filter((d) => !d.superseded).length : undefined}
      unit="documents on file"
      sub={v?.vendorCode ? `Vendor ID ${v.vendorCode}` : undefined}
      loading={(!id && list.isPending) || (!!chosen && q.isPending)}
      error={q.isError && !q.data ? q.error?.message || 'Couldn’t load the vendor.' : null}
      onRetry={() => void q.refetch()}
      onRefresh={() => q.refetch()}
      empty={!chosen && !list.isPending ? { title: 'No approved vendors yet' } : null}
      controls={
        !id && (list.data?.length ?? 0) > 1 ? (
          <SelectField label="Vendor" value={chosen} options={(list.data ?? []).map((x) => ({ value: x.id, label: [x.legalEntityName, x.vendorCode].filter(Boolean).join(' · ') }))} onChange={setPick} />
        ) : null
      }
      note="The account number stays masked. Documents are opened one by one from the vendor."
      doc={doc}
    />
  );
}
