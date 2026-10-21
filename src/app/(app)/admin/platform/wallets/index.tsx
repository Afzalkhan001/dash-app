// Company wallets (BountyCompanyOverview as master, dash.html:12016, and its Transactions tab :13310
// locked to company credits) for the platform owner:
//   - pick a company → its wallet (GET /bounty/wallet/company?tenantId): coins available, added, given out;
//   - "Add coins" → wallets/add (keypad, reason, swipe);
//   - company credits (GET /bounty_transactions?type=COMPANY_CREDIT, for this company or every company):
//     tap one → its details and "Cancel this credit" → swipe → POST /bounty_transactions/:id/reverse.
//     The server refuses once any of those coins were given out or spent; its words are shown.
// The wallet Excel / PDF reports stay on the website.

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Coins, Plus, Undo2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { companyName, type CompanyCredit, useCancelCompanyCredit, useCompanyCredits, useCompanyWallet } from '@/api/platform';
import { useTodayIst } from '@/features/attendance/use-now';
import { canMoveCompanyCoins, canSeeCompanyWallets } from '@/features/platform/access';
import { coins, usePlatformGate } from '@/features/platform/gate';
import { CompanyPicker } from '@/features/platform/ui';
import { stampLabel } from '@/lib/dates';
import { palette } from '@/theme/tokens';
import {
  ActivityList,
  ActivityRow,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  Segmented,
  Sheet,
  Skeleton,
  SkeletonList,
  SummaryCard,
  SummaryHero,
  toast,
  useLayout,
} from '@/ui';

type Scope = 'one' | 'all';

export default function CompanyWalletsScreen() {
  const router = useRouter();
  const { gap } = useLayout();
  const today = useTodayIst();
  const params = useLocalSearchParams<{ company?: string }>();
  const { user, ready, tenantsQ, tenants } = usePlatformGate();
  const allowed = canSeeCompanyWallets(user);
  const canMove = canMoveCompanyCoins(user);
  const [chosen, setChosen] = useState('');
  const [scope, setScope] = useState<Scope>('one');
  const [open, setOpen] = useState<CompanyCredit | null>(null);
  const [cancelling, setCancelling] = useState<CompanyCredit | null>(null);

  const asked = typeof params.company === 'string' ? params.company : '';
  const cid = [chosen, asked].find((x) => x && tenants.some((t) => t.id === x)) ?? tenants[0]?.id ?? '';
  const t = tenants.find((x) => x.id === cid) ?? null;
  const walletQ = useCompanyWallet(allowed && cid ? cid : null);
  const creditsQ = useCompanyCredits(scope === 'all' ? '' : cid, allowed && (scope === 'all' || !!cid));
  const cancel = useCancelCompanyCredit();

  if (ready && !allowed) return <Redirect href="/" />;

  const name = companyName(t);
  const w = walletQ.data;
  const nameOf = (id: string) => companyName(tenants.find((x) => x.id === id));
  const credits = creditsQ.data ?? [];

  const startCancel = (c: CompanyCredit) => {
    setOpen(null);
    cancel.reset();
    setTimeout(() => setCancelling(c), 320);
  };
  const doCancel = () => {
    const c = cancelling;
    if (!c) return;
    cancel.mutate({ id: c.id, tenantId: c.tenantId }, { onSuccess: () => { setCancelling(null); toast.show('Credit cancelled: the coins are off the wallet', 'success'); } });
  };
  // Only this company's own wallet is loaded; for a credit of another company the server decides alone.
  const likelyRefused = (c: CompanyCredit) => !!w && c.tenantId === cid && c.amount > w.available;

  return (
    <Screen header={<NavHeader title="Company wallets" />} onRefresh={() => Promise.all([tenantsQ.refetch(), walletQ.refetch(), creditsQ.refetch()])}>
      {tenantsQ.data ? (
        tenants.length ? (
          <View style={{ gap }}>
            <View style={{ alignItems: 'flex-start' }}>
              <CompanyPicker tenants={tenants} value={cid} onChange={setChosen} />
            </View>
            {w ? (
              <SummaryHero
                icon={Coins}
                module="bounty"
                label={`Coins in ${name}’s wallet`}
                value={w.available}
                unit="coins"
                info={{ label: `Added ${coins(w.totalAdded)}`, value: `Given out ${coins(w.totalDistributed)}` }}
                sub={t?.bountyEnabled === false ? 'Bounty is switched off for this company, so nobody there can use the coins yet.' : undefined}
                action={canMove ? { title: 'Add coins', icon: <Plus />, onPress: () => router.push(`/admin/platform/wallets/add?company=${encodeURIComponent(cid)}`) } : undefined}
              />
            ) : walletQ.isError ? (
              <ErrorState message={walletQ.error?.message ?? 'The wallet could not be loaded.'} onRetry={() => void walletQ.refetch()} />
            ) : (
              <Skeleton height={220} />
            )}

            <View style={{ gap: gap - 8 }}>
              <Segmented<Scope>
                options={[
                  { key: 'one', label: 'This company' },
                  { key: 'all', label: 'All' },
                ]}
                value={scope}
                onChange={setScope}
              />
              {creditsQ.isError && !creditsQ.data ? (
                <ErrorState message={creditsQ.error?.message ?? 'The credits could not be loaded.'} onRetry={() => void creditsQ.refetch()} />
              ) : (
                <ActivityList
                  title={scope === 'all' ? 'Credits, every company' : 'Credits'}
                  loading={!creditsQ.data}
                  empty={scope === 'all' ? 'No company has been given coins yet.' : `${name} hasn’t been given coins yet.`}>
                  {credits.map((c) => (
                    <ActivityRow
                      key={c.id}
                      module="bounty"
                      icon={Coins}
                      title={c.reason || 'Company credit'}
                      subtitle={[scope === 'all' ? nameOf(c.tenantId) : null, c.performedBy ? `By ${c.performedBy}` : null].filter(Boolean).join(' · ')}
                      meta={stampLabel(c.createdAt, today)}
                      value={`+${coins(c.amount)}`}
                      valueColor={c.reversedAt ? palette.textMuted : undefined}
                      status={c.reversedAt ? { label: 'Cancelled', tone: 'failed' } : null}
                      onPress={() => setOpen(c)}
                      accessibilityLabel={`${coins(c.amount)} coins${scope === 'all' ? ` to ${nameOf(c.tenantId)}` : ''}, ${c.reason || 'company credit'}, ${stampLabel(c.createdAt, today)}${c.reversedAt ? ', cancelled' : ''}`}
                    />
                  ))}
                </ActivityList>
              )}
            </View>
          </View>
        ) : (
          <EmptyState icon={<Building2 />} title="No companies yet" message="Register a company first, in Companies." />
        )
      ) : tenantsQ.isError ? (
        <ErrorState message={tenantsQ.error?.message ?? 'The companies could not be loaded.'} onRetry={() => void tenantsQ.refetch()} />
      ) : (
        <SkeletonList rows={5} />
      )}

      {/* One credit */}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title="Company credit">
        {open ? (
          <>
            <SummaryCard
              rows={[
                { key: 'co', label: 'Company', value: nameOf(open.tenantId) },
                { key: 'when', label: 'When', value: stampLabel(open.createdAt, today) },
                { key: 'by', label: 'Added by', value: open.performedBy || '—' },
                { key: 'why', label: 'Reason', value: open.reason || '—' },
                open.reversedAt
                  ? { key: 'st', label: 'Status', value: 'Cancelled', status: 'failed', hint: [stampLabel(open.reversedAt, today), open.reversedBy].filter((x) => x && x !== '—').join(' · ') || null }
                  : { key: 'st', label: 'Status', value: 'Added', status: 'done' },
              ]}
              total={{ label: 'Coins', value: `+${coins(open.amount)}` }}
            />
            {!open.reversedAt && canMove ? (
              <>
                {likelyRefused(open) ? (
                  <Banner tone="warning" message={`Only ${coins(w?.available ?? 0)} coins are still unused, so this credit can’t be taken back in full.`} />
                ) : null}
                <Button title="Cancel this credit" variant="danger" icon={<Undo2 />} onPress={() => startCancel(open)} />
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this credit?"
        from={{ title: cancelling ? `${nameOf(cancelling.tenantId)} wallet` : '', subtitle: cancelling ? `${coins(cancelling.amount)} coins` : undefined, icon: Coins, module: 'bounty' }}
        to={{ title: 'Taken back', subtitle: 'Off the company’s balance', icon: Undo2, module: 'security' }}
        detailsTitle="Credit"
        confirmLabel="Swipe to cancel the credit"
        onConfirm={doCancel}
        loading={cancel.isPending}
        note="Works only while none of these coins were given out or spent. No one is notified.">
        {cancelling ? (
          <SummaryCard
            rows={[
              { key: 'when', label: 'Added', value: stampLabel(cancelling.createdAt, today) },
              { key: 'why', label: 'Reason', value: cancelling.reason || '—' },
            ]}
            total={{ label: 'Coins', value: coins(cancelling.amount) }}
          />
        ) : null}
        {cancel.error ? <Banner tone="danger" message={cancel.error.message} /> : null}
      </ConfirmSheet>
    </Screen>
  );
}
