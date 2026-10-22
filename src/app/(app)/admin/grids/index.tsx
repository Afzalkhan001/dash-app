// Big tables — the hub for the website's wide grids (features/grids). One row per table this person
// may see (features/grids/access.ts, each the gate of the website page the table lives on). Every
// table is read-only: nothing here changes data or messages anyone.

import { useRouter } from 'expo-router';
import { BookOpenCheck, CalendarRange, Contact, FileSpreadsheet, Table2, Wallet } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import { GridGateFallback, useGridGate } from '@/features/grids/grid-ui';
import type { ModuleKey } from '@/theme/tokens';
import { ActivityList, ActivityRow, NavHeader, Screen, SummaryHero } from '@/ui';

type Item = { key: string; title: string; sub: string; href: string; icon: LucideIcon; module: ModuleKey; on: boolean };

export default function GridsHub() {
  const router = useRouter();
  const { gates, allowed, pending } = useGridGate('tables');
  const header = <NavHeader title="Big tables" />;
  if (!allowed) return <GridGateFallback pending={pending} header={header} />;

  const people = ([
    { key: 'attendance', title: 'Attendance month', sub: 'Everyone × every day: present, late, half day', href: '/admin/grids/attendance', icon: CalendarRange, module: 'attendance', on: gates.attendance },
    { key: 'balances', title: 'Leave balances', sub: 'Everyone × every leave type, days left', href: '/admin/grids/leave-balances', icon: Table2, module: 'leave', on: gates.balances },
    { key: 'payroll', title: 'Payroll register', sub: 'One month’s pay, every line, with totals', href: '/admin/grids/payroll', icon: FileSpreadsheet, module: 'pay', on: gates.payroll },
    { key: 'salaries', title: 'Salaries', sub: 'Structure, pay and tax set-up for everyone', href: '/admin/grids/salaries', icon: Wallet, module: 'pay', on: gates.salaries },
    { key: 'roster', title: 'Employee details', sub: 'The roster with every column', href: '/admin/grids/roster', icon: Contact, module: 'people', on: gates.roster },
  ] satisfies Item[]).filter((i) => i.on);
  const money = ([
    { key: 'ledger', title: 'Petty cash ledger', sub: 'Money given, bills in, bills still to come', href: '/admin/grids/petty-ledger', icon: BookOpenCheck, module: 'pettyCash', on: gates.ledger },
  ] satisfies Item[]).filter((i) => i.on);
  const count = people.length + money.length;

  const row = (i: Item) => (
    <ActivityRow key={i.key} module={i.module} icon={i.icon} title={i.title} subtitle={i.sub} chevron onPress={() => router.push(i.href as never)} />
  );

  return (
    <Screen header={header}>
      <SummaryHero
        icon={Table2}
        module="people"
        label="Tables from the DASH website"
        value={count}
        unit={count === 1 ? 'table' : 'tables'}
        sub="Swipe a table sideways for more columns. Tap a row for all its details."
      />
      {people.length ? <ActivityList title="People & HR">{people.map(row)}</ActivityList> : null}
      {money.length ? <ActivityList title="Money">{money.map(row)}</ActivityList> : null}
    </Screen>
  );
}
