// HR setup — the hub for Super Admin and HR (the website's Attendance → Setup, Shifts, Holidays,
// Leave setup and Policies → Manage, dash.html :4599 / :4686 / :4651 / :4886 / :4994). Each row shows
// only when its gate passes (features/hrtime/access.ts). Payroll is the payroll area's own row in More.
//
// Payno layout: NavHeader, then frosted ActivityLists grouped Time · Leave · Policies; each row says
// what is there now ("2 offices", "3 shifts") so the hub is useful at a glance.

import { useRouter } from 'expo-router';
import { CalendarDays, CalendarRange, Clock, MapPin, Palmtree, ScrollText, UserCog, UsersRound } from 'lucide-react-native';

import { useAllShifts } from '@/api/attendance';
import { useAllPolicies, useOffices } from '@/api/hrtime';
import { useLeaveTypes } from '@/api/leave';
import { GateFallback, useHrTimeGate, noun } from '@/features/hrtime/ui';
import { ActivityList, ActivityRow, NavHeader, Screen, Text } from '@/ui';

export default function HrSetupHub() {
  const router = useRouter();
  const { gates, pending, allowed } = useHrTimeGate('any');
  const offices = useOffices(gates.attendance);
  const shifts = useAllShifts(gates.shifts);
  const types = useLeaveTypes(gates.leave);
  const policies = useAllPolicies(gates.policies);
  const header = <NavHeader title="HR setup" />;

  if (!allowed) return <GateFallback pending={pending} header={header} />;

  const n = (len: number | undefined, one: string, fallback: string) => (len == null ? fallback : `${len} ${noun(len, one)}`);
  const officeCount = offices.data?.length;
  const shiftCount = Array.isArray(shifts.data) ? shifts.data.length : undefined;
  const typeCount = Array.isArray(types.data?.types) ? types.data.types.length : undefined;
  const drafts = Array.isArray(policies.data) ? policies.data.filter((p) => p.status === 'draft').length : undefined;
  const live = Array.isArray(policies.data) ? policies.data.filter((p) => p.status === 'published').length : undefined;

  return (
    <Screen header={header} onRefresh={() => Promise.all([offices.refetch(), shifts.refetch(), types.refetch(), policies.refetch()])}>
      {gates.attendance || gates.shifts || gates.holidays ? (
        <ActivityList title="Time">
          {gates.attendance ? (
            <ActivityRow
              module="attendance"
              icon={MapPin}
              title="Offices and clock-in"
              subtitle={`${n(officeCount, 'office', 'Where people may clock in')} · company hours and rules`}
              chevron
              onPress={() => router.push('/admin/hr-time/offices')}
            />
          ) : null}
          {gates.attendance ? (
            <ActivityRow
              module="attendance"
              icon={UserCog}
              title="Clock-in rules"
              subtitle="How each person may clock in"
              chevron
              onPress={() => router.push('/admin/hr-time/clock-rules')}
            />
          ) : null}
          {gates.shifts ? (
            <ActivityRow
              module="shifts"
              icon={Clock}
              title="Shifts"
              subtitle={n(shiftCount, 'shift', 'Working hours other than the company’s')}
              chevron
              onPress={() => router.push('/admin/hr-time/shifts')}
            />
          ) : null}
          {gates.shifts ? (
            <ActivityRow
              module="shifts"
              icon={UsersRound}
              title="Who works which shift"
              subtitle="Put people on a shift or back on company hours"
              chevron
              onPress={() => router.push('/admin/hr-time/shift-people')}
            />
          ) : null}
          {gates.holidays ? (
            <ActivityRow
              module="holidays"
              icon={Palmtree}
              title="Holidays"
              subtitle="Add, change or remove company holidays"
              chevron
              onPress={() => router.push('/attendance/holidays')}
            />
          ) : null}
        </ActivityList>
      ) : null}

      {gates.leave ? (
        <ActivityList title="Leave">
          <ActivityRow
            module="leave"
            icon={CalendarDays}
            title="Leave types and rules"
            subtitle={`${n(typeCount, 'leave type', 'Casual, sick, earned…')} · leave year and request rules`}
            chevron
            onPress={() => router.push('/admin/hr-time/leave')}
          />
          <ActivityRow
            module="leave"
            icon={CalendarRange}
            title="Leave balances"
            subtitle="Everyone’s days · add, take away, carry forward"
            chevron
            onPress={() => router.push('/admin/hr-time/balances')}
          />
        </ActivityList>
      ) : null}

      {gates.policies ? (
        <ActivityList title="Policies">
          <ActivityRow
            module="policies"
            icon={ScrollText}
            title="Write and publish policies"
            subtitle={
              live == null
                ? 'Drafts, published and archived policies'
                : [`${live} published`, drafts ? `${drafts} ${noun(drafts, 'draft')}` : null].filter(Boolean).join(' · ')
            }
            chevron
            onPress={() => router.push('/admin/hr-time/policies')}
          />
        </ActivityList>
      ) : null}

      <Text variant="caption" muted align="center">
        Changes apply to everyone in your company straight away. Nobody is messaged.
      </Text>
    </Screen>
  );
}
