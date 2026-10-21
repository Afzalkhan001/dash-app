# Hiring domain — hand-off for the integrator (wave 2)

Scope: job openings, the referral pipeline, Public Careers applications, Refer & earn
(docs/port/hr-people.md §1.F, §2.3, §4.5). Website: ReferralHub, dash.html:15263-16280; server.js:7595-8790.

## Plugged in
- [ ] **More › links** (`nav.ts`): `hiring.refer` "Refer & earn" → `/admin/hiring/refer` (order 20, `tourId`
  `more.hiring.refer`) — navForRaw `referrals` + the company switch, only when the person can post
  openings or at least one posting exists (:1532).
- [ ] **More › People & HR**: `hiring.desk` "Hiring" → `/admin/hiring` (order 30, `tourId` `more.hiring.desk`) —
  job-opening creators (hr, super_admin, ceo, coo), the Application Manager (read only) and anyone HR forwarded
  a referral or an application to.
- [ ] **+ sheet**: `hiring.post` "Post job" → `/admin/hiring/edit` (order 70), creators only. Drop it if the
  per-role cap needs the room (the Positions hero has the same button).
- [ ] **Inbox kind** `referral` "Referrals" (`inbox.ts`, `poll: false` — GET /referrals runs the server's
  eligibility sweep): creators get new (submitted) and shortlisted referrals while the posting is open, and
  bonuses ready to approve (eligible); a forwarded reviewer gets hr_accepted referrals forwarded to them. No
  queue for app_manager. Detail = `features/hiring/candidate-screen` (also `/admin/hiring/candidate/<id>`).
  It calls `noteDecision('referral:<id>', …)` for "Done today". No History chip.
- [ ] **Home cards**: none.
- [ ] **Tour** (`tour.ts`): `hiring.desk` on More's Hiring row, else `hiring.refer` on the Refer & earn link.
- [ ] **Bounty hub** (PLAN pass 2): mount `<ReferCard />` from `features/hiring/refer-card.tsx` on
  `app/(app)/bounty/index.tsx` (bountyadmin owns that file). It renders `null` when the person is off the
  Referral Program or while the job list loads.

## Please decide / promote
- [ ] **Data-driven menu gate.** `workspaceRows` must stay pure, but the website gates Refer & earn on
  `JOB_OPENINGS.length` and Hiring on "was something forwarded to me". `nav.ts` reads those from the query
  cache (`features/hiring/signals`: `['hiring','jobs',uid]`, `['inbox','referral',uid]`,
  `['hiring','apps',uid,'','','']`), which the Inbox plug-in's `useItems` keeps warm. On a first-ever launch
  the More row can appear only after More re-renders. Cleaner: add `jobOpenings` (and optionally the two
  forwarded flags) to `useAccess()` so `access.web('referrals')` is enough. `features/hiring/access.ts`
  `canSeeReferrals(u, t, jobs)` is the gate to call.
- [ ] Gates others may want: `isHiringOverseer`, `canSeeReferrals`.

## Routes (all under `src/app/(app)/admin/hiring/`, default Stack options)
`index` (segments Jobs · Candidates · Applicants, `?tab=` picks one) · `edit` (`?id=` edits, none posts) ·
`position/[id]` · `candidate/[id]` · `application/[id]` · `refer/index` · `refer/[id]` · `refer/new?job=` ·
`refer/mine`. Each re-checks its gate (features/hiring/use-hiring `ready` first) and `Redirect`s to `/`.

## Safety
- Swipes (ConfirmSheet + SwipeToConfirm), each saying who is told: post a job (public → careers page), make a
  posting public, close, delete for good, refer someone, accept & forward (reviewer emailed), shortlist,
  select (says when it closes the posting), reject (reason optional, the referrer sees it), link employee
  record, approve bonus (coins move, can't be undone; 402 shown in the server's words), public application
  status (candidate sees it + the note), send application to a reviewer (emailed). Reopen saves directly.
- Referral and application lists are `meta:{persist:false}` (candidates' personal data); job pictures too.
- No self-heal: the app never closes a full posting itself (the server's GET does).
- Internal notes on a public application: the box is HR-only — the server's notes route only lets HR-tier
  through (server.js:8781 reads `job_id` only), although the website shows the box to forwardees.
- Public application résumés are binary (`downloadAuthed`); the demo account can't download them (it says so).

## Demo (`src/demo/fixtures/hiring.ts`)
- Answers `/job_openings` (+ `/image`, POST/PUT/DELETE, `/close`, `/reopen`), `/referrals` (+ `/resume` with a
  tiny PDF, POST, `hr-accept`, `shortlist`, `select` (auto-close when full), `reject`, `map-employee` (409 when
  already mapped), `approve-bonus` (402 when the poster is short)), `/admin/public-applications` (list,
  detail, status, forward, notes). The eligibility sweep runs on GET /referrals like the server.
- Seeds: 4 postings (Motion Designer open/public/500 coins/2 positions/1 filled; Social Media Manager open/no
  bonus; Junior Video Editor closed/300; Senior Video Editor closed/2025); 9 referrals — one per status
  (two submitted), hr_accepted forwarded to **Afzal Manager** (`demo-manager`), three are the demo person's own;
  3 public applications (one forwarded to Afzal Manager).
- **Adds one person** through `org.ts upsertPerson`: Harini Rao (u-harini, TM-1131, Creative, joined 40 days
  ago) — the "in the 3-month period" hire. She shows on the roster and directory.
- **Uses the shared bounty wallets** (`bounty.ts walletOf`, `addTx`): a bonus is paid from the active persona's
  Referral Coins pool (`walletOf('demo-hr')` etc. — the pool bountyadmin.ts seeds and shows on
  GET /bounty/wallet/<me>; Afzal HR has 2,500 available, Afzal Super Admin none → 402). It raises the pool's
  `referralSpent`, adds `earned`/`referralEarned` to the referrer and writes one `REFERRAL_BONUS_TRANSFER`
  (from `<poster>:referral`, so it never shows as a debit in the demo person's own ledger).
- No new dependencies, no persona or Stack changes.

## Tested (web preview, own tab; swipes fired through SwipeToConfirm's accessibility activate handler)
- Afzal HR (390×844): Inbox › Referrals (4: two new, a shortlisted one, a bonus to approve) → approve bonus
  (300 coins paid, timeline + "Bonus paid"); Hiring › Jobs (hero, filled counts), Candidates (status chips,
  counts) → accept & forward (hiring manager preset, "Change" → picker → Deepa Menon) → select (posting
  auto-closed when full) → link employee record (Harini → 409 "already mapped" shown in the sheet; Nikhil →
  mapped → swept to eligible); position: reopen, close (swipe), delete sheet; Post a job (cities chips,
  department chip, bonus, public → swipe → opens the new posting); Applicants: status change with a
  candidate note (swipe), internal note, send to someone else (swipe). More shows Refer & earn + Hiring.
- Afzal Manager: More shows Hiring ("Candidates HR sent you"); Inbox › Referrals shows Rohit only while the
  posting is open; shortlist (swipe) → "Shortlisted. Waiting for HR's decision."; no HR columns.
- Afzal App Manager: Candidates only, read-only line, résumé-opened column, no buttons.
- Afzal Super Admin: approve bonus → 402 in the server's words (no referral coins).
- Afzal Employee: Refer & earn (earned 500 from Sanjay, My referrals 4) → position → Refer someone →
  validation → résumé (web picker fallback) → swipe → SuccessSheet → My referrals shows the new one.
  No Hiring row; /admin/hiring redirects home. Afzal IT Admin: Refer & earn only, /admin/hiring redirects.
- 320×700 dark: refer, refer/[id], refer/new, mine, hub (all three segments), candidate, application,
  position, edit — no horizontal overflow (the status chips row scrolls sideways by design).
- Deep link / cold start: the gate waits for the cache restore (useIsRestoring) before redirecting.
- Not testable on web: résumé download of a public application (binary; the demo says it can't download);
  native share sheet for referral résumés.
