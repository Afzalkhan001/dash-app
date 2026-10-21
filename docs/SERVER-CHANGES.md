# Server changes: local branch `feature/mobile-push`

- **Repo:** `dash-tamada-latest`. The branch is checked out as a git worktree at `../dash-mobile-push`, so the
  main checkout, which is on `feature/mobile-app`, is untouched.
- **Base:** `5e3d500` (Merge pull request #32). Two commits on top of it:
  - `4d380bc` Mobile push: push_devices table, Expo sender, device routes, send hooks
  - `c96ff12` Security fixes (D5): role and company checks on unguarded routes
- **Not pushed, not deployed.** No SQL has been run. The database is untouched.
- **Size:** 16 files, +653 / −43 (`git diff 5e3d500..feature/mobile-push --stat`).
- **Tests:** the new `test/push_and_security.test.js` passes 18 of 18. For the existing suite I ran the 40 test
  files that need no live Supabase: 632 pass and 30 fail. The same 30 fail on the base commit too, in
  `e2e_vendor_accounts`, `hr.time`, `meets` and `vendor_poc`, so none are caused by this branch.

## Commit 1: push notifications (PLAN D1)

| File | Change |
|---|---|
| `sql/push_devices.sql` (new) | Adds the `push_devices` table, keyed by token. `session_token` references `auth_sessions(token)` with `ON DELETE CASCADE`, so the row goes when the session is deleted. Adds an index on `user_id`, turns on RLS and revokes anon and authenticated access. Safe to re-run. |
| `lib/push.js` (new, about 190 lines) | `createPush({supabase})` returns four functions:<br>• `pushToUsers(ids, {title, body, data:{url,kind}, channelId})` sends only to rows whose session is live (not revoked, not expired). It calls `POST https://exp.host/--/api/v2/push/send` in chunks of 100, with `EXPO_ACCESS_TOKEN` as a bearer token if set. A `DeviceNotRegistered` result deletes the row; any other error is written to `last_error`. It never throws.<br>• `pushToEmail(email, msg)` looks the person up by `users.email`.<br>• `pushForEmail(to, subject, html)` uses the subject as the title and the first `<p>` as the body, and picks the app screen from the subject (`routeForSubject`).<br>• `looksLikeCode()` refuses a code-looking title and drops a code-looking body.<br>Nothing is sent unless `PUSH_ENABLED=1`. No npm package. |
| `routes/push.js` (new) | • `POST /api/push/devices` validates the token against `^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$` (200 characters at most). It upserts on token with the caller's `user_id`, `tenant_id` and session token. It is rate-limited to 30 per 15 minutes and answers 503 with a hint if the table is missing.<br>• `POST /api/push/devices/remove` deletes the row only when it belongs to the caller.<br>• `POST /api/push/test` sends "Notifications are on" to the caller's own phones and returns `{ok, sent, errors, skipped}`. It is limited to 5 per 15 minutes.<br>All three sit behind the auth gate and have no role check: any staff member, acting on their own phone only. |
| `server.js` | • Creates `const Push = require('./lib/push').createPush({ supabase })` after the Supabase client.<br>• `sendEmail(to, toName, subject, html, opts)` takes a new optional 5th argument. Unless `opts.noPush` is set, it calls `Push.pushForEmail(...)` before the `EMAILS_ENABLED` check.<br>• `{ noPush: true }` is passed at the sign-in code email, the admin copy of the sign-in code, the test email, both petty cash confirmation-code emails and the bounty coupon email. The petty cash and coupon sends each get a separate push with no code in it.<br>• The bounty reminder pushes when WhatsApp succeeds, because the email (and so the hook) only fires when WhatsApp fails.<br>• `push: Push` is passed to `visitors.js`.<br>• `routes/push.js` is registered after the auth gate, just before the T5 tenant-isolation helpers. |
| `visitors.js` | Adds a `pushHost(userId, msg)` helper, which does nothing if `ctx.push` is absent. It pushes the host by user id when a visitor checks in ("<name> is at reception", `/visitors`, channel `visitors`) and when an invited guest arrives. This works even when the host has no phone number on file. The WhatsApp sends are unchanged. |

## Commit 2: security fixes (PLAN D5)

| Route | Before | After |
|---|---|---|
| `POST /api/users/bulk-patch` (`routes/users.js`) | No check; merged any fields, including `role` | `requireRole(USER_ADMIN_ROLES)`. Only users in the caller's own company (`master_admin` exempt). Each patch goes through `filterUserWrite`, so no self-promotion and no `password` or `id`. The website never calls this route. |
| `POST /api/users/sync-from-whitelist` | No check; touched every company | `requireRole(USER_ADMIN_ROLES)`. Only the caller's own company's users. |
| `DELETE /api/whitelist/:id` | No check | `requireRole(USER_ADMIN_ROLES)` plus `assertSameTenant`. These are the same roles as adding and editing. |
| `POST /api/tenants`, `DELETE /api/tenants/:id` | Signed in only | `requireRole(['master_admin'])`, as on the website's Tenants page. |
| Create, edit and delete for rooms, locations, room purposes, and Support Centre branches, WiFi, staff and temp staff; create and delete for assets | No role check | `requireRole(FACILITY_ADMIN_ROLES)` = master_admin, super_admin, ceo, coo, it_admin. These are the roles that see those screens on the website (Rooms and Assets are in the IT Admin sidebar; the Support Centre uses `isITAdmin`, dash.html:29219). `PUT /api/assets/:id` stays open, still tenant-checked, because the Service Desk assigns and returns assets through it. |
| `POST /api/time_corrections` | Saved without a `tenantId`, so the tenant-scoped queue was always empty | Stamped with `ownTenantId(req)`. `PUT` and `DELETE` check `assertSameTenant`. |
| `GET /api/meets/directory` (`meets.js`) | Listed users from every company | Own company only (`master_admin` sees everyone). `tenantId` is read, but not sent to the client. |
| `lib/authz.js` | none | Adds and exports `FACILITY_ADMIN_ROLES`. |

### Not changed, and why

- **`PUT /api/tasks/:id`, `PUT /api/bookings/:id`:** assignees and requesters legitimately write these, so a role
  wall would break the product. Per-field rules are needed (who may set which status), and that is not a
  minimal change. These routes are already tenant-checked (T5).
- **Old time corrections with no `tenantId`:** they stay invisible. A backfill for the owner to run, if wanted:
  `update time_corrections set data = data || jsonb_build_object('tenantId','<tenant id>') where data->>'tenantId' is null;`
- **Support Centre `POST` routes without a tenant stamp:** unchanged. A missing stamp hides the row from
  everyone except `master_admin`. It does not leak anything.

## Deploying

The owner's steps are in `docs/PUSH.md`:

1. Run `sql/push_devices.sql`.
2. Merge and deploy the branch.
3. Set `PUSH_ENABLED=1`, plus `EXPO_ACCESS_TOKEN` if you use enhanced push security.

The security commit needs no SQL and can be merged on its own:

```
git cherry-pick c96ff12
```

If you cherry-pick it alone, its test file's push tests will fail because `lib/push.js` won't be there. Drop
those tests, or take both commits.
