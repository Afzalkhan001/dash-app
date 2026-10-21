# Bounty admin — hand-off (wave 2)

Spec: `docs/port/hr-people.md` §1.H, §2.5, §4.6. No server, website or DB change. No new dependency.
Only owned files touched (plus `src/app/(app)/bounty/index.tsx`, PLAN §2.4).

## Routes (`src/app/(app)/admin/bounty/`)
- `index` — hub: one hero (company wallet / my task funds / use-coins waiting), "Waiting on you", Manage rows
- `tasks/index?show=check` — admin board (To check · Mine · All)
- `tasks/new` — Post a task (3 steps → ConfirmSheet swipe → SuccessSheet); phases, reference file (`pickDocument`) + link
- `tasks/[id]/index` — task + claimants; ••• Manage: Edit, Change reward (swipe, top-up warning), Extend deadline, Remind (preview counts → swipe; WhatsApp + email), Cancel task (swipe)
- `tasks/[id]/edit` — plain fields (cap never below joined)
- `tasks/[id]/claims/[emp]` — check one person's work: Swipe to approve & pay / Send back or Reject (swipe)
- `distribute` — Give coins (swipe) + balances; Revoke unused coins (Super Admin, swipe)
- `creators` — task-poster grant list (Super Admin, CEO, COO, HR edit; App Manager read-only) + monthly cap (Super Admin)
- `redemptions/index`, `redemptions/[id]` — approve (Amazon link + coupon) / decline, both swipes that say email + WhatsApp
- `wallet` — my task funds, referral coins, Return coins to company (swipe), recent history
- `ledger` — filters (dates, type, in/out, person), search, row sheet, Cancel a distribution (swipe), Share CSV
- `summary` — plain report figures (replaces the web XLSX/PDF)
No Stack options needed.

## Extension points
- **More › People & HR**: `bountyadmin.hub` "Bounty admin" → `/admin/bounty` (order 60, tour `more.bountyadmin.hub`). Shown when `canOpenBountyAdmin(bountyAdminGates(user, tenant))`.
- **+ sheet**: `bountyadmin.post` "Post task" → `/admin/bounty/tasks/new` (task posters only).
- **Home**: none.
- **Inbox kinds** (no History):
  - `bounty-claim` "Bounty work" — submitted claims I may decide (creator, master/super admin, app_manager + switch). Id `<taskId>~<employeeId>`. Query `['inbox','bounty-claim',uid]` (GET /bounty_tasks, shared with the admin board).
  - `bounty-coins` "Use coins" — pending redemptions (super_admin, hr, master; app_manager + switch). Query `['inbox','bounty-coins',uid]`.
- **Tour**: `bountyadmin.hub` on `/more`.
- **bounty/index.tsx**: "Bounty admin" row after Leaderboard for the same people.

## Gates (`access.ts`, cited) — promote if needed
`bountyAdminGates`, `canOpenBountyAdmin`, `canManageTask`, `canReviewTask`, `canDecideClaim`, `canRemindTask`, `canEditTask`, `canExtendOrCancel`, `canCancelTxn`, `canManageBountyCreators`, `canManageRedemptions`, `bountySystemOn`. The platform domain (Company Wallets) may want `COIN_RECALL_ROLES` / ledger helpers in `logic.ts`.

## For the integrator
- `features/bounty/wallet.tsx` `CreatorFundsCard` caption still says "Post tasks on the DASH website" — now possible in the app (`/admin/bounty/tasks/new`). Not my file.
- `useUpdateTenant` / `fetchFreshTenant` are imported from `api/company.ts` (creators list, cap).
- Person pickers use `GET /users` only (the web's creators card also lists invitations).

## Demo (`src/demo/fixtures/bountyadmin.ts`)
Uses bounty.ts exports only (`bountyTaskStore`, `txStore`, `redemptionStore`, `walletOf`, `addTx`, `bountyRoutes` handlers re-used for my wallet / my files). Overrides: `GET /bounty_transactions` (scoped like server.js:5506), `GET /bounty/wallet/demo-user` (adds the persona's task funds), `GET /bounty_tasks/:id/submissions/.../download` (creator/admin may open others' files). Adds: company wallet, creators-summary, distribute, revoke, return, reverse, full task GET, create / PUT / edit-reward / remind-preview / remind / approve / reject / cancel, redemption approve / decline.
Seeds: company wallet 12,000; funds for Afzal Super Admin (6,000), Afzal Manager (5,000, 1,000 of it a reversible distribution), Afzal HR (3,000 referral), Kiran, Arvind; tasks "Cut a 30-second teaser" (Afzal Manager: waiting / paid / rejected) and "Design 3 YouTube thumbnails" (Afzal Super Admin, phase-wise: 1 waiting with 2 images, 1 in progress); 2 pending redemptions (Meera 1,500, Sneha 500) + an approved and a declined one; ledger rows.
DEMO-ACCOUNTS "What to try": Super Admin — give coins, take back, cancel the 1,000 distribution, approve Sneha's thumbnails; Manager — approve Kavya's teaser, post a task, remind; HR — approve Meera's use-coins request, add a task poster.

## Tested
Web preview `bountyadmin.localhost:8090` (pane hidden; swipes fired through their accessibility activate handler), 390×844 dark and 320×700 light, no horizontal scroll.
- **Afzal Super Admin**: More row → hub (company wallet, 4 to check, 2 use-coins); approve & pay Sneha's thumbnails; change reward (phase 1 500→600, Sneha topped up +100 on the ledger); remind (preview 25 people, sent); post a task → open → cancel; ledger cancel of the 1,000 distribution (wallet back up); give 400 Referral Coins to Afzal HR; take back 300 from Afzal Manager; approve Meera's 1,500 request; add Priya Sharma as task poster; Inbox `bounty-claim` list + detail → reject for good (hold released).
- **Afzal Manager**: hub (funds 4,100), My task funds, return 100 coins; `/admin/bounty/distribute` redirects home; Bounty rewards shows the "Bounty admin" row.
- **Afzal HR**: hub shows Task posters + Use-coins only; decline Sneha's request.
- **Afzal App Manager**: view-only banners, no swipe on claims, creators read-only, ledger + summary.
- Not covered in the preview: phone file downloads of submissions, Edit task / Extend deadline sheets (same paths as the others).
- Note for the integrator: on web, `Alert.alert` is a no-op, so server refusals don't show in the web preview (phone is fine).
`npx tsc --noEmit` and `npx expo lint` clean.
