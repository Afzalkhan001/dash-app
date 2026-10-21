# Extension points (Wave 0)

How a domain plugs into the shared screens **without editing them** ([PLAN §2.1](PLAN.md)). Everything
below is wired already: each domain has stub files that return nothing, so the app looks exactly as it
did before Wave 0. Fill your stubs; never edit a shared file. If you need something that is not here,
put it in your `HANDOFF.md` and the integrator adds it between waves.

Domains (registry order = + sheet order, then Workspace / tour order on ties):
`work, booking, chat, servicedesk, itdesk, desk, people, hrtime, accounts, company, signin, teamboard,
insights, payroll, hiring, newsroom, bountyadmin, platform, push, calls`.

## 0. Your files

| File | Exports | Read by |
|---|---|---|
| `src/features/<domain>/nav.ts` | `workspaceRows(access)`, `createActions(access)`, `homeCards(access)` | More, + sheet, Home (via `features/domains.ts`) |
| `src/features/<domain>/inbox.ts` | `inboxKinds: InboxKindPlugin[]` | Inbox list, counts, badge, polling, `/inbox/<key>/<id>`, Past decisions |
| `src/features/<domain>/tour.ts` | `tourSteps(ctx)` | first-sign-in tour |
| `src/features/<domain>/access.ts` | your gates (pure, ported from `dash.html`, cite the line) | your own screens |
| `src/demo/fixtures/<domain>.ts` | `<domain>Routes: Route[]` | demo server (via `demo/fixtures/index.ts`) |

- The registry imports these **without an extension**, so you may rename `nav.ts` → `nav.tsx` or
  `inbox.ts` → `inbox.tsx` when you want JSX in them (or keep components in other files and import them).
- Types live in `src/features/plugin-types.ts` (type-only; import from there, never from a shared screen).
- Chat also owns two Wave 0 stubs: `features/chat/meets-watcher.tsx` and `features/chat/header-action.ts` (§7).

## 1. Rules for every plug-in function

- `workspaceRows`, `createActions`, `homeCards`, `tourSteps` and `row` run **during render on every
  render**: pure, fast, no fetching, no clock, no hooks. Decide from `access` only.
- `InboxKindPlugin.useItems` **is a hook**, called on every render in a fixed order (§4).
- Return `[]` when the person lacks the gate. Copy the website's role rules exactly.
- Keys are unique app-wide; prefix them with your domain (`work.tasks`). A duplicate is dropped with a
  development warning, and one domain throwing never takes the screen down (it is skipped and logged).
- Plain words (docs/DESIGN.md §0B–0C), sentence case, IST dates.

## 2. Access (`useAccess()` → `Access`)

`src/lib/use-access.ts`. Everything a plug-in receives. Besides `user`, `hr`, `tenant`, `sections`,
`approvals`, `isHrAdmin`, `isSystemRole`, `feature(id)`:

| Field | What |
|---|---|
| `access.web(id, extra?)` | the website's sidebar test for this person (`lib/access.ts webNav`, /hr/me filled in) |
| `access.nav` | the same sidebar as a flat id list (`webNavList`), without `extra` |

`webNavList(user, tenant, extra)` / `webNav(user, id, tenant, extra)` in `src/lib/access.ts` port
`navFor` + `navForRaw` (dash.html:1433 / :1508) line for line: the role table (ceo/coo = super_admin,
unknown role = employee), bounty / referrals / audit / subscriptions placement, the injections (devices,
org, teamroster, attendance, timesheets, visitors, visitors-desk, trmytasks), the company feature
switches (never for master_admin) and Sidebar's project-creator append. Ids (`WebNavId`):

`home dashboard users roster departments employees managers projects clients tasks mytasks requests
booking rooms assets servicedesk announcements bounty wallets referrals reports config audit
subscriptions devices accounts accounts-vendor accounts-keka-approvals accounts-bill-review
accounts-pettycash accounts-reimbursement vendors vendormaster agreements visitors visitors-desk
visitors-dashboard visitors-kiosk visitors-log visitors-invites visitors-qr tenants features overrides
org teamroster trmytasks attendance timesheets payroll profile support`

- `wallets` = master_admin's "Company Wallets" item (its `bounty` on the web); `bounty` stays false for it.
- `payroll` is not a web sidebar item: it is `canSeePayrollAdmin(hr, user)` (PayrollAdminPanel :5289).
- The Visitor Manager's desk is `visitors-dashboard…visitors-qr`; Super Admin's is `visitors-desk`
  (`VISIT_DESK_ROLES`).
- Data-driven ids stay **false** unless you pass the data in `extra`: `jobOpenings` (referrals for
  non-creators), `departments` + `teamRosterManagerDeptIds` (teamroster), `teamRosterTasks` (trmytasks),
  `ownsProjectCode` (accounts-keka-approvals). Never show on a guess.

Shared gates in `lib/access.ts`: `grantMatches(grants, user)` (userId → empNo → exact name),
`isAnnouncementCreator`, `isBountyCreator`, `isProjectCreator`, `isJobOpeningCreator`, `canSeeTm360`,
`canSeeSubscriptions`, `canSeeAuditNav` (userId or exact empNo only), `canSeePayrollAdmin`, and the role
lists `TM360_*`, `SUBSCRIPTION_ADMIN_ROLES`, `ANNOUNCEMENT_CREATOR_ROLES`, `BOUNTY_CREATOR_ROLES`,
`JOB_OPENING_CREATOR_ROLES`, `VISIT_DESK_ROLES`, `FEATURE_IDS`.

Typed tenant fields (`src/api/me.ts Tenant`): `announcementCreators`, `bountyCreators`,
`projectCreators`, `subscriptionAccess` (`TenantGrant[]`), `auditAccess` (`AuditGrant[]` with
`permissions`), `profTypes` (`ProfType[]`), `teamRosterEnabled`, `appManagerBountyApprovalsOn`,
`bountyMonthlyEarnCap`, `visitorApprovalTimeoutMin`, `visitorPhotoRetentionDays`, … Every array is
**replaced whole** by `PUT /tenants/:id`: re-read, then send the full list. Team Roster per department is
`teamRosterEnabled` on `GET /departments` rows (there is no tenant-level department list).

`useAllTenants()` (`src/api/me.ts`): every company, master_admin only (same `['tenants']` cache entry as
`useMyTenant`).

## 3. More › Workspace — `workspaceRows(access): WorkspaceRow[]`

`features/more/workspace.ts` groups rows under the 9-tile app grid (the grid itself is unchanged):

| `section` | Title |
|---|---|
| `links` | no title: one card of plain links right under the grid (Chat & calls, Refer & earn) |
| `work` | Work |
| `people` | People & HR |
| `money` | Money |
| `it` | IT & office |
| `company` | Company |
| `platform` | Platform |
| `reception` | Reception |

`WorkspaceRow = { key, section, label, subtitle?, href, icon (lucide), module (ModuleKey), order?, tourId? }`.
A section with no rows is not drawn. Sort: `order` (default 100), then registry order. The row is a kit
`ListRow` with a `ModuleBadge`, the subtitle (2 lines) and a chevron; `tourId` wraps it in a
`<TourTarget>`.

```ts
export function workspaceRows(access: Access): WorkspaceRow[] {
  if (!access.web('tasks')) return [];
  return [{ key: 'work.tasks', section: 'work', label: 'Team tasks', subtitle: 'Assign and review work',
            href: '/admin/work/tasks', icon: ClipboardList, module: 'tasks', tourId: 'more.work.tasks' }];
}
```

## 4. + sheet — `createActions(access): CreateAction[]`

`CreateAction = { key, label (≤ 2 short words), href, icon, module, hint?, order? }`, appended after the
built-in 8 (`features/create/create-sheet.tsx`) in registry order, then `order`. A key equal to a
built-in one is dropped. The per-role cap and final order are set by the integrator (PLAN §2.5).

## 5. Inbox — `inboxKinds: InboxKindPlugin[]`

```ts
export const inboxKinds = [
  defineInboxKind<MyRow>({
    key: 'task', label: 'Tasks', title: 'Task to review', module: 'tasks', icon: ClipboardCheck,
    decides: true,                        // approval queue (default) — false for notices
    pin: undefined,                       // or { key: 'reception', label: 'At reception' }
    useItems: (access) => {               // A HOOK: always called, same order, gate with `enabled`
      const on = access.web('tasks');
      const q = useQuery({ queryKey: ['inbox', 'task', access.user?.id ?? ''], enabled: on, queryFn });
      const rows = q.data ?? [];
      return { visible: on, items: rows.map((r) => ({ id: r.id, at: r.submittedAt, who: r.assignee, record: r })),
               pending: q.data ? rows.length : null, error: q.isError && !q.data };
    },
    row: (item, { today, now }) => ({ title: item.who, subtitle: `${item.record.title} · Task`, age: ago(item.at, now) }),
    Detail: TaskReviewScreen,             // /inbox/task/<id> — the whole screen, NavHeader included
    History: TaskHistory,                 // optional: a chip on Past decisions
  }),
];
```

- `useItems` result: `{ visible, items: { id, at (ISO), who, record }[], pending?, error?, discovering?, decided? }`.
  `visible: false` = no chip, no count, nothing fetched. `pending` defaults to `items.length` once loaded
  (`null` while loading). `discovering: true` keeps the Inbox skeleton up. `decided`
  (`{ id, at, decision }[]`) feeds "Done today".
- Put queue queries under **`['inbox', <key>, …]`**: the Inbox's focus refresh, pull to refresh and the
  one-minute poll cover them (`poll: false` opts out of the poll).
- Items join the list (sorted visitors → pinned plug-ins → newest), the chips (after the built-in kinds),
  the tab badge, Home's "Needs you", the tour counts and `/inbox?type=<key>`.
- `row` returns the Inbox `RowModel` `{ title, subtitle, meta?, value?, age? }`; use `features/inbox/format`
  helpers (`ago`, `shortDay`, `rangeLabel`, `rowInr`, `dateTime`). On decide, call
  `noteDecision('<key>:<id>', userId, 'approve' | 'reject')` (`features/inbox/decided`) for "Done today".
- Detail screens follow `features/inbox/detail` (`DecisionScreen`, `RequestHero`, `RejectSheet`,
  `DecidedSheet`…) and the safety rules: `ConfirmSheet` + `SwipeToConfirm`, say who is notified.
- Keys: url-safe `[a-z0-9-]`, not a built-in (`regularization leave wfh comp_off reimbursements loans
  keka petty visitors history all`). Never import `features/inbox/use-inbox` from a plug-in.

## 6. Home — `homeCards(access): HomeCard[]`

`HomeCard = { key, placement?: 'hero' | 'top' | 'needs' | 'end', order?, Card: ComponentType }`

| placement | Where |
|---|---|
| `hero` | instead of the light "Today" card, for people without the clock card (desk hero). First one wins |
| `top` | after the hero and the shortcuts (leadership KPIs) |
| `needs` (default) | after "Needs you" (Team today, Tomorrow) |
| `end` | after celebrations, before News |

Home's sections are fixed slots with gaps: return a card only when the person should see it, and make
`Card` always render something (skeleton / short empty line), never `null`. `Card` may use hooks.

## 7. Tour — `tourSteps(ctx: DomainTourCtx): TourStep[]`

Appended before the demo step and "See this again" (`features/tour/role-tours.ts`). `ctx` = the staff
tour context (role, Me segments, + labels, More tiles…) plus `tourId`, `workspaceRows`, `createKeys`,
`homeCards` (the keys this person sees). Build steps with `tourStep()` from `features/tour/step.ts`:

```ts
tourStep('work.tasks', 'more.work.tasks', 'Your team’s tasks', 'Assign work and review what was sent.', {
  screen: '/more', when: () => ctx.workspaceRows.includes('work.tasks') });
```

`TOUR_VERSION` is bumped once by the integrator at release.

## 8. Layout and chat slots

- `src/app/(app)/_layout.tsx` sets Stack options by route name: `admin/desk/kiosk` → `fullScreenModal`,
  no gesture, fade; `call/[meetingId]` → `fullScreenModal`, no gesture, from the bottom. Create those
  routes with exactly these names.
- `<MeetsWatcher/>` (`features/chat/meets-watcher.tsx`) is mounted once for the signed-in staff area.
- `useChatHeaderAction(): NavAction | null` (`features/chat/header-action.ts`) puts a round button before
  the Inbox button in Home's header.

## 9. Shared helpers (integrator-owned, import freely)

| Helper | Use |
|---|---|
| `features/shared/person-picker.tsx` | `usePickablePeople({ keep? })` (GET /users slimmed, no photos/bank) + `<PersonPicker visible onClose onPick people filter? date? allowOnLeave? recentKey? selectedId?>` — search, recent tiles, "On leave" disabled |
| `features/shared/project-picker.tsx` | `ProjectPicker` (moved; the old reimbursements path re-exports it) |
| `lib/csv.ts` | `shareCsv(fileName, rows, columns)` → cache file → share sheet (download on web); `toCsv`, `csvCell` (BOM, CRLF, formula-injection guard) |
| `lib/ist.ts` | `isYmd`, `addDaysYmd`, `daysBetween`, `ymdRange`, `weekdayOfYmd`, `istIsoAt(ymd, 'HH:MM')`, `istHmOf(iso)`, `hmToMinutes`, `minutesToHm`, `nowIstMinutes`, `monthBounds`, `addMonthsYm`, `financialYear` (display stays in `lib/dates.ts`) |
| `api.patch` (`api/client.ts`) | the server's PATCH routes (meets conversations/meetings, TV devices) |

## 10. Demo

- Your `src/demo/fixtures/<domain>.ts` exports `<domain>Routes`; the barrel puts every domain's routes
  **before** the built-in ones (yours win). Methods: `GET POST PUT PATCH DELETE`. `server.ts` never changes.
- Unregistered GETs of these bare-array lists answer `[]`: the old list plus `rooms locations
  room_purposes room_slot_bookings loc_time_bookings holds whitelist time_corrections assets job_openings
  referrals bounty_entries prof_reviews upload_batches`.
- Change shared demo data **only** through these exports (never edit the original fixture file):

| File | Exports |
|---|---|
| `org.ts` | `PEOPLE`, `profile`, `DEPARTMENTS` (`teamRosterEnabled`), `PROJECTS`, `TENANT`, `allPeople()`, `personById`, `personByName`, `upsertPerson`, `removePerson`, `upsertProject`, `upsertDepartment`, `patchTenant` |
| `tasks.ts` | `taskStore`, `bookingStore`, `clientStore`, `createTask`, `patchTask`, `removeTask` |
| `support.ts` | `ticketStore`, `patchTicket`, `supportConfigStore`, `supportWifiStore`, `supportStaffStore`, `supportTempStaffStore` |
| `visitors.ts` | `visitStore` (one store for host and desk; `/visitors/mine` = the demo person's), `inviteStore`, `makeVisit` |
| `pay.ts` | `addPayslip(month, figures?)`, `payslipStore`, `salaryStore`, `hrClaimStore`, `loanStore` |
| `petty-cash.ts` | `pettyStore`, `pettyBillStore`, `pettySubmissionStore`, `expenseHeadStore`, `setPettyStage` |
| `reimbursements.ts` | `reimbursementStore`, `reimbursementReceipts`, `setReimbursementStage` |
| `bounty.ts` | `bountyTaskStore`, `txStore`, `redemptionStore`, `walletOf(id)`, `addTx` |
| `announcements.ts` | `newsStore`, `makeAnnouncement` |

- Seeds added in Wave 0: Team Roster on for the company and for Creative + Production; bookable
  professionals Sanjay (editor), Sneha (graphic designer), Farhan (cinematographer, away two days next
  week); `profTypes` defaults; grants — `auditAccess` Afzal HR, `subscriptionAccess` Afzal Accounts,
  `bountyCreators` Afzal Manager, `announcementCreators` Priya Sharma, `projectCreators` Vikram Singh.
  Afzal HR and Afzal Super Admin have the `payroll` and `tax` modules. No CEO/COO persona.
- Grants must name personas by their own ids (`demo-hr`) and employee numbers — never `DEMO_USER`'s id or
  name ("Afzal Employee"), which the demo server rewrites to whichever persona is active.
