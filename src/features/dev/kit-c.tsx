// Kit gallery section C (dev only): data visualisation from docs/REFERENCE-COMPONENTS.md items 16–23 —
// Numeral (+ NumeralRow), GlowLineChart (and AreaChart, which now draws with it), PillBarChart,
// SparkCard, StripedProgress, RankSlider, RadialArc and WashStatCard. Each sits under a small caption
// with its name so it can be compared with the Lendora / Payno reference. Demo content only.

import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { moduleTone, palette, space } from '@/theme/tokens';
import {
  AreaChart,
  Card,
  GlowLineChart,
  Numeral,
  NumeralRow,
  PillBarChart,
  RadialArc,
  RankSlider,
  SparkCard,
  StripedProgress,
  Text,
  TwoUp,
  WashStatCard,
} from '@/ui';

import { themedStyles } from '@/theme/themed';
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

/** Title + muted sub-line at the top of a demo card (Lendora "Rates Analytics / Updated …"). */
function CardTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.cardTitle}>
      <Text variant="body" color={palette.ink} numberOfLines={1}>
        {title}
      </Text>
      {sub ? (
        <Text variant="label" muted numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const rupees = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const rupeesK = (v: number) => `₹${(v / 1000).toFixed(1)}K`;
const hours = (v: number) => (v ? `${v}h` : 'Off');

// Demo data (Sunday-first week, as the pills read S M T W T F S).
const WEEK_HOURS = [0, 9.2, 8.5, 8.1, 9.4, 7.4, 0];
const LATE_MINUTES = [0, 12, 0, 4, 25, 9, 0];
const TAKE_HOME = [52400, 52400, 54100, 53800, 56900, 58250];
const TAKE_HOME_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const DAILY = [8.4, 9.2, 8.5, 8.1, 9.4, 7.4];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function KitSectionC() {
  const [day, setDay] = useState(4);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="title" accessibilityRole="header">
          C · Data visualisation
        </Text>
        <Text variant="label" muted>
          Lendora giant numerals and glow charts, Payno earning pills and the striped limit bar.
        </Text>
      </View>

      <Item name="16 · Numeral" note="ExtraLight figure, superscript prefix / unit, greyed decimals, tiny delta arrow top-right, caption under. lg 48 · md 36 · onDark.">
        <Card tone="frost">
          <CardTitle title="Attendance analytics" sub="Updated today at 9:00 AM" />
          <NumeralRow style={styles.numerals}>
            <Numeral value={42.6} unit="h" delta={{ direction: 'up', label: '+3h 40m' }} caption="Hours this week" />
            <Numeral value={92.4} prefix="%" delta={{ direction: 'down', label: '1.2%' }} caption="On time" />
            <Numeral value={6.5} unit="days" size="md" delta={{ direction: 'up', good: false, label: '2 more than last year' }} caption="Leave taken" />
          </NumeralRow>
        </Card>
        <Card tone="primary">
          <Numeral value={58250.75} prefix="₹" onDark delta={{ direction: 'up', label: '+₹1,350' }} caption="Take-home · September" />
        </Card>
      </Item>

      <Item name="17 · GlowLineChart" note="Monotone line with a sunset → coral ramp, soft halo, dashed guides with tiny y labels, dashed drop-lines, white point pills.">
        <Card tone="frost" style={styles.chartCard}>
          <CardTitle title="Take-home trend" sub="Last 6 payslips" />
          <GlowLineChart
            values={TAKE_HOME}
            labels={TAKE_HOME_MONTHS}
            guides={[50000, 55000]}
            formatGuide={(v) => `₹${v / 1000}K`}
            points={[
              { index: 1, value: rupeesK(TAKE_HOME[1]!), label: 'May', direction: 'flat' },
              { index: 3, value: rupeesK(TAKE_HOME[3]!), label: 'Jul', direction: 'down' },
              { index: 5, value: rupeesK(TAKE_HOME[5]!), label: 'Sep', direction: 'up' },
            ]}
            formatValue={(v) => rupees(v)}
          />
        </Card>
      </Item>

      <Item name="AreaChart → GlowLineChart" note="The existing AreaChart API (as on Me → Pay) now draws the glow look: one highlighted point, one guide.">
        <Card tone="frost" style={styles.chartCard}>
          <CardTitle title="Hours by day" sub="Target 8h" />
          <AreaChart values={DAILY} labels={DAYS} highlight={4} formatPoint={(v) => `${v}h`} guide={8} guideLabel="8h" zeroBased={false} />
        </Card>
      </Item>

      <Item name="18 · PillBarChart" note="Tap or slide along the pills: the selected day is a brand capsule with a white dot and a value pill. Frosted (top) / hatched (bottom).">
        <Card tone="frost" style={styles.chartCard}>
          <CardTitle title="This week" sub="Attendance · hours worked" />
          <PillBarChart
            values={WEEK_HOURS}
            selected={day}
            onSelect={setDay}
            formatValue={hours}
            value={42.6}
            unit="h"
            delta={{ label: '+4.2%', direction: 'up' }}
            accessibilityLabel="Hours this week"
          />
        </Card>
        <Card tone="frost" style={styles.chartCard}>
          <CardTitle title="Late by" sub="Minutes after shift start" />
          <PillBarChart
            values={LATE_MINUTES}
            idle="hatch"
            color={moduleTone.attendance.fg}
            formatValue={(v) => (v ? `${v} min` : 'On time')}
            value={50}
            unit="min"
            delta={{ label: '+18 min', direction: 'up', good: false }}
            accessibilityLabel="Minutes late this week"
          />
        </Card>
      </Item>

      <Item
        name="19 · SparkCard"
        note="Glowing squiggle, dot + dotted drop-line, 3-figure footer in a TwoUp. Top: Lendora columns; bottom: footerLayout “rows” for long labels.">
        <TwoUp>
          <SparkCard
            title="Leave"
            subtitle="This year"
            values={[1, 0, 2, 1, 0, 3, 1, 2, 0, 1]}
            footerLayout="columns"
            footer={[
              { label: 'Taken', value: 6 },
              { label: 'Balance', value: 12 },
              { label: 'Planned', value: 2 },
            ]}
          />
          <SparkCard
            title="Attendance"
            subtitle="This month"
            color={palette.coral}
            values={[8.2, 8.6, 7.9, 9.1, 8.4, 9.4, 8.8, 8.1]}
            highlight={5}
            footerLayout="columns"
            footer={[
              { label: 'Late', value: 2 },
              { label: 'Present', value: 18 },
              { label: 'Leave', value: 1 },
            ]}
          />
        </TwoUp>
        <TwoUp>
          <SparkCard
            title="Inbox"
            subtitle="This month"
            footerLayout="rows"
            color={palette.coral}
            values={[4, 6, 3, 8, 5, 9, 7, 6]}
            highlight={5}
            footer={[
              { label: 'Waiting', value: 4 },
              { label: 'Approved', value: 23 },
              { label: 'Rejected', value: 2 },
            ]}
          />
          <SparkCard
            title="Timesheets"
            subtitle="This week"
            footerLayout="rows"
            color={moduleTone.timesheets.fg}
            values={[6.5, 8, 7.5, 8.2, 4]}
            highlight={3}
            footer={[
              { label: 'Logged', value: '34.2h' },
              { label: 'Required', value: '40h' },
              { label: 'Unlogged', value: '5.8h' },
            ]}
          />
        </TwoUp>
      </Item>

      <Item name="20 · StripedProgress" note="Striped (or solid brand) fill, round % thumb riding the end of the fill, used / total above right, caption left.">
        <Card tone="frost" style={styles.stack}>
          <StripedProgress label="Leave used" used={8} total={24} formatValue={(v) => `${v} days`} />
          <StripedProgress label="Petty cash spent" used={6400} total={10000} formatValue={rupees} />
          <StripedProgress label="Salary advance repaid" used={15000} total={40000} formatValue={rupees} variant="solid" />
        </Card>
      </Item>

      <Item name="21 · RankSlider" note="Big centred rank after a small “No.”, gold change pill, thin sunset track with a ▲ marker and end labels.">
        <Card tone="frost" style={styles.stack}>
          <CardTitle title="Your rank" sub="Bounty leaderboard · October" />
          <RankSlider rank={7} worst={48} change={3} />
        </Card>
      </Item>

      <Item name="22 · RadialArc" note="270° gradient arc with a 15/22 centre fraction (denominator greyed), % pill in the opening, legend dots.">
        <Card tone="frost" style={styles.stack}>
          <CardTitle title="Attendance status" sub="October · working days" />
          <RadialArc
            value={15}
            total={22}
            caption="days marked"
            legend={[
              { label: 'Present', value: 13, color: palette.sunset },
              { label: 'Late', value: 2, color: palette.coral },
              { label: 'Left', value: 7, color: palette.textFaint },
            ]}
          />
        </Card>
      </Item>

      <Item name="23 · WashStatCard" note="sunsetLight wash, giant Numeral, slider bar with a solid ▲ standing on it, 0% · 50% · 100% ticks (middle in ink), footer.">
        <WashStatCard
          value={92.4}
          prefix="%"
          delta={{ direction: 'up', label: '+2.1%' }}
          caption="Attendance score this month — 19 of 21 days on time"
          progress={0.924}
          footerLeft="October"
          footerRight="21 working days"
        />
      </Item>
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { gap: space.xl },
  sectionHead: { gap: space.xxs },
  item: { gap: space.xs },
  caption: { gap: 2, paddingLeft: space.xxs },
  cardTitle: { gap: 2 },
  numerals: { marginTop: space.md },
  chartCard: { gap: space.md },
  stack: { gap: space.lg },
}));
