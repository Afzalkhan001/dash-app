// Summary — what the website's Reports tab (dash.html BountyReportsView :13388) and "Coins Paid to
// Employees" (CoinFlowSummary :12115) work out from the ledger, as plain figures for Super Admin, CEO,
// COO and the App Manager: coins added, given out, held, released and paid as rewards; referral
// bonuses; and how much people then used. Cancelled movements are left out. Pick dates to narrow it.
// The Excel / PDF report itself stays on the website; Ledger › Share sends the rows as CSV.

import { BarChart3 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useCompanyWallet, useLedger } from '@/api/bountyadmin';
import { useTodayIst } from '@/features/attendance/use-now';
import { coins, deadlineLabel } from '@/features/bounty/logic';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { ledgerSummary } from '@/features/bountyadmin/logic';
import { plural } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { Button, Card, DateField, ErrorState, FieldPair, NavHeader, Screen, Skeleton, SummaryCard, SummaryHero } from '@/ui';

const TITLE = 'Summary';

export default function SummaryScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.summary} ready={ready} title={TITLE}>
      <Summary />
    </AdminGate>
  );
}

function Summary() {
  const today = useTodayIst();
  const { gates: g } = useBountyAdmin();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useLedger({ dateFrom: from, dateTo: to });
  const companyQ = useCompanyWallet(g.superTier || g.overseer);
  const s = ledgerSummary(Array.isArray(q.data) ? q.data : []);
  const range = from || to ? `${from ? deadlineLabel(from, today) : 'The start'} to ${to ? deadlineLabel(to, today) : 'today'}` : 'All time';

  return (
    <Screen header={<NavHeader title={TITLE} />} onRefresh={() => Promise.all([q.refetch(), companyQ.refetch()])}>
      <View style={{ gap: space.sm }}>
        <FieldPair>
          <DateField label="From" value={from || null} onChange={setFrom} maximumDate={to || today} />
          <DateField label="To" value={to || null} onChange={setTo} minimumDate={from || undefined} maximumDate={today} />
        </FieldPair>
        {from || to ? (
          <Button
            title="All time"
            variant="ghost"
            size="sm"
            onPress={() => {
              setFrom('');
              setTo('');
            }}
          />
        ) : null}
      </View>
      {q.isLoading ? (
        <Skeleton height={180} radius={radius.xxl} />
      ) : q.error && !q.data ? (
        <Card>
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <>
          <SummaryHero
            icon={BarChart3}
            module="bounty"
            label="Paid to people"
            value={s.rewards + s.referralPaid}
            unit="coins"
            info={{ label: 'Used for vouchers', value: `${coins(s.redeemed)} coins` }}
            sub={range}
          />
          <SummaryCard
            title="Paid to people"
            rows={[
              { key: 'b', label: 'Task rewards', value: `${coins(s.rewards)} coins`, hint: plural(s.rewardCount, 'task') },
              { key: 'r', label: 'Referral bonuses', value: `${coins(s.referralPaid)} coins`, hint: plural(s.referralCount, 'bonus', 'bonuses') },
              { key: 'u', label: 'Then used for vouchers', value: `${coins(s.redeemed)} coins`, hint: `${plural(s.redeemedCount, 'request')} · part of the two above` },
            ]}
          />
          <SummaryCard
            title="Coin movements"
            rows={[
              { key: 'add', label: 'Added to the company', value: coins(s.added) },
              { key: 'dist', label: 'Given to task posters', value: coins(s.distributed) },
              { key: 'res', label: 'Held for tasks', value: coins(s.reserved) },
              { key: 'rel', label: 'Released from tasks', value: coins(s.released) },
              { key: 'rew', label: 'Task rewards paid', value: coins(s.rewards) },
            ]}
          />
          {companyQ.data ? (
            <SummaryCard
              title="Company wallet now"
              rows={[
                { key: 'a', label: 'Added in total', value: coins(companyQ.data.totalAdded) },
                { key: 'd', label: 'Given out in total', value: coins(companyQ.data.totalDistributed) },
              ]}
              total={{ label: 'Left to give', value: `${coins(companyQ.data.available)} coins` }}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
