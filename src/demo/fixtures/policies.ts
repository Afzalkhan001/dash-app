// HR policies with acknowledgement (hr_policies.js): the published list with my acked_at for the
// current version, one policy's full text (plain text: blank lines are paragraphs, short lines are
// headings, "- " lines are lists), and POST /:id/acknowledge { version } (refused with 409 when the
// version on screen is not the current one, or the policy needs no acknowledgement).

import type { AckResult, Policy } from '@/api/policies';
import { daysAgo, fail, nowIso, type Route } from '@/demo/state';

const POLICIES: Policy[] = [
  {
    id: 'hpo-demo-wfh',
    title: 'Work From Home & Remote Attendance',
    category: 'Attendance',
    version: 2,
    requires_ack: true,
    status: 'published',
    audience: [],
    published_at: daysAgo(3, '17:30'),
    updated_at: daysAgo(3, '17:30'),
    link_url: '',
    acked_at: null,
    body: `Purpose

This policy explains when you may work from home and how remote attendance is recorded in DASH. Version 2 adds the hourly location check-ins.

Who can work from home

- Employees whose department has the Work From Home module switched on.
- Up to 4 WFH days a month, applied for in DASH at least one working day in advance.
- Shoot days, client reviews and colour sessions are always in person.

Clocking in remotely

- Turn on "I am working remotely" before you clock in.
- While you are clocked in remotely, DASH records your location once an hour for up to 9 hours. Keep the app open with location allowed.
- Remote days without an approved WFH request are reviewed by your department admin.

Timesheets

Remote days need a timesheet like any other day. Unaccounted time is recorded as buffer time and is visible to your manager.

Questions

Write to hr@tamadamedia.com or raise an HR complaint from Support.`,
  },
  {
    id: 'hpo-demo-posh',
    title: 'Prevention of Sexual Harassment (POSH)',
    category: 'Compliance',
    version: 1,
    requires_ack: true,
    status: 'published',
    audience: [],
    published_at: daysAgo(9, '11:00'),
    updated_at: daysAgo(9, '11:00'),
    link_url: '',
    acked_at: null,
    body: `Our commitment

Tamada Media is committed to a workplace free of sexual harassment, in line with the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013.

What counts as sexual harassment

- Unwelcome physical contact or advances.
- A demand or request for sexual favours.
- Sexually coloured remarks, jokes or messages, including on WhatsApp and social media.
- Showing pornography, or any other unwelcome conduct of a sexual nature.

Internal Committee

Complaints are heard by the Internal Committee (IC), chaired by a senior woman employee, with an external member. Contact the IC at ic@tamadamedia.com. Every complaint is confidential.

How to raise a complaint

1. Write to the IC within three months of the incident.
2. The IC acknowledges within 2 working days and completes its inquiry within 90 days.
3. Retaliation against anyone who complains or gives evidence is itself misconduct.

This policy applies on shoots, at client locations and at company events as much as in the office.`,
  },
  {
    id: 'hpo-demo-leave',
    title: 'Leave Policy 2026',
    category: 'Leave',
    version: 3,
    requires_ack: true,
    status: 'published',
    audience: [],
    published_at: daysAgo(160, '10:00'),
    updated_at: daysAgo(160, '10:00'),
    link_url: '',
    acked_at: daysAgo(158, '09:42'),
    body: `Leave year

The leave year runs from January to December.

Entitlement

- Casual Leave: 12 days a year, credited in January. Can be taken as half days.
- Sick Leave: 8 days a year. A medical certificate is needed for more than two consecutive days.
- Earned Leave: 15 days a year, accruing monthly. Up to 30 days carry forward.
- Comp-off: one day for a full day worked on a weekly off or a company holiday, claimed within 30 days and used within 90 days.

Applying

Apply in DASH (Leave tab). Your department admin approves. Planned leave of three days or more should be applied for two weeks ahead.`,
  },
  {
    id: 'hpo-demo-conduct',
    title: 'Code of Conduct',
    category: 'General',
    version: 4,
    requires_ack: true,
    status: 'published',
    audience: [],
    published_at: daysAgo(210, '10:00'),
    updated_at: daysAgo(210, '10:00'),
    link_url: '',
    acked_at: daysAgo(205, '18:05'),
    body: `Respect

Treat colleagues, clients, talent and crew with respect, on set and off.

Confidentiality

- Client footage, scripts and campaign plans are confidential until the client releases them.
- Never post work-in-progress, set photos or BTS on personal social media without the producer's approval.

Company equipment

Cameras, lenses, drives and laptops are issued against your name. Report loss or damage to IT the same day.

Conflicts of interest

Freelance work for a competing agency or a current client needs written approval from your manager.`,
  },
  {
    id: 'hpo-demo-travel',
    title: 'Travel, Shoot & Expense Reimbursement',
    category: 'Finance',
    version: 2,
    requires_ack: false,
    status: 'published',
    audience: [],
    published_at: daysAgo(95, '15:00'),
    updated_at: daysAgo(95, '15:00'),
    link_url: '',
    acked_at: null,
    body: `What can be claimed

- Local travel to shoots and client locations (cab or auto; keep the app receipt).
- Food on shoot days and late sessions beyond 9 pm, up to ₹600 a person.
- Fuel for personal vehicles used for shoots, at ₹8 per km for two-wheelers and ₹14 per km for cars.

How to claim

Submit the bill in DASH → Reimbursements against the project's Keka Code within 30 days. The Keka Code Owner approves, then Accounts authorizes and pays.

Petty cash

For shoots, request petty cash in advance and submit every bill against it afterwards. Bills above the advance raise an extra claim automatically.`,
  },
];

const summary = ({ body: _body, ...p }: Policy) => p;

function acknowledge(id: string, body: unknown): AckResult | ReturnType<typeof fail> {
  const p = POLICIES.find((x) => x.id === id && x.status === 'published');
  if (!p) return fail('Policy not found.', 404);
  if (!p.requires_ack) return fail('This policy does not need an acknowledgement.', 409);
  const v = (body as { version?: unknown })?.version;
  if (!Number.isInteger(v) || v !== p.version) return fail('This policy was updated since you opened it. Please read the latest version.', 409);
  if (p.acked_at) return { ok: true, already: true };
  p.acked_at = nowIso();
  return { ok: true, acked_at: p.acked_at, version: p.version };
}

export const policyRoutes: Route[] = [
  ['GET', /^\/hr\/policies$/, () => ({ ok: true, policies: POLICIES.map(summary) })],
  [
    'GET',
    /^\/hr\/policies\/([^/]+)$/,
    ([, id]) => {
      const p = POLICIES.find((x) => x.id === id && x.status === 'published');
      return p ? { ok: true, policy: p } : fail('Policy not found.', 404);
    },
  ],
  ['POST', /^\/hr\/policies\/([^/]+)\/acknowledge$/, ([, id], body) => acknowledge(id!, body)],
];
