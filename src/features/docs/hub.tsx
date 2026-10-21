// /admin/docs: every document this person can make on the phone — the website's PDF exports, each behind
// the website's own gate (features/docs/access) — plus "Draft an agreement" and the signed copies of
// vendor agreements they can open.

import { Redirect, useRouter } from 'expo-router';
import { CalendarDays, ClipboardList, Coins, FilePlus2, FileSearch, FileSignature, FileText, Laptop, ReceiptText, Store, Timer, Users, Wallet } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Platform } from 'react-native';

import { useAgreements } from '@/api/accounts';
import { useNow, useTodayIst } from '@/features/attendance/use-now';
import { agreementStatus } from '@/features/accounts/vendor-format';
import { useCountersigned, withCountersigned } from '@/features/docs/countersigned';
import { shareLabel } from '@/features/docs/doc-screen';
import { canDraftAgreement, canSeeDocsHub, canSignedCopy, DOC_GATES, type DocKind } from '@/features/docs/access';
import { shortDate } from '@/features/petty-cash/logic';
import { useAccess } from '@/lib/use-access';
import type { ModuleKey } from '@/theme/tokens';
import { ActivityList, ActivityRow, NavHeader, Screen, SummaryHero } from '@/ui';

type Entry = { kind: DocKind | 'payslip'; label: string; sub: string; icon: LucideIcon; module: ModuleKey; href: string };

const ENTRIES: Entry[] = [
  { kind: 'timesheet', label: 'My timesheet', sub: 'Tasks, bookings and timesheet hours for any dates', icon: Timer, module: 'timesheets', href: '/admin/docs/timesheet' },
  { kind: 'petty', label: 'Petty cash expense report', sub: 'The expense report for petty cash bills you sent', icon: ReceiptText, module: 'pettyCash', href: '/admin/docs/petty' },
  { kind: 'payslip', label: 'Payslips', sub: 'Each payslip has its own PDF under Me › Pay', icon: Wallet, module: 'pay', href: '/pay/payslips' },
  { kind: 'schedule', label: 'Tomorrow’s schedule', sub: 'Your team’s work and bookings for tomorrow', icon: CalendarDays, module: 'tasks', href: '/admin/docs/schedule' },
  { kind: 'reviews', label: 'Reviews still owed', sub: 'Reviews an employee still owes, by professional', icon: ClipboardList, module: 'tasks', href: '/admin/docs/reviews' },
  { kind: 'bounty', label: 'Bounty report', sub: 'Every coin added, given, held and paid', icon: Coins, module: 'bounty', href: '/admin/docs/bounty' },
  { kind: 'audit', label: 'Audit report', sub: 'User activity for the dates you pick', icon: FileSearch, module: 'security', href: '/admin/docs/audit' },
  { kind: 'asset', label: 'Asset report', sub: 'One asset and who had it when', icon: Laptop, module: 'support', href: '/admin/docs/asset' },
  { kind: 'vendors', label: 'Vendor master', sub: 'Every approved vendor, without bank details', icon: Users, module: 'vendor', href: '/admin/docs/vendors' },
  { kind: 'vendor', label: 'Vendor summary', sub: 'One vendor’s record, account number masked', icon: Store, module: 'vendor', href: '/admin/docs/vendor' },
];

export function DocsHubScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const now = useNow();
  const allowed = canSeeDocsHub(access);
  const signed = canSignedCopy(access);
  const agreementsQ = useAgreements({}, allowed && signed);
  const keptQ = useCountersigned(allowed && signed);
  if (!allowed) return <Redirect href="/" />;

  const entries = ENTRIES.filter((e) => (e.kind === 'payslip' ? access.sections.pay : DOC_GATES[e.kind](access)));
  const docCount = entries.length + (canDraftAgreement(access) ? 1 : 0);
  const copies = withCountersigned(agreementsQ.data?.agreements ?? [], keptQ.data)
    .filter((a) => !!a.signed_at)
    .sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')))
    .slice(0, 8);
  const go = (href: string) => router.push(href as never);

  return (
    <Screen header={<NavHeader title="Documents" />} onRefresh={() => Promise.all([agreementsQ.refetch(), keptQ.refetch()])}>
      <SummaryHero icon={FileText} module="policies" label="PDFs you can make" value={docCount} unit={docCount === 1 ? 'document' : 'documents'} sub={`Each one opens a preview first, then ${Platform.OS === 'web' ? shareLabel : `${shareLabel} or Print`}.`} />
      {canDraftAgreement(access) ? (
        <ActivityList title="Agreements">
          <ActivityRow
            module="vendor"
            icon={FilePlus2}
            title="Draft an agreement"
            subtitle="Upload the PDF, mark where to sign, send it to the vendor"
            chevron
            onPress={() => go('/admin/accounts/agreements/new')}
          />
        </ActivityList>
      ) : null}
      <ActivityList title="Reports">
        {entries.map((e) => (
          <ActivityRow key={e.kind} module={e.module} icon={e.icon} title={e.label} subtitle={e.sub} chevron onPress={() => go(e.href)} />
        ))}
      </ActivityList>
      {signed && copies.length ? (
        <ActivityList title="Signed agreements">
          {copies.map((a) => {
            const st = agreementStatus(a, now);
            return (
              <ActivityRow
                key={a.id}
                module="vendor"
                icon={FileSignature}
                title={a.project_name}
                subtitle={a.keka_code || 'Agreement'}
                note={a.signed_at ? `Vendor signed ${shortDate(a.signed_at, today)}` : null}
                status={{ label: st.label, tone: st.tone }}
                chevron
                onPress={() => router.push({ pathname: '/admin/docs/agreement/[id]', params: { id: a.id } })}
              />
            );
          })}
        </ActivityList>
      ) : null}
    </Screen>
  );
}
