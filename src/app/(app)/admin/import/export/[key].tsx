// One Excel download (features/excel/catalog): the panel for `key`, behind that download's own gate
// (features/excel/access). An unknown key or a missing gate goes home.

import { Redirect, useLocalSearchParams } from 'expo-router';
import type { ComponentType } from 'react';

import type { ExportKey } from '@/features/excel/access';
import { type ExportDef, exportDef } from '@/features/excel/catalog';
import { AuditExport, ChatExport } from '@/features/excel/exports/company';
import { AssetsExport, DevicesExport, ServiceDeskExport, Tm360Export } from '@/features/excel/exports/it';
import { BountyExport, PayrollExport, SubscriptionsExport, VendorsExport } from '@/features/excel/exports/money';
import { BookingsExport, RosterExport, TimesheetExport } from '@/features/excel/exports/people';
import { KekaExport, ReportsExport } from '@/features/excel/exports/work';
import { useExcelAccess } from '@/features/excel/gate';
import { NavHeader, Screen, SkeletonList } from '@/ui';

const MyTimesheet = ({ def }: { def: ExportDef }) => <TimesheetExport def={def} other={false} />;
const OtherTimesheet = ({ def }: { def: ExportDef }) => <TimesheetExport def={def} other />;

const PANELS: Record<ExportKey, ComponentType<{ def: ExportDef }>> = {
  roster: RosterExport,
  timesheet: MyTimesheet,
  'people-timesheet': OtherTimesheet,
  bookings: BookingsExport,
  reports: ReportsExport,
  keka: KekaExport,
  payroll: PayrollExport,
  subscriptions: SubscriptionsExport,
  vendors: VendorsExport,
  bounty: BountyExport,
  assets: AssetsExport,
  servicedesk: ServiceDeskExport,
  devices: DevicesExport,
  tm360: Tm360Export,
  audit: AuditExport,
  chat: ChatExport,
};

export default function ExportScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { gates, ready } = useExcelAccess();
  const def = exportDef(key);
  if (!def) return <Redirect href="/admin/import" />;
  if (!ready) return <Screen header={<NavHeader title={def.title} />}><SkeletonList rows={4} /></Screen>;
  if (!gates.exports[def.key]) return <Redirect href="/" />;
  const Panel = PANELS[def.key];
  return <Panel def={def} />;
}
