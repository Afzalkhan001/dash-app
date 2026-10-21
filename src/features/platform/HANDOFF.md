# Platform domain — hand-off (wave 3)

Spec: `docs/port/leadership-admin.md` §1.6–1.9, §2.6–2.8, §4.2 F/G/H (master admin). No server, website
or DB change. No new dependency. No shared file edited.

## What it adds

**Routes** (`src/app/(app)/admin/platform/`, plain pushed screens — no Stack options needed)
- `companies/index` — "Companies on DASH" hero (count, people on DASH), one row per company (initials, name,
  Super Admin email, people N of max from GET /users, Active/Suspended, bounty), **Register a company** (+):
  form → swipe (says the Super Admin is emailed) → POST /tenants then POST /whitelist (super_admin). The email is
  checked against every login and invitation first (POST /whitelist upserts by email). If the invite fails the
  company stays registered and the success sheet says so.
- `companies/[id]` — details, Super Admin state (Signed up / Invited / Not invited → "Send the invite", swipe),
  Edit sheet (name, Super Admin email, address, tax ID, seat limit, Active/Suspended; sends only changed keys),
  links to Features and Wallet. "To delete a company, use the DASH website." Reset password / Overrides not ported.
- `features?company=` — company picker, "N features off" banner, HR (HRMS) switch + module switches
  (GET/PUT /hr/admin/tenants/:id/access), 25 FEATURE_REGISTRY switches in 7 groups. Every **off** is a
  ConfirmSheet + SwipeToConfirm ("No one is notified"); on is immediate.
- `wallets?company=` — company picker, wallet hero (available, added, given out), "Add coins", credits list
  (This company / All), credit sheet → "Cancel this credit" → swipe → POST /bounty_transactions/:id/reverse
  (server's refusal shown; a warning when the unused balance is lower than the credit).
- `wallets/add?company=` — keypad (whole coins) → reason → swipe ("No one is emailed") → success.

**More › Workspace rows** (`nav.ts`, section `platform`, master_admin only via `webNav`)
| key | label | tourId |
|---|---|---|
| `platform.companies` | Companies | `more.platform.companies` |
| `platform.wallets` | Company wallets | `more.platform.wallets` |
| `platform.features` | Company features | `more.platform.features` |

**Home card:** `platform.hero`, placement `hero`, order 10 — master_admin. TourTarget `home.platform.hero`.
**Create actions:** none. **Inbox kinds:** none (nothing waits on the platform owner).
**Tour steps** (`tour.ts`): `platform.hero` (Home), `platform.companies`, `platform.wallets`, `platform.features` (More).

## Gates (`access.ts`) — promote if wanted
`isPlatformOwner`, `canSeeCompanies` (`webNav 'tenants'`), `canSeeCompanyWallets` (`'wallets'`),
`canSeeCompanyFeatures` (`'features'`), `canRegisterCompany`, `canMoveCompanyCoins`.
`FEATURE_REGISTRY` (dash.html:1373, ids/groups + plain labels), `FEATURE_GROUPS`, `featureOn`, `featurePatch`
live here; the spec suggested `lib/access.ts` — promote if the menu wants the labels.

## API (`src/api/platform.ts`)
`usePlatformUsers`, `usePlatformWhitelist` (persist:false), `countByCompany`, `findEmail`, `useRegisterCompany`,
`useInviteSuperAdmin`, `useUpdateCompany` (optimistic on `['tenants']`), `useHrTenantAccess`/`useSetHrTenantAccess`,
`useCompanyWallet`, `useCompanyCredits`, `useAddCompanyCoins`, `useCancelCompanyCredit`. Companies come from
`useAllTenants()` (`['tenants']`).

## Demo (`src/demo/fixtures/platform.ts`)
Routes: GET /tenants (master: demo company + **Nexus Productions** (bounty off, vendors + devices off) + **Lumen
Studios** (suspended); others: TENANT), POST /tenants, PUT /tenants/:id (ids other than t-demo; company.ts keeps
t-demo), GET /users (master: + 7 people of the other companies; others: org.ts's handler, delegated),
GET/PUT /hr/admin/tenants/:id/access, GET /bounty/wallet/company, POST /bounty/company/add-coins,
GET /bounty_transactions (master, or `type=COMPANY_CREDIT` for overseers; everyone else delegated to bounty.ts),
POST /bounty_transactions/:id/reverse. Seeds: 4 credits (one cancelled + ADJUSTMENT row); the demo company has
given out 38,500, so its 50,000 credit is refused on cancel and the 20,000 one can be cancelled.
Exports: `companyWalletOf(tenantId)`, `companyCreditStore`, `platformTenants()`.

### Needs the integrator
1. **bountyadmin clash — LIVE, blocks the demo wallet flows.** bountyadmin.ts (earlier in the barrel) now answers
   GET `/bounty/wallet/company` (always the demo company's wallet, whatever `tenantId`), GET `/bounty_transactions`
   (demo company rows only) and POST `/bounty_transactions/:id/reverse` (refuses every COMPANY_CREDIT, even for
   master). So for Afzal Master Admin: every company shows the demo company's wallet, Nexus' credit and the seeded
   platform credits are missing, cancelling a credit is always refused, and coins added here never show. Add-coins
   itself reaches platform.ts. Smallest fix (integration.ts + index.ts, integrator-owned): pass bountyadmin through
   `integrate('bountyadmin', …)` with WRAPs that call `platformBountyHandlers.{wallet,ledger,reverse}` from
   platform.ts when `isPlatformOwnerPersona()`, else the bountyadmin handler. Full fix: one company wallet
   (`companyWalletOf`) and one credit ledger (`companyCreditStore`) shared by both, with coin distribution debiting
   `companyWalletOf(DEMO_TENANT_ID)`.
2. **people.ts GET /whitelist** returns every row (the real route is tenant-scoped for non-master). A Super Admin
   invite for a new company lands in `whitelistStore` with that company's id; company › Users filters by tenant,
   but any screen that doesn't would show it to demo-company admins.
3. Turning HR off for the demo company here does not change personas' `/hr/me` (personas.ts) — fine for a demo,
   just don't expect the HR menus to vanish.
4. `role-tours.ts` platform intro still says "Company setup, wallets and features are on the DASH website" —
   now they are on the phone too (only delete and reports stay web).
5. `DEMO-ACCOUNTS.md` "What to try" for Afzal Master Admin: register a company, switch a feature off for Tamada
   Media (Demo) then sign in as Afzal Super Admin to see the menu change, add coins, cancel the Diwali credit.

## Tested
`npx tsc --noEmit` and `npx expo lint`: clean for the whole project (reviewer pass). Live preview: not run — the
browser pane was at its tab cap (other agents' tabs), so no persona / size / theme / swipe check was possible.
