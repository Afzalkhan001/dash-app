// Kit gallery section D (dev only): lists & tiles from docs/REFERENCE-COMPONENTS.md items 6–15 —
// SectionHeader, AvatarTiles, ActivityList / ActivityRow, CategoryGrid (and QuickActions drawn through
// it), UpcomingCards, SelectTiles, AccountRow, SummaryCard, MetricRow and PillSelector. Each sits under
// a small caption with its name so it can be compared with the Payno / Lendora reference. Demo content
// only; every tap shows a toast saying what it would do.

import {
  Banknote,
  Building2,
  CalendarDays,
  CalendarPlus,
  Car,
  ClipboardCheck,
  Clock,
  Coins,
  DoorOpen,
  Fingerprint,
  Gift,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  LifeBuoy,
  MoreHorizontal,
  ReceiptIndianRupee,
  ReceiptText,
  ShieldCheck,
  Sun,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Platform, View } from 'react-native';

import { palette, space } from '@/theme/tokens';
import {
  AccountRow,
  ActivityList,
  ActivityRow,
  Avatar,
  AvatarTiles,
  Card,
  CategoryGrid,
  MetricRow,
  PillSelector,
  QuickActions,
  SectionHeader,
  SelectTiles,
  SummaryCard,
  Text,
  toast,
  UpcomingCards,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
const say = (what: string) => () => toast.show(what, 'info');

/** The small caption over every gallery item: the component's name and what it shows. */
function Item({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.item}>
      <View style={styles.caption}>
        <Text variant="labelStrong" color={palette.primaryText} numberOfLines={2}>
          {name}
        </Text>
        {note ? (
          <Text variant="caption" muted numberOfLines={3}>
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

type LeaveKind = 'casual' | 'sick' | 'wfh' | 'comp';
type ClockMode = 'office' | 'remote';
type ExpenseKind = 'travel' | 'food' | 'stay';

export function KitSectionD() {
  const [leaveKind, setLeaveKind] = useState<LeaveKind>('casual');
  const [mode, setMode] = useState<ClockMode>('office');
  const [expense, setExpense] = useState<ExpenseKind>('travel');

  return (
    <View style={styles.section}>
      <View style={styles.caption}>
        <Text variant="title" color={palette.ink}>
          D · Lists & tiles
        </Text>
        <Text variant="label" muted>
          Payno / Lendora items 6–15. Compare each with the reference crops.
        </Text>
      </View>

      <Item name="SectionHeader" note="Regular 17 px title, muted link on the right (or an overline / custom control).">
        <View>
          <SectionHeader title="Who's in today" onAction={say('See all → People')} />
          <SectionHeader overline="October 2026" title="Coming up" actionLabel="View All" onAction={say('View All → Holidays')} />
        </View>
      </Item>

      <Item name="AvatarTiles" note="Frosted 96 × 100 tiles, status dot on the avatar, trailing “Add new”. Scrolls sideways.">
        <AvatarTiles
          accessibilityLabel="Who's in today"
          items={[
            { key: 'p1', name: 'Priya Sharma', sub: 'In · 9:12', dot: 'done', accessibilityLabel: 'Priya Sharma, in since 9:12', onPress: say('Priya Sharma') },
            { key: 'p2', name: 'Rahul Verma', sub: 'In · 9:30', dot: 'done', onPress: say('Rahul Verma') },
            { key: 'p3', name: 'Ananya Iyer', sub: 'Late · 10:05', dot: 'pending', onPress: say('Ananya Iyer') },
            { key: 'p4', name: 'Karthik Reddy', sub: 'On leave', dot: 'neutral', onPress: say('Karthik Reddy') },
            { key: 'p5', name: 'Sneha Patil', sub: 'In · 9:41', dot: 'done', onPress: say('Sneha Patil') },
            { key: 'p6', name: 'Mohammed Irfan', sub: 'WFH', onPress: say('Mohammed Irfan') },
          ]}
          onAdd={say('Add new approver')}
          addLabel="Add new"
        />
      </Item>

      <Item name="ActivityList / ActivityRow" note="One frosted card, avatar / initials, medium name, muted time, amount right (+ = green).">
        <ActivityList title="Recent activity" onSeeAll={say('See all → Inbox')}>
          <ActivityRow person={{ name: 'Priya Sharma' }} title="Priya Sharma" subtitle="Casual leave · 3–4 Nov" value="2 days" meta="2h ago" onPress={say('Leave request')} />
          <ActivityRow module="pay" icon={Banknote} title="October salary" subtitle="Credited to HDFC •••• 4125" value="+₹48,250.00" meta="30 Oct" onPress={say('Payslip')} />
          <ActivityRow person={{ name: 'Rahul Verma' }} title="Rahul Verma" subtitle="Cab to client site · Expense" value="₹640.00" status={{ label: 'Pending', tone: 'pending' }} onPress={say('Expense claim')} />
          <ActivityRow module="pettyCash" icon={Wallet} title="Office snacks" subtitle="Petty cash bill" value="−₹1,180.00" meta="Yesterday" onPress={say('Petty cash bill')} />
          <ActivityRow person={{ name: 'Ananya Iyer' }} title="Ananya Iyer" subtitle="Attendance fix · 17 Oct" status={{ label: 'Approved', tone: 'done' }} onPress={say('Attendance fix')} />
        </ActivityList>
      </Item>

      <Item name="CategoryGrid" note="4 per row of frosted circles, thin module-coloured icons; neutral count badge and brand dot (never red).">
        <CategoryGrid
          items={[
            { key: 'leave', label: 'Apply leave', icon: CalendarPlus, module: 'leave', onPress: say('Apply leave') },
            { key: 'wfh', label: 'Work from home', icon: House, module: 'leave', onPress: say('Work from home') },
            { key: 'fix', label: 'Fix attendance', icon: Fingerprint, module: 'attendance', badge: 2, onPress: say('Fix attendance') },
            { key: 'claim', label: 'Claim expense', icon: ReceiptIndianRupee, module: 'expenses', onPress: say('Claim expense') },
            { key: 'petty', label: 'Petty cash', icon: Wallet, module: 'pettyCash', onPress: say('Petty cash bill') },
            { key: 'ticket', label: 'Raise a ticket', icon: LifeBuoy, module: 'support', onPress: say('Raise a ticket') },
            { key: 'visitor', label: 'Invite visitor', icon: DoorOpen, module: 'visitors', badge: true, onPress: say('Invite a visitor') },
            { key: 'more', label: 'More', icon: MoreHorizontal, onPress: say('More') },
          ]}
        />
      </Item>

      <Item name="QuickActions → CategoryGrid" note="Home's shortcut row: same props as before, now drawn by CategoryGrid.">
        <QuickActions
          items={[
            { key: 'leave', label: 'Apply leave', icon: CalendarPlus, module: 'leave', onPress: say('Apply leave') },
            { key: 'slips', label: 'Payslips', icon: ReceiptText, module: 'pay', onPress: say('Payslips') },
            { key: 'att', label: 'Attendance', icon: Fingerprint, module: 'attendance', onPress: say('Attendance') },
            { key: 'claim', label: 'Claim expense', icon: ReceiptIndianRupee, module: 'expenses', onPress: say('Claim expense') },
          ]}
        />
      </Item>

      <Item name='CategoryGrid surface="card"' note="Inside a card (More grid): soft filled circles, 3 across.">
        <Card tone="accent" style={styles.whiteCard}>
          <CategoryGrid
            columns={3}
            surface="card"
            items={[
              { key: 'people', label: 'People', icon: Users, module: 'people', onPress: say('People') },
              { key: 'tasks', label: 'Tasks', icon: ClipboardCheck, module: 'tasks', onPress: say('Tasks') },
              { key: 'bounty', label: 'Bounty', icon: Coins, module: 'bounty', onPress: say('Bounty') },
              { key: 'holidays', label: 'Holidays', icon: CalendarDays, module: 'holidays', onPress: say('Holidays') },
              { key: 'policies', label: 'Policies', icon: ShieldCheck, module: 'policies', badge: 3, onPress: say('Policies') },
              { key: 'vendors', label: 'Vendors', icon: Building2, module: 'vendor', onPress: say('Vendors') },
            ]}
          />
        </Card>
      </Item>

      <Item name="UpcomingCards" note="Wide frosted cards (≈ ⅔ of the screen) that snap: icon top-left, title + value on one line, muted sub + meta under.">
        <UpcomingCards
          accessibilityLabel="Coming up"
          items={[
            { key: 'payday', icon: Banknote, module: 'pay', title: 'Payday', value: '₹48,250', sub: 'HDFC •••• 4125', meta: 'Thu, 30 Oct', onPress: say('Pay') },
            { key: 'diwali', icon: Gift, module: 'holidays', title: 'Diwali', value: 'Fri 31 Oct', sub: 'Public holiday', meta: 'In 11 days', onPress: say('Holidays') },
            { key: 'leave', icon: CalendarPlus, module: 'leave', title: 'Casual leave', value: '2 days', sub: 'Mon 3 – Tue 4 Nov', meta: 'Approved', onPress: say('Leave') },
            { key: 'shift', icon: Clock, module: 'shifts', title: 'General shift', value: '9:30 am', sub: 'Hyderabad office', meta: 'Tomorrow', onPress: say('My shift') },
            { key: 'emi', icon: HandCoins, module: 'pay', title: 'Advance EMI', value: '₹5,000', sub: '2 of 6 instalments', meta: 'Due 30 Oct' },
          ]}
        />
      </Item>

      <Item name="SelectTiles" note="Single select (radio): brand rim + soft fill + brand icon + ✓ on the chosen tile.">
        <View style={styles.stack}>
          <SelectTiles<LeaveKind>
            accessibilityLabel="Leave type"
            value={leaveKind}
            onChange={setLeaveKind}
            options={[
              { value: 'casual', label: 'Casual', icon: Sun },
              { value: 'sick', label: 'Sick', icon: HeartPulse },
              { value: 'wfh', label: 'WFH', icon: Laptop },
              { value: 'comp', label: 'Comp-off', icon: CalendarDays },
            ]}
          />
          <SelectTiles<ClockMode>
            accessibilityLabel="Clock-in mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'office', label: 'Office', icon: Building2, sub: 'Hyderabad · geo-fenced' },
              { value: 'remote', label: 'Remote', icon: House, sub: 'Selfie + location' },
            ]}
          />
          <SelectTiles<ExpenseKind>
            accessibilityLabel="Expense category"
            value={expense}
            onChange={setExpense}
            options={[
              { value: 'travel', label: 'Travel', icon: Car, sub: 'Cab, fuel' },
              { value: 'food', label: 'Food', icon: UtensilsCrossed, sub: 'Team meals' },
              { value: 'stay', label: 'Stay', icon: Building2, sub: 'Hotel', disabled: true },
            ]}
          />
        </View>
      </Item>

      <Item name="AccountRow" note="Frosted row: icon circle, title + masked sub, small frosted “Change” pill.">
        <View style={styles.stack}>
          <AccountRow icon={Landmark} module="pay" title="HDFC Bank" sub="Salary account •••• 4125" onChange={say('Change bank account')} />
          <AccountRow
            left={<Avatar name="Meera Krishnan" size={44} ring={false} />}
            title="Meera Krishnan"
            sub="Approver · Engineering manager"
            onChange={say('Change approver')}
          />
          <AccountRow icon={ReceiptText} module="pay" title="Payslip month" sub="September 2026" onPress={say('Pick payslip month')} />
        </View>
      </Item>

      <Item name="SummaryCard" note="Muted keys left, values right; status pill value; dashed rule + larger total.">
        <View style={styles.stack}>
          <SummaryCard
            title="Leave summary"
            rows={[
              { label: 'Type', value: 'Casual leave' },
              { label: 'From', value: 'Mon, 3 Nov 2026' },
              { label: 'To', value: 'Tue, 4 Nov 2026' },
              { label: 'Approver', value: 'Meera Krishnan' },
              { label: 'Reason', value: 'Sister’s wedding in Vijayawada — travelling on Sunday night' },
              { label: 'Status', value: 'Pending', status: 'pending' },
            ]}
            total={{ label: 'Days', value: '2' }}
          />
          <SummaryCard
            title="Claim details"
            rows={[
              { label: 'Request ID', value: 'EXP-2026-0412' },
              { label: 'Amount', value: '₹1,250.00' },
              { label: 'GST (18 %)', value: '₹225.00', hint: 'Bill uploaded' },
              { label: 'Status', value: 'Completed', status: 'done' },
            ]}
            total={{ label: 'Total', value: '₹1,475.00' }}
          />
        </View>
      </Item>

      <Item name="MetricRow" note="Dot + label, light big fraction with greyed denominator, soft status pill, •••.">
        <View style={styles.stack}>
          <MetricRow module="leave" label="Casual leave" value={6} total={12} status={{ label: 'Active', tone: 'neutral' }} onMore={say('Casual leave menu')} />
          <MetricRow module="attendance" label="Sick leave" sub="Resets on 1 Jan" value={2} total={8} status={{ label: 'Low', tone: 'pending' }} onPress={say('Sick leave')} onMore={say('Sick leave menu')} />
          <MetricRow module="timesheets" label="Timesheet · this week" value={38.5} total={40} unit="h" status={{ label: 'Complete', tone: 'done' }} onMore={say('Timesheet menu')} />
          <MetricRow module="bounty" label="Bounty submissions" value={3} total={5} status={{ label: 'Overdue', tone: 'failed' }} />
        </View>
      </Item>

      <Item name="PillSelector" note="Small frosted pill with a leading glyph / icon and a chevron; opens the caller's picker.">
        <View style={styles.pills}>
          <PillSelector icon={CalendarDays} label="October 2026" onPress={say('Open month picker')} />
          <PillSelector glyph="₹" label="INR" onPress={say('Open currency picker')} />
          <PillSelector label="This week" onPress={say('Open range picker')} />
        </View>
      </Item>
    </View>
  );
}

const IOS = Platform.OS === 'ios';

const styles = themedStyles(() => ({
  // The list kit's WHITE_CARD look (frostStrong body, bright rim), read live so it follows light / dark.
  whiteCard: { backgroundColor: IOS ? palette.frostStrong : palette.glassStrong, borderColor: IOS ? palette.glassEdge : palette.glassLine },
  section: { gap: space.xl },
  item: { gap: space.sm },
  caption: { gap: 2 },
  stack: { gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
}));
