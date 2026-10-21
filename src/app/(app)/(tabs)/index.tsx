// Home — the few things an employee comes for, in this order and nothing else (docs/REFERENCE-
// COMPONENTS.md §3 Home: the Payno × Lendora revamp; colours stay the Ember tokens, light and dark):
//   header      kit HomeHeader (features/home/header.tsx): my photo (→ profile), a small muted "Good
//               morning 👋" over my first name, and the Lendora IconPillGroup: bell (→ News, a dot
//               while something new was posted) + inbox (→ Inbox, a dot while something waits — the
//               number itself is only on the Inbox tab). No logo
//   1 hero      the clock in / out card for people who clock in — the screen's one bold colour moment
//               (vermilion gradient, the timer as giant numerals, white Clock in / Clock out pill +
//               "…"); otherwise a light wash "Today" card with the date (features/home/greeting.tsx)
//   2 actions   kit CategoryGrid right under the hero: Apply leave · Payslips · Attendance · Claim
//               expense as frosted circles, each only with its module, and only when there are at
//               least two (one lone button reads as a stray)
//   3 coming up kit UpcomingCards: my shift's end while clocked in, my next approved leave, the next
//               holiday — with the Me screens' own queries and gates (features/home/coming-up.tsx)
//   4 needs you up to 3 things waiting on me (codes to read out, visitors, approvals, policies), a
//               kit ActivityList with "See all" → Inbox
//   5 people    kit AvatarTiles: who's in today (HR and department admins), then this week's
//               birthdays / work anniversaries
//   6 news      the announcement banner, or the latest announcement as one news card
// Every section is left out entirely when it has nothing to show (an empty one would still take a
// slot and a stack gap in <Screen>), so Home never ends in a blank gap; Screen withTabBar keeps the
// last one clear of the floating tab bar and its raised + button. Everything else about my work lives
// on the Me tab; the rest is in More.
//
// The first-sign-in tour (docs/TOUR.md) points at the Clock in pill, the shortcuts, Needs you and
// Who's in today, so those are wrapped as tour targets (plain Views, nothing visual).
//
// Access (/hr/me) comes from the cache saved on the phone. Until it is back (restoring on a cold
// start, or the very first load) Home does not know yet whether there is a clock card, so the hero
// slot stays empty instead of showing the "Today" card and then swapping it for the clock card.

import { useQueryClient } from '@tanstack/react-query';

import { useHrMe } from '@/api/me';
import { AnnouncementBanner, useHomeAnnouncements } from '@/features/announcements/home-banner';
import { ClockCard } from '@/features/attendance/clock-card';
import { ComingUp, useComingUp } from '@/features/home/coming-up';
import { TodayHero } from '@/features/home/greeting';
import { HomeTopBar } from '@/features/home/header';
import { NeedsYouCard, useNeedsYou } from '@/features/home/needs-you';
import { Shortcuts, useShortcuts } from '@/features/home/shortcuts';
import { useWhosIn, WhosInToday } from '@/features/home/whos-in';
import { CelebrationsCard, useCelebrations } from '@/features/people/celebrations';
import { useAccess } from '@/lib/use-access';
import { radius, space } from '@/theme/tokens';
import { Screen, TourTarget, useLayout } from '@/ui';

export default function HomeTab() {
  const qc = useQueryClient();
  const { compact } = useLayout();
  const access = useAccess();
  // isPending covers both the first load and the restore of the saved cache (isLoading misses the latter).
  const accessPending = useHrMe().isPending;
  const needs = useNeedsYou();
  const shortcuts = useShortcuts();
  const comingUp = useComingUp();
  const whosIn = useWhosIn();
  const news = useHomeAnnouncements();
  const celebrations = useCelebrations();
  const clock = access.sections.clock;
  // No clock card (and we know it): the light "Today" card is Home's hero instead.
  const noClock = !accessPending && !clock;

  return (
    <Screen
      withTabBar
      onRefresh={() => qc.invalidateQueries()}
      // Payno air: more room between Home's few sections than a dense list screen gets.
      contentStyle={{ gap: compact ? space.lg : space.xl, paddingTop: space.xs }}
      header={<HomeTopBar />}>
      {clock ? <ClockCard key="clock" tourId="home.clockButton" /> : null}
      {noClock ? <TodayHero key="today" /> : null}
      {shortcuts.length > 1 ? (
        <TourTarget key="shortcuts" id="home.shortcuts" radius={radius.xl}>
          <Shortcuts items={shortcuts} />
        </TourTarget>
      ) : null}
      {comingUp.length > 0 ? <ComingUp key="coming" items={comingUp} /> : null}
      {needs.rows.length > 0 ? (
        <TourTarget key="needs" id="home.needsYou" radius={radius.xl}>
          <NeedsYouCard data={needs} />
        </TourTarget>
      ) : null}
      {whosIn ? (
        <TourTarget key="whos-in" id="home.whosIn" radius={radius.xl}>
          <WhosInToday data={whosIn} />
        </TourTarget>
      ) : null}
      {celebrations ? <CelebrationsCard key="celebrations" data={celebrations} /> : null}
      {news ? <AnnouncementBanner key="news" data={news} /> : null}
    </Screen>
  );
}
