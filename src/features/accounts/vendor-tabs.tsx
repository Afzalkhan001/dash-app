// An approved vendor's Bills and Agreements tabs (dash.html:25291 VendorMasterBillsTab, :25230
// VendorMasterAgreementsTab), simplified for a phone (PLAN §1.3): four figures that filter the list, one
// chart of what was billed each month, and the bills; then the vendor's agreements. The per-code and
// per-person breakdowns stay on the website.

import { useRouter } from 'expo-router';
import { FileSignature, FileText } from 'lucide-react-native';
import { useState } from 'react';

import { type AccountsBill, fetchBillFile, useAgreements, useVendorBills } from '@/api/accounts';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { billAmount, billStage } from '@/features/accounts/model';
import { FileSheet, type FileLoad } from '@/features/accounts/ui';
import { agreementStatus } from '@/features/accounts/vendor-format';
import { rowMoney, shortDate } from '@/features/petty-cash/logic';
import { billStatus } from '@/features/vendor/constants';
import { MONTHS, MONTHS_LONG } from '@/lib/dates';
import { inrCompact, plural } from '@/lib/format';
import { palette } from '@/theme/tokens';
import { ActivityList, ActivityRow, EmptyState, ErrorState, PillBarChart, SkeletonList, StatGrid, StatTile } from '@/ui';

type Kpi = 'all' | 'approved' | 'waiting' | 'rejected';
const WAITING = ['pending_keka_approval', 'pending_keka_reapproval', 'pending_accounts_approval'];
const APPROVED = ['accepted', 'payment_processing', 'received', 'not_received'];
const REJECTED = ['rejected_keka', 'rejected_accounts'];
const inKpi = (b: AccountsBill, k: Kpi) => k === 'all' || (k === 'approved' ? APPROVED : k === 'waiting' ? WAITING : REJECTED).includes(b.status);
const amountOf = (b: AccountsBill) => Number(b.version?.amount) || 0;

export function VendorBillsTab({ vendorId, pocEmail }: { vendorId: string; pocEmail?: string }) {
  const router = useRouter();
  const today = useTodayIst();
  const q = useVendorBills(vendorId);
  const [kpi, setKpi] = useState<Kpi>('all');
  const [file, setFile] = useState<FileLoad | null>(null);
  if (q.isPending) return <SkeletonList rows={4} avatar />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message || 'Couldn’t load the bills.'} onRetry={() => void q.refetch()} />;
  const bills = q.data ?? [];
  if (!bills.length) return <EmptyState icon={<FileText color={palette.textMuted} strokeWidth={1.8} />} title="No bills yet" message="Bills sent for this vendor show up here." />;

  const tile = (k: Kpi, label: string) => {
    const list = bills.filter((b) => inKpi(b, k));
    return <StatTile key={k} label={label} value={list.length} caption={inrCompact(list.reduce((s, b) => s + amountOf(b), 0))} onPress={() => setKpi(k === kpi ? 'all' : k)} />;
  };
  // Billed per month, the last 6 months (India time).
  const ym = today.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = ym.split('-').map(Number) as [number, number];
    const t = y * 12 + (m - 1) - (5 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  });
  const perMonth = months.map((mo) => bills.filter((b) => String(b.created_at).slice(0, 7) === mo).reduce((s, b) => s + amountOf(b), 0));
  const shown = bills.filter((b) => inKpi(b, kpi));

  return (
    <>
      <StatGrid columns={2}>
        {[tile('all', 'Sent'), tile('approved', 'Approved'), tile('waiting', 'Waiting'), tile('rejected', 'Rejected')]}
      </StatGrid>
      <PillBarChart
        values={perMonth}
        labels={months.map((mo) => (MONTHS[Number(mo.slice(5, 7)) - 1] ?? '').charAt(0))}
        spokenLabels={months.map((mo) => `${MONTHS_LONG[Number(mo.slice(5, 7)) - 1] ?? ''} ${mo.slice(0, 4)}`)}
        formatValue={(v) => inrCompact(v)}
        value={inrCompact(perMonth.reduce((s, v) => s + v, 0))}
        caption="Billed in the last 6 months"
        accessibilityLabel="Billed each month"
      />
      <ActivityList title={kpi === 'all' ? plural(shown.length, 'bill') : `${plural(shown.length, 'bill')} · filtered`} empty="No bills in this group.">
        {shown.map((b) => {
          const st = billStatus(b.status);
          const stage = billStage(b);
          return (
            <ActivityRow
              key={b.id}
              module="vendor"
              icon={FileText}
              title={b.version?.description || 'Bill'}
              subtitle={[b.keka_code, b.is_advance ? 'Vendor advance' : null].filter(Boolean).join(' · ') || null}
              note={`${shortDate(b.created_at, today)} · ${b.submitted_by_name || '—'}${pocEmail && b.submitted_by_email === pocEmail ? ' (their Tamada contact)' : ''}`}
              value={rowMoney(billAmount(b) || amountOf(b))}
              status={{ label: st.label, tone: st.tone }}
              chevron
              onPress={() =>
                stage
                  ? router.push({ pathname: '/admin/accounts/item/[type]/[id]', params: { type: 'bill', id: b.id } })
                  : b.version?.id
                    ? setFile({ title: b.version.file_name || 'Bill', load: () => fetchBillFile(b.version!.id) })
                    : undefined
              }
            />
          );
        })}
      </ActivityList>
      <FileSheet file={file} onClose={() => setFile(null)} />
    </>
  );
}

export function VendorAgreementsTab({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const today = useTodayIst();
  const now = useNow();
  const q = useAgreements({ vendorId });
  if (q.isPending) return <SkeletonList rows={3} avatar />;
  if (q.isError && !q.data) return <ErrorState message={q.error?.message || 'Couldn’t load the agreements.'} onRetry={() => void q.refetch()} />;
  const rows = q.data?.agreements ?? [];
  if (!rows.length) return <EmptyState icon={<FileSignature color={palette.textMuted} strokeWidth={1.8} />} title="No agreements yet" message="Agreements are drafted on the DASH website for now." />;
  return (
    <ActivityList title={plural(rows.length, 'agreement')}>
      {rows.map((a) => {
        const st = agreementStatus(a, now);
        return (
          <ActivityRow
            key={a.id}
            module="vendor"
            icon={FileSignature}
            title={a.project_name}
            subtitle={[a.keka_code, a.created_by_name ? `By ${a.created_by_name}` : null].filter(Boolean).join(' · ') || null}
            note={a.status === 'pending_signature' && a.deadline_at ? `Sign by ${shortDate(a.deadline_at, today)}` : null}
            status={{ label: st.label, tone: st.tone }}
            chevron
            onPress={() => router.push({ pathname: '/admin/accounts/agreements/[id]', params: { id: a.id } })}
          />
        );
      })}
    </ActivityList>
  );
}
