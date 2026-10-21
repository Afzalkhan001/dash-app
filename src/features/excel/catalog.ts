// Excel domain — the list the "Import & export" hub draws: every bulk upload and every Excel download
// the website has, in plain words, grouped the way people look for them. Gates are in ./access.

import type { Href } from 'expo-router';
import {
  BadgeIndianRupee,
  BookUser,
  Briefcase,
  CalendarClock,
  ChartColumn,
  Coins,
  CreditCard,
  FileClock,
  FolderKanban,
  Hash,
  LifeBuoy,
  type LucideIcon,
  MessagesSquare,
  MonitorSmartphone,
  Package,
  ScrollText,
  Store,
  Users,
  UsersRound,
} from 'lucide-react-native';

import type { ExportKey, ImportKey } from '@/features/excel/access';
import type { ModuleKey } from '@/theme/tokens';

export type ImportDef = { key: ImportKey; title: string; subtitle: string; icon: LucideIcon; module: ModuleKey; href: Href };

export const IMPORTS: ImportDef[] = [
  { key: 'employees', title: 'Employees', subtitle: 'Add new people or update details by employee ID', icon: Users, module: 'people', href: '/admin/import/employees' },
  { key: 'projects', title: 'Projects (Keka codes)', subtitle: 'Add many project codes at once', icon: FolderKanban, module: 'tasks', href: '/admin/import/projects' },
  { key: 'clients', title: 'Clients', subtitle: 'Add your clients from a sheet', icon: Briefcase, module: 'tasks', href: '/admin/import/clients' },
  { key: 'assets', title: 'Assets', subtitle: 'Add equipment, with who has it', icon: Package, module: 'support', href: '/admin/import/assets' },
  { key: 'subscriptions', title: 'Subscriptions', subtitle: 'Past subscriptions and payments', icon: CreditCard, module: 'expenses', href: '/admin/import/subscriptions' },
];

export type ExportGroup = 'mine' | 'people' | 'work' | 'money' | 'it' | 'company';
export const EXPORT_GROUP_TITLE: Record<ExportGroup, string> = {
  mine: 'Your files',
  people: 'People',
  work: 'Work and time',
  money: 'Money',
  it: 'IT and office',
  company: 'Company',
};
export const EXPORT_GROUP_ORDER: ExportGroup[] = ['mine', 'people', 'work', 'money', 'it', 'company'];

export type ExportDef = { key: ExportKey; group: ExportGroup; title: string; subtitle: string; icon: LucideIcon; module: ModuleKey };

export const EXPORTS: ExportDef[] = [
  { key: 'timesheet', group: 'mine', title: 'My timesheet', subtitle: 'Tasks, bookings and timesheet lines for any dates', icon: CalendarClock, module: 'timesheets' },
  { key: 'chat', group: 'mine', title: 'A chat', subtitle: 'Every message of one conversation', icon: MessagesSquare, module: 'news' },
  { key: 'roster', group: 'people', title: 'Employee roster', subtitle: 'Everyone, or only active, not signed up or resigned', icon: BookUser, module: 'people' },
  { key: 'people-timesheet', group: 'people', title: 'Someone’s timesheet', subtitle: 'The same sheet as My timesheet, for one person', icon: FileClock, module: 'timesheets' },
  { key: 'bookings', group: 'people', title: 'Someone’s bookings', subtitle: 'Approved bookings and whether work started', icon: UsersRound, module: 'tasks' },
  { key: 'reports', group: 'work', title: 'Reports', subtitle: 'People, projects, Keka codes or the month grid', icon: ChartColumn, module: 'tasks' },
  { key: 'keka', group: 'work', title: 'Keka code time', subtitle: 'Hours, locations and requests on one code', icon: Hash, module: 'tasks' },
  { key: 'payroll', group: 'money', title: 'Payroll register', subtitle: 'Everyone’s pay for one month', icon: BadgeIndianRupee, module: 'pay' },
  { key: 'subscriptions', group: 'money', title: 'Subscriptions', subtitle: 'Subscriptions, payments and spend by department', icon: CreditCard, module: 'expenses' },
  { key: 'vendors', group: 'money', title: 'Vendor master', subtitle: 'Approved vendors (no bank details)', icon: Store, module: 'vendor' },
  { key: 'bounty', group: 'money', title: 'Bounty coins report', subtitle: 'Totals and every coin transaction', icon: Coins, module: 'bounty' },
  { key: 'assets', group: 'it', title: 'Asset register', subtitle: 'All, assigned, waiting for acknowledgement or warranty ending', icon: Package, module: 'support' },
  { key: 'servicedesk', group: 'it', title: 'Service desk', subtitle: 'Tickets and requests you can see', icon: LifeBuoy, module: 'support' },
  { key: 'devices', group: 'it', title: 'Device monitoring', subtitle: 'Who is linked in TM360 and their devices', icon: MonitorSmartphone, module: 'security' },
  { key: 'tm360', group: 'it', title: 'TM360 activity for one person', subtitle: 'Summary, apps, sites, blocked items and location', icon: MonitorSmartphone, module: 'security' },
  { key: 'audit', group: 'company', title: 'Activity audit', subtitle: 'Who did what, with before and after', icon: ScrollText, module: 'security' },
];

export const exportDef = (key: string | undefined) => EXPORTS.find((e) => e.key === key) ?? null;
