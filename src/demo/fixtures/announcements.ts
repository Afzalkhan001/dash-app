// Announcements (server.js GET /announcements — a plain array of ANNOUNCEMENT_LIST_FIELDS rows for
// my company) and the three lazy file routes. The demo carries no images or files, so every row has
// hasMedia / hasHomeBanner / hasPhoto false and the file routes answer with empty strings, exactly as
// the server does for a row without one. Today's birthday and work-anniversary cards are posted the
// way the server's celebration sweep posts them (type 'birthday' / 'anniversary', targetEmployeeId).

import type { Announcement } from '@/api/announcements';
import { DEMO_TENANT_ID } from '@/demo/config';
import { personById } from '@/demo/fixtures/org';
import { addDays, daysAgo, holidaysFor, istIso, minutesAgo, today, type Route } from '@/demo/state';

const T0 = today();
const year = T0.slice(0, 4);

const upcoming = [...holidaysFor(year), ...holidaysFor(String(Number(year) + 1))].filter((h) => !h.optional && h.date > T0).sort((a, b) => a.date.localeCompare(b.date))[0];
const niceDate = (ymd: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T00:00:00Z`));

const base = (a: Announcement): Announcement => ({
  type: 'text',
  branches: ['all'],
  expiresAt: null,
  scheduledAt: null,
  createdBy: 'Lakshmi Prasad',
  createdByRole: 'hr',
  tenantId: DEMO_TENANT_ID,
  hasMedia: false,
  hasHomeBanner: false,
  kind: 'announcement',
  ...a,
});

const sneha = personById('u-sneha');
const anita = personById('u-anita');

const ANNOUNCEMENTS: Announcement[] = [
  base({
    id: 'ann-demo-bday',
    type: 'birthday',
    title: `Happy Birthday, ${sneha?.name ?? 'Sneha'}!`,
    body: '',
    targetName: sneha?.name,
    targetEmployeeId: 'u-sneha',
    jobTitle: sneha?.jobTitle,
    department: 'Creative',
    autoKind: 'birthday',
    expiresAt: T0,
    createdBy: 'DASH',
    createdByRole: 'system',
    createdAt: istIso(T0, '00:05'),
    hasPhoto: false,
  }),
  base({
    id: 'ann-demo-anniv',
    type: 'anniversary',
    title: `Happy Work Anniversary, ${anita?.name ?? 'Anita'}!`,
    body: '',
    targetName: anita?.name,
    targetEmployeeId: 'u-anita',
    years: anita ? Number(T0.slice(0, 4)) - Number(String(anita.dateJoined).slice(0, 4)) : 4,
    jobTitle: anita?.jobTitle,
    department: 'Creative',
    autoKind: 'anniversary',
    expiresAt: T0,
    createdBy: 'DASH',
    createdByRole: 'system',
    createdAt: istIso(T0, '00:06'),
    hasPhoto: false,
  }),
  ...(upcoming
    ? [
        base({
          id: 'ann-demo-holiday',
          title: `Office closed for ${upcoming.name}`,
          body: `The office will remain closed on ${niceDate(upcoming.date)} for ${upcoming.name}. Shoots scheduled that day go ahead as planned — producers will confirm crew separately. Wishing you and your family a joyful ${upcoming.name}!`,
          expiresAt: upcoming.date,
          createdAt: minutesAgo(20 * 60),
        }),
      ]
    : []),
  base({
    id: 'ann-demo-townhall',
    title: 'Town hall: Q3 results and the 2027 plan',
    body: 'Join Kiran and Arvind in the main studio this Friday at 4:30 pm (and on Google Meet for the Vizag team). We will go through Q3 numbers, the three new retainers, and what changes for production next year. Snacks after.',
    createdBy: 'Kiran Rao',
    createdByRole: 'ceo',
    expiresAt: addDays(T0, 7),
    createdAt: daysAgo(1, '10:15'),
  }),
  base({
    id: 'ann-demo-declare',
    type: 'link',
    title: 'Submit your investment declarations by the 15th',
    body: 'Payroll will use your declarations to calculate TDS for the rest of the financial year. Check your Form 26AS and AIS on the income-tax portal before you declare.',
    linkUrl: 'https://www.incometax.gov.in/iec/foportal/',
    ctaText: 'Open the e-filing portal',
    createdAt: daysAgo(3, '12:00'),
  }),
  base({
    id: 'ann-demo-welcome',
    title: 'Welcome Nikhil Jain to the Creative team',
    body: 'Nikhil joins as an Assistant Editor and will work with Afzal on the Nimbus explainer series. Say hello on the 2nd floor!',
    createdBy: 'Priya Sharma',
    createdByRole: 'manager',
    createdAt: daysAgo(6, '11:30'),
  }),
  base({
    id: 'ann-demo-nas',
    title: 'NAS maintenance on Saturday',
    body: 'NAS-01 and NAS-02 will be offline on Saturday from 10 am to 2 pm for a firmware upgrade. Please copy anything you need for weekend work to a local drive by Friday evening.',
    createdBy: 'Naveen Kumar',
    createdByRole: 'it_admin',
    createdAt: daysAgo(9, '16:45'),
  }),
  base({
    id: 'ann-demo-cafeteria',
    title: 'New cafeteria vendor from Monday',
    body: 'Based on your feedback, lunch is now from Annapurna Caterers — South Indian thali on Mondays, Wednesdays and Fridays, North Indian on the other days. Breakfast timings stay 8:30–10:00 am.',
    createdAt: daysAgo(15, '09:00'),
  }),
  // A pop-up (never in the feed) and an expired notice — both are filtered out by the app, as on the web.
  base({ id: 'ann-demo-popup', kind: 'popup', title: 'Update your emergency contact', body: 'Please add an emergency contact to your profile.', popupFrequency: 'once', createdAt: daysAgo(4, '09:00') }),
  base({ id: 'ann-demo-old', title: 'Ganesh Chaturthi celebrations', body: 'Puja at 11 am in the lobby.', expiresAt: daysAgoYmd(30), createdAt: daysAgo(35, '09:00') }),
];

function daysAgoYmd(n: number) {
  return addDays(T0, -n);
}

export const announcementRoutes: Route[] = [
  ['GET', /^\/announcements$/, () => ANNOUNCEMENTS],
  ['GET', /^\/announcements\/([^/]+)\/media$/, () => ({ fileData: '', fileName: '' })],
  ['GET', /^\/announcements\/([^/]+)\/banner$/, () => ({ homeBannerImage: '', homeBannerImageName: '' })],
  ['GET', /^\/announcements\/([^/]+)\/photo$/, () => ({ photo: '' })],
];
