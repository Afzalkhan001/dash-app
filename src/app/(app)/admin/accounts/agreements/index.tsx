// Vendor agreements — the website's AgreementsSignTab (dash.html:34511). Drafting is the docs domain's
// agreements/new (header + action, integrator pass 3):
//   1. "Waiting for your signature": agreements the vendor signed that name you as the countersigner;
//   2. the company's agreements (Accounts and the super admin oversee them all) or the ones you drafted,
//      with a status filter and a project code filter. Rows open the agreement (draft, signatures,
//      Extend deadline, Countersign).

import { Redirect, useRouter } from 'expo-router';
import { FilePlus2, FileSignature, PenLine } from 'lucide-react-native';
import { useState } from 'react';

import { useAgreements, useBillVendors, usePendingMySignature } from '@/api/accounts';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { canSeeAgreements } from '@/features/accounts/access';
import { canDraftAgreement } from '@/features/docs/access';
import { agreementExpired, agreementStatus } from '@/features/accounts/vendor-format';
import { shortDate } from '@/features/petty-cash/logic';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { palette } from '@/theme/tokens';
import { ActivityList, ActivityRow, Banner, Chip, ChipRow, EmptyState, ErrorState, NavHeader, Screen, SelectField, SkeletonList, SummaryHero } from '@/ui';

type Filter = 'all' | 'vendor' | 'expired' | 'countersign' | 'signed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'vendor', label: 'Waiting for the vendor' },
  { key: 'expired', label: 'Deadline passed' },
  { key: 'countersign', label: 'Waiting for countersign' },
  { key: 'signed', label: 'Signed' },
];

export default function AgreementsScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const now = useNow();
  const allowed = canSeeAgreements(access);
  const [filter, setFilter] = useState<Filter>('all');
  const [code, setCode] = useState('');
  const listQ = useAgreements(code ? { kekaCode: code } : {}, allowed);
  const allQ = useAgreements({}, allowed);
  const pendingQ = usePendingMySignature(allowed);
  const vendorsQ = useBillVendors(allowed);

  if (!allowed) return <Redirect href="/" />;

  const vendors = new Map((vendorsQ.data ?? []).map((v) => [v.id, v.legalEntityName]));
  const rows = listQ.data?.agreements ?? [];
  const isOverseer = !!listQ.data?.isOverseer;
  const mine = pendingQ.data ?? [];
  const codes = [...new Set((allQ.data?.agreements ?? []).map((a) => a.keka_code || '').filter(Boolean))].sort();
  const test = (k: Filter, a: (typeof rows)[number]) =>
    k === 'all' ||
    (k === 'vendor' && a.status === 'pending_signature' && !agreementExpired(a, now)) ||
    (k === 'expired' && agreementExpired(a, now)) ||
    (k === 'countersign' && a.status === 'pending_internal_signature') ||
    (k === 'signed' && a.status === 'signed');
  const shown = rows.filter((a) => test(filter, a));
  const open = (id: string) => router.push({ pathname: '/admin/accounts/agreements/[id]', params: { id } });

  return (
    <Screen
      header={
        <NavHeader
          title="Vendor agreements"
          actions={canDraftAgreement(access) ? [{ key: 'new', icon: FilePlus2, label: 'New agreement', onPress: () => router.push('/admin/accounts/agreements/new') }] : undefined}
        />
      } onRefresh={() => Promise.all([listQ.refetch(), pendingQ.refetch(), allQ.refetch()])}>
      <SummaryHero
        icon={FileSignature}
        module="vendor"
        label={isOverseer ? 'Company agreements' : 'Agreements you drafted'}
        value={listQ.data ? rows.length : undefined}
        unit={rows.length === 1 ? 'agreement' : 'agreements'}
        info={mine.length ? { label: 'Waiting for your signature', value: String(mine.length) } : undefined}
        sub={canDraftAgreement(access) ? "Draft a new one with the + at the top." : undefined}
      />

      {pendingQ.isError && !pendingQ.data ? <Banner tone="warning" title="Couldn’t check what waits for your signature" message={pendingQ.error?.message} /> : null}
      {mine.length ? (
        <ActivityList title="Waiting for your signature">
          {mine.map((a) => (
            <ActivityRow
              key={a.id}
              module="vendor"
              icon={PenLine}
              title={a.project_name}
              subtitle={vendors.get(a.vendor_id) || 'Vendor'}
              note={[a.signed_at ? `Vendor signed ${shortDate(a.signed_at, today)}` : null, a.created_by_name ? `By ${a.created_by_name}` : null].filter(Boolean).join(' · ') || null}
              status={{ label: 'Sign', tone: 'pending' }}
              chevron
              onPress={() => open(a.id)}
            />
          ))}
        </ActivityList>
      ) : null}

      <ChipRow>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} count={rows.filter((a) => test(f.key, a)).length} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ChipRow>
      {codes.length ? <SelectField label="Project code" value={code} options={[{ value: '', label: 'Every project code' }, ...codes.map((c) => ({ value: c, label: c }))]} onChange={setCode} /> : null}

      {listQ.isPending ? (
        <SkeletonList rows={4} avatar />
      ) : listQ.isError && !listQ.data ? (
        <ErrorState message={listQ.error?.message || 'Couldn’t load the agreements.'} onRetry={() => void listQ.refetch()} />
      ) : shown.length ? (
        <ActivityList title={plural(shown.length, 'agreement')}>
          {shown.map((a) => {
            const st = agreementStatus(a, now);
            return (
              <ActivityRow
                key={a.id}
                module="vendor"
                icon={FileSignature}
                title={a.project_name}
                subtitle={[vendors.get(a.vendor_id) || 'Vendor', a.keka_code].filter(Boolean).join(' · ')}
                note={[a.status === 'pending_signature' && a.deadline_at ? `Sign by ${shortDate(a.deadline_at, today)}` : null, a.created_by_name ? `By ${a.created_by_name}` : null].filter(Boolean).join(' · ') || null}
                status={{ label: st.label, tone: st.tone }}
                chevron
                onPress={() => open(a.id)}
              />
            );
          })}
        </ActivityList>
      ) : (
        <EmptyState
          icon={<FileSignature color={palette.textMuted} strokeWidth={1.8} />}
          title="No agreements here"
          message={code || filter !== 'all' ? 'Nothing matches this filter.' : 'Agreements you or Accounts draft show up here.'}
        />
      )}
    </Screen>
  );
}
