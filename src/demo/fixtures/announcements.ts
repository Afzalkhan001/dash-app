// Announcements (server.js GET /announcements — a plain array of ANNOUNCEMENT_LIST_FIELDS rows for
// my company) and the three lazy file routes. A few rows carry drawn pictures (SVG data URLs, as the
// chat fixture does): one Home Banner Image, two image posts (one a "full bleed" poster). Every other
// row has hasMedia / hasHomeBanner / hasPhoto false and the file routes answer with empty strings,
// exactly as the server does for a row without one. Today's birthday and work-anniversary cards are posted the
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

// ── Drawn pictures (the fixture cannot serve real uploads) ──
const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// A wide festive banner (the web's Home Banner Image is wide artwork with its own words).
const DIWALI_BANNER = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B0A45"/><stop offset="1" stop-color="#B5340F"/></linearGradient>` +
    `<radialGradient id="l" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFD27A"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="1280" height="640" fill="url(#g)"/>` +
    [140, 330, 980, 1150, 760].map((x, i) => `<circle cx="${x}" cy="${120 + (i % 3) * 150}" r="${70 + i * 8}" fill="url(#l)" opacity="0.8"/>`).join('') +
    [200, 420, 640, 860, 1080].map((x) => `<g transform="translate(${x} 540)"><ellipse cx="0" cy="20" rx="46" ry="16" fill="#E7A33E"/><path d="M0 -40 C 16 -14, 14 6, 0 10 C -14 6, -16 -14, 0 -40 Z" fill="#FFC94D"/></g>`).join('') +
    `<text x="640" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="96" font-weight="700" fill="#FFE7B0">Diwali Bash</text>` +
    `<text x="640" y="330" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#FFFFFF">Friday · 6 pm · Studio terrace</text>` +
    `<text x="640" y="390" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#FFE7B0">Rangoli contest · Sweets · Music</text>` +
    `</svg>`,
);

// A photo-like award picture (an image post: the app puts the title over it).
const AWARD_PHOTO = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">` +
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2A3A"/><stop offset="1" stop-color="#3D2A1A"/></linearGradient>` +
    `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE29A"/><stop offset="1" stop-color="#C88A1E"/></linearGradient></defs>` +
    `<rect width="1200" height="800" fill="url(#b)"/>` +
    [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${100 + i * 200} 0 L${300 + i * 120} 800 L${240 + i * 120} 800 Z" fill="#FFFFFF" opacity="0.05"/>`).join('') +
    `<path d="M520 230 h160 v40 c0 70 -40 120 -80 130 c-40 -10 -80 -60 -80 -130 Z" fill="url(#gold)"/>` +
    `<rect x="585" y="400" width="30" height="80" fill="url(#gold)"/><rect x="530" y="480" width="140" height="40" rx="6" fill="url(#gold)"/>` +
    `<circle cx="600" cy="300" r="34" fill="#FFF3C9" opacity="0.6"/>` +
    `</svg>`,
);

// A finished poster with its own words (a "full bleed" image post: shown whole, nothing over it).
const SAFETY_POSTER = svgUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">` +
    `<rect width="900" height="900" fill="#0F7A72"/>` +
    `<rect x="60" y="60" width="780" height="780" rx="40" fill="#FFFFFF" opacity="0.08"/>` +
    `<path d="M450 170 L640 250 V430 C640 560 550 650 450 700 C350 650 260 560 260 430 V250 Z" fill="#FFD27A"/>` +
    `<path d="M370 440 L430 500 L540 380" stroke="#0F7A72" stroke-width="34" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="450" y="780" text-anchor="middle" font-family="sans-serif" font-size="58" font-weight="700" fill="#FFFFFF">Safety first on set</text>` +
    `</svg>`,
);

const BANNERS: Record<string, string> = { 'ann-demo-diwali': DIWALI_BANNER };
const MEDIA: Record<string, { fileData: string; fileName: string }> = {
  'ann-demo-award': { fileData: AWARD_PHOTO, fileName: 'goafest-gold.svg' },
  'ann-demo-safety': { fileData: SAFETY_POSTER, fileName: 'safety-poster.svg' },
};

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
    id: 'ann-demo-diwali',
    title: 'Diwali Bash this Friday',
    body: 'Join us on the studio terrace from 6 pm: rangoli contest by team, sweets, music and the annual awards. Families are welcome. Wear something festive!',
    hasHomeBanner: true,
    expiresAt: addDays(T0, 10),
    createdAt: minutesAgo(3 * 60),
  }),
  base({
    id: 'ann-demo-award',
    type: 'image',
    title: 'We won Gold at Goafest for the Nimbus explainer',
    body: 'The Nimbus explainer series took Gold in the Best Animated Film category. Huge thanks to the Creative and Post teams for months of late nights. Celebration lunch on Monday!',
    hasMedia: true,
    fileName: 'goafest-gold.svg',
    createdBy: 'Kiran Rao',
    createdByRole: 'ceo',
    createdAt: daysAgo(2, '18:20'),
  }),
  base({
    id: 'ann-demo-safety',
    type: 'image',
    title: 'Safety first on set',
    body: 'Every shoot now starts with a five-minute safety check: cables taped, lights sandbagged, exits clear. Producers will run it before the first take.',
    hasMedia: true,
    fullBleed: true,
    fileName: 'safety-poster.svg',
    createdBy: 'Arvind Menon',
    createdByRole: 'coo',
    createdAt: daysAgo(4, '10:00'),
  }),
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
  ['GET', /^\/announcements\/([^/]+)\/media$/, ([, id]) => MEDIA[String(id)] ?? { fileData: '', fileName: '' }],
  ['GET', /^\/announcements\/([^/]+)\/banner$/, ([, id]) => {
    const art = BANNERS[String(id)];
    return art ? { homeBannerImage: art, homeBannerImageName: 'diwali-banner.svg' } : { homeBannerImage: '', homeBannerImageName: '' };
  }],
  ['GET', /^\/announcements\/([^/]+)\/photo$/, () => ({ photo: '' })],
];

// ── Exports for the domain fixtures (Wave 0, docs/port/EXTENSION-POINTS.md §10) ──
// The live news list GET /announcements answers from, so a post made in the News studio (newsroom
// domain) shows on Home and in News at once. `makeAnnouncement` fills the server's defaults.
export const newsStore: Announcement[] = ANNOUNCEMENTS;
// The seeded rows' drawn pictures, so the newsroom fixture's file routes (which answer first) serve them.
export const seedMedia = (): [string, { fileData: string; fileName: string }][] => Object.entries(MEDIA);
export const seedBanners = (): [string, { homeBannerImage: string; homeBannerImageName: string }][] =>
  Object.entries(BANNERS).map(([id, art]) => [id, { homeBannerImage: art, homeBannerImageName: `${id}-banner.svg` }]);
export const makeAnnouncement = base;
