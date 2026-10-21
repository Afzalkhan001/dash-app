// Everyone's petty cash expense reports — the admin side of the website's Tracking board
// (dash.html:17613): every bill submission in the company (GET /petty_cash_bill_submissions), grouped
// into the expense reports they were sent as, newest first. Filters: from / to date, project, employee.
// A row opens the expense report, where Accounts can reject a single bill.
// The website first calls POST /petty_cash_bill_submissions/reconcile (a write on read that raises the
// viewer's own missing extra claims); that self-heal is not done here.

import { Redirect, useRouter } from 'expo-router';
import { FileSpreadsheet, SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type SubmissionFilters, useAllSubmissions } from '@/api/accounts';
import type { PettyCashSubmission } from '@/api/petty-cash';
import { useTodayIst } from '@/features/attendance/use-now';
import { canSeePettyAdmin } from '@/features/accounts/access';
import { rowMoney, shortDate } from '@/features/petty-cash/logic';
import { plural } from '@/lib/format';
import { useAccess } from '@/lib/use-access';
import { palette, space } from '@/theme/tokens';
import { themedStyles } from '@/theme/themed';
import { ActivityList, ActivityRow, Button, DateField, EmptyState, ErrorState, NavHeader, PillSelector, Screen, Sheet, SkeletonList, SummaryHero, TextField } from '@/ui';

type Report = { batchId: string; employee: string; at: string; count: number; rejected: number; total: number; codes: string[] };

function reports(subs: PettyCashSubmission[]): Report[] {
  const by = new Map<string, Report>();
  for (const b of subs) {
    if (!b || !b.batchId) continue;
    const r = by.get(b.batchId) ?? { batchId: b.batchId, employee: b.employeeName || 'Employee', at: b.createdAt || '', count: 0, rejected: 0, total: 0, codes: [] };
    r.count += 1;
    if (b.status === 'rejected') r.rejected += 1;
    else r.total += Number(b.amount) || 0;
    if (b.kekaCode && !r.codes.includes(b.kekaCode)) r.codes.push(b.kekaCode);
    if ((b.createdAt || '') > r.at) r.at = b.createdAt || r.at;
    by.set(b.batchId, r);
  }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export default function PettyTrackingScreen() {
  const router = useRouter();
  const access = useAccess();
  const today = useTodayIst();
  const allowed = canSeePettyAdmin(access);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SubmissionFilters>({});
  const [filters, setFilters] = useState<SubmissionFilters>({});
  const q = useAllSubmissions(filters, allowed);

  if (!allowed) return <Redirect href="/" />;

  const list = reports(q.data ?? []);
  const total = list.reduce((s, r) => s + r.total, 0);
  const count = Object.values(filters).filter(Boolean).length;

  return (
    <Screen header={<NavHeader title="Expense reports" />} onRefresh={() => q.refetch()}>
      <SummaryHero
        icon={FileSpreadsheet}
        module="pettyCash"
        label="Spent, in these reports"
        value={q.data ? total : undefined}
        currency="₹"
        decimals={0}
        info={q.data ? { label: plural(list.length, 'report'), value: count ? 'Filtered' : 'Everyone' } : undefined}
      />
      <View style={styles.row}>
        <PillSelector
          icon={SlidersHorizontal}
          label={count ? `Filters · ${count}` : 'Filters'}
          onPress={() => {
            setDraft(filters);
            setOpen(true);
          }}
        />
      </View>
      {q.isPending ? (
        <SkeletonList rows={5} avatar />
      ) : q.isError && !q.data ? (
        <ErrorState message={q.error?.message || 'Couldn’t load the expense reports.'} onRetry={() => void q.refetch()} />
      ) : list.length ? (
        <ActivityList title={plural(list.length, 'report')}>
          {list.map((r) => (
            <ActivityRow
              key={r.batchId}
              module="pettyCash"
              icon={FileSpreadsheet}
              title={r.employee}
              subtitle={`${plural(r.count - r.rejected, 'bill')}${r.rejected ? ` · ${r.rejected} rejected` : ''}${r.codes.length ? ` · ${r.codes.join(', ')}` : ''}`}
              note={`Sent ${shortDate(r.at, today)}`}
              value={rowMoney(r.total)}
              chevron
              onPress={() => router.push({ pathname: '/petty-cash/statement/[batchId]', params: { batchId: r.batchId } })}
            />
          ))}
        </ActivityList>
      ) : (
        <EmptyState icon={<FileSpreadsheet color={palette.textMuted} strokeWidth={1.8} />} title="No expense reports" message={count ? 'Nothing matches these filters.' : 'Reports show up once people send their petty cash bills.'} />
      )}

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Filters"
        footer={
          <Button
            title="Show reports"
            onPress={() => {
              setFilters(draft);
              setOpen(false);
            }}
          />
        }>
        <View style={styles.sheet}>
          <DateField label="Sent from" value={draft.dateFrom || ''} onChange={(v) => setDraft((d) => ({ ...d, dateFrom: v }))} maximumDate={today} />
          <DateField label="Sent to" value={draft.dateTo || ''} onChange={(v) => setDraft((d) => ({ ...d, dateTo: v }))} minimumDate={draft.dateFrom || undefined} maximumDate={today} />
          <TextField label="Project" value={draft.projectName || ''} onChangeText={(v) => setDraft((d) => ({ ...d, projectName: v }))} placeholder="Name or project code" />
          <TextField label="Employee" value={draft.employeeName || ''} onChangeText={(v) => setDraft((d) => ({ ...d, employeeName: v }))} placeholder="Name" />
          <Button title="Clear filters" variant="ghost" disabled={!Object.values(draft).some(Boolean)} onPress={() => setDraft({})} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row' },
  sheet: { gap: space.md },
}));
