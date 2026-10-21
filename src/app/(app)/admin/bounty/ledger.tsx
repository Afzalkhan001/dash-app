// Ledger — the website's Transactions / "My Coin History" tab (dash.html BountyTransactionsView :13331):
// every coin movement the server lets this person see (Super Admin, CEO, COO and the App Manager: the
// company's; task posters: their own), with the website's filters — dates, type, credit / debit, an
// employee (Super Admin, CEO, COO) and a search. Tap a row for its details; Super Admin can cancel a
// coin distribution there while the coins are unused (POST /bounty_transactions/:id/reverse). The
// share button sends the filtered rows as CSV (the website's Excel / PDF report stays on the web).

import { Coins, Search, Share2, SlidersHorizontal, Undo2, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { type LedgerFilters, type LedgerTxn, reverseTxn, useInvalidateBountyAdmin, useLedger } from '@/api/bountyadmin';
import { useTodayIst } from '@/features/attendance/use-now';
import { coins, dateTimeLabel, num } from '@/features/bounty/logic';
import { canCancelTxn } from '@/features/bountyadmin/access';
import { AdminGate, useBountyAdmin } from '@/features/bountyadmin/gate';
import { LEDGER_TYPES, ledgerFrom, ledgerStatus, ledgerTypeLabel } from '@/features/bountyadmin/logic';
import { PersonPicker, usePickablePeople } from '@/features/shared/person-picker';
import { shareCsv } from '@/lib/csv';
import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActivityList,
  ActivityRow,
  Button,
  Card,
  ConfirmSheet,
  DateField,
  EmptyState,
  ErrorState,
  NavHeader,
  Screen,
  SelectField,
  Sheet,
  SkeletonList,
  SummaryCard,
  TextField,
  toast,
} from '@/ui';

const PAGE = 40;

export default function LedgerScreen() {
  const { ready, gates } = useBountyAdmin();
  return (
    <AdminGate allow={gates.ledger} ready={ready} title={gates.ledgerAll ? 'Ledger' : 'My coin history'}>
      <Ledger />
    </AdminGate>
  );
}

function Ledger() {
  const today = useTodayIst();
  const invalidate = useInvalidateBountyAdmin();
  const { user, gates: g } = useBountyAdmin();
  const title = g.ledgerAll ? 'Ledger' : 'My coin history';
  const [f, setF] = useState<LedgerFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [empName, setEmpName] = useState('');
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<LedgerTxn | null>(null);
  const [cancel, setCancel] = useState<LedgerTxn | null>(null);
  const [saving, setSaving] = useState(false);
  const q = useLedger(f);
  const peopleQ = usePickablePeople({ enabled: g.ledgerEmployeeFilter && picking });

  const rows = Array.isArray(q.data) ? q.data : [];
  const needle = search.trim().toLowerCase();
  const visible = needle ? rows.filter((t) => JSON.stringify(t).toLowerCase().includes(needle)) : rows;
  const active = [f.dateFrom, f.dateTo, f.type, f.direction, f.employeeId].filter(Boolean).length;
  const me = user?.id ?? '';

  const share = async () => {
    try {
      await shareCsv(`bounty-ledger-${today}`, visible, [
        { label: 'Transaction ID', value: (t) => t.id },
        { label: 'Date', value: (t) => dateTimeLabel(t.createdAt) },
        { label: 'Type', value: (t) => ledgerTypeLabel(t.type) },
        { label: 'From', value: (t) => ledgerFrom(t) },
        { label: 'To', value: (t) => t.toWalletName || '' },
        { label: 'Task', value: (t) => t.taskName || '' },
        { label: 'Coins', value: (t) => num(t.amount) },
        { label: 'By', value: (t) => t.performedBy || '' },
        { label: 'Reason', value: (t) => t.reason || '' },
        { label: 'Status', value: (t) => ledgerStatus(t).label },
      ]);
    } catch (e) {
      Alert.alert('Couldn’t share', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const doCancel = async () => {
    if (!cancel) return;
    setSaving(true);
    try {
      await reverseTxn(cancel.id, 'Cancelled from Transactions');
      await invalidate();
      setCancel(null);
      toast.show('Distribution cancelled. The coins are back in the company wallet.', 'success');
    } catch (e) {
      Alert.alert('Couldn’t cancel it', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const sign = (t: LedgerTxn) => {
    if (g.ledgerAll) return coins(t.amount);
    if (t.toWalletId === me) return `+${coins(t.amount)}`;
    if (t.fromWalletId === me && t.type !== 'BOUNTY_REWARD_TRANSFER') return `−${coins(t.amount)}`;
    return coins(t.amount);
  };

  return (
    <>
      <Screen
        header={
          <NavHeader
            title={title}
            actions={[
              { key: 'filter', icon: SlidersHorizontal, label: active ? `Filters, ${active} on` : 'Filters', dot: active > 0, onPress: () => setFiltersOpen(true) },
              { key: 'share', icon: Share2, label: 'Share as CSV', disabled: !visible.length, onPress: () => void share() },
            ]}
          />
        }
        onRefresh={() => q.refetch()}>
        <TextField
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setLimit(PAGE);
          }}
          placeholder="Search names, tasks, reasons"
          left={<Search size={18} color={palette.textMuted} />}
          accessibilityLabel="Search the ledger"
        />
        {q.isLoading ? (
          <SkeletonList rows={5} />
        ) : q.error && !q.data ? (
          <Card>
            <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
          </Card>
        ) : visible.length ? (
          <>
            <ActivityList title={`${visible.length} ${visible.length === 1 ? 'movement' : 'movements'}`}>
              {visible.slice(0, limit).map((t) => {
                const s = ledgerStatus(t);
                return (
                  <ActivityRow
                    key={t.id}
                    module="bounty"
                    icon={Coins}
                    title={ledgerTypeLabel(t.type)}
                    subtitle={[[ledgerFrom(t), t.toWalletName].filter((x) => !!x && x !== '—').join(' → '), t.taskName].filter(Boolean).join(' · ')}
                    value={sign(t)}
                    meta={dateTimeLabel(t.createdAt, today)}
                    status={s.label === 'Done' ? null : s}
                    onPress={() => setOpen(t)}
                  />
                );
              })}
            </ActivityList>
            {visible.length > limit ? <Button title="Show more" variant="ghost" onPress={() => setLimit(limit + PAGE)} /> : null}
          </>
        ) : (
          <Card>
            <EmptyState icon={<Search color={palette.textMuted} />} title="No coin movements" message={active || needle ? 'Nothing matches these filters.' : undefined} />
          </Card>
        )}
      </Screen>

      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <Button
            title="Clear filters"
            variant="ghost"
            disabled={!active}
            onPress={() => {
              setF({});
              setEmpName('');
              setLimit(PAGE);
            }}
          />
        }>
        <View style={{ gap: space.md }}>
          <DateField label="From" value={f.dateFrom || null} onChange={(v) => setF({ ...f, dateFrom: v })} maximumDate={f.dateTo || today} />
          <DateField label="To" value={f.dateTo || null} onChange={(v) => setF({ ...f, dateTo: v })} minimumDate={f.dateFrom} maximumDate={today} />
          <SelectField
            label="Type"
            value={f.type || 'all'}
            options={[{ value: 'all', label: 'All types' }, ...LEDGER_TYPES]}
            onChange={(v) => setF({ ...f, type: v === 'all' ? '' : v })}
          />
          <SelectField
            label="Coming in or going out"
            value={f.direction || 'both'}
            options={[
              { value: 'both', label: 'Both' },
              { value: 'credit', label: 'Coming in' },
              { value: 'debit', label: 'Going out' },
            ]}
            onChange={(v) => setF({ ...f, direction: v === 'both' ? '' : (v as 'credit' | 'debit') })}
          />
          {g.ledgerEmployeeFilter ? (
            f.employeeId ? (
              <AccountRow
                icon={UserRound}
                module="bounty"
                title={empName || 'Employee'}
                sub="Only their movements"
                actionLabel="Clear"
                onChange={() => {
                  setF({ ...f, employeeId: '' });
                  setEmpName('');
                }}
              />
            ) : (
              <Button title="Only one person" variant="ghost" icon={<UserRound />} onPress={() => setPicking(true)} />
            )
          ) : null}
        </View>
      </Sheet>

      <PersonPicker
        visible={picking}
        onClose={() => setPicking(false)}
        title="Whose movements"
        people={peopleQ.data}
        loading={peopleQ.isLoading}
        allowOnLeave
        onPick={(p) => {
          setF({ ...f, employeeId: p.id });
          setEmpName(p.name);
        }}
      />

      <Sheet
        visible={!!open}
        onClose={() => setOpen(null)}
        title={open ? ledgerTypeLabel(open.type) : ''}
        subtitle={open ? dateTimeLabel(open.createdAt, today) : undefined}
        footer={
          open && canCancelTxn(g, open) ? (
            <Button
              title="Cancel this distribution"
              variant="danger"
              icon={<Undo2 />}
              onPress={() => {
                const t = open;
                setOpen(null);
                setTimeout(() => setCancel(t), 350);
              }}
            />
          ) : undefined
        }>
        {open ? (
          <SummaryCard
            hideEmpty
            rows={[
              { key: 'amt', label: 'Coins', value: coins(open.amount) },
              { key: 'from', label: 'From', value: ledgerFrom(open) },
              { key: 'to', label: 'To', value: open.toWalletName || null },
              { key: 'task', label: 'Task', value: open.taskName || null },
              { key: 'why', label: 'Reason', value: open.reason || null },
              { key: 'by', label: 'Done by', value: open.performedBy || null },
              { key: 'st', label: 'Status', value: ledgerStatus(open).label, status: ledgerStatus(open).tone },
              { key: 'id', label: 'Reference', value: open.id },
            ]}
          />
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={!!cancel}
        onClose={() => setCancel(null)}
        title="Cancel this distribution?"
        from={{ title: cancel?.toWalletName || 'Employee', subtitle: `${coins(cancel?.amount)} coins`, avatar: { name: cancel?.toWalletName || 'Employee' } }}
        to={{ title: 'Company wallet', icon: Undo2, module: 'bounty' }}
        confirmLabel="Swipe to cancel it"
        onConfirm={() => void doCancel()}
        loading={saving}
        note="Only works while none of these coins are used. No message is sent."
      />
    </>
  );
}
