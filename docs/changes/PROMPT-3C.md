# Prompt 3C: ledger, payouts, dashboard, reports and notifications in the CMS

Repo `gymsera_cms`, branch `phase-3/prompt-3c-cms-money` (worktree `../gymsera_cms_3c`, off `origin/main` `00d416b`). Not pushed.
Backend read at `gymsera_be` `origin/main` `5b4ed8c`. Mobile read at `gyms_era` `origin/master` `b875158`. No backend or mobile code was changed.

## What differed between the prompt and the playbook

The playbook's Prompt 3C (`docs/GYMSERA_AGENT_PLAYBOOK.md`, "Prompt 3C") is shorter than the prompt I was given, and the playbook wins:

| Playbook | Prompt | What I did |
|---|---|---|
| Notifications: **bell + feed with server unread counts and the socket (§9.2)**. Inbox is out of scope (R-18). | Notifications: bell, unread count, list, mark read, "push topics the CMS can manage, if any". No socket. | Built the bell, a `/notifications` feed and the socket. There are no push topics a CMS can manage: the backend has no preferences or topics route (grep `topics`, `preferences` in `gymsera_be/src/routes`), and the mobile "notification preferences" screen is local state only (`host_notif_prefs_screen.dart`). |
| Reads §0.5, §3.3, §9 and UX-13 (ledger, payouts), UX-18, UX-23. | Adds PAY-05/06/12, NEW-35, NEW-55, re-auth and 202 rules. | Applied both. |
| Update §13 **and the §3.3 parity matrix rows**. | Update §13 and the handoff. | Did all three. |

Also note: the prompt's branch name `fix/new-58` in gymsera_be was not created, because there is no backend change. The gymsera_be documentation commit is on `docs/prompt-3c-cms-money` (same pattern as `docs/prompt-3a-…`, `docs/prompt-3b-…`).

## Step 1: audit

Permission keys are from `gymsera_be/src/constants/permissions.js` and `docs/PERMISSIONS.md`. "Mobile" is `gyms_era` on `origin/master`.

### 1. Dashboard

| | |
|---|---|
| Endpoints (before) | `GET /reports/dashboard`, `GET /reports/yearly`, `GET /host/branches/:id/dashboard` (per branch, without revenue), `GET /members`, `GET /gyms/branches` |
| Backend permission | `dashboard.revenue.view`, held at any branch: `can.atAnyBranch` at `reports.routes.js:44-53`, `:138`. `dashboard.view` at the branch: `host.routes.js:99`. PERMISSIONS.md:53-54. |
| Page before | Revenue was already hidden without the key (NEW-45f). Defects: while the context or tenant loaded, `gymPagesOpen` was false so every card showed `0` (flash of wrong content); a failed request showed `0` (`?? 0`, page.tsx old :104-115); no error state; no state for a role with no dashboard permission; revenue formatted with 0 decimals. |
| Mobile | `GET /host/today-summary` (`api_constants.dart:136`, `gyms_repository.dart:26`) behind `authorize('GYM_HOST')` (`host.routes.js:34`). Team members use `GET /host/branches/:id/dashboard` (same as the CMS). |
| Parity gap | Spec §3.3 says "One `GET /host/dashboard?branchId=`". That endpoint does not exist (grep). The CMS and the app both use per-role endpoints. The mobile "needs attention" cards are not on the CMS dashboard. |

### 2. Payments and ledger

| | |
|---|---|
| Endpoints (before) | `GET /payments`, `POST /payments`, `POST /payments/:id/action`, `GET /host/branches/:id/members/lookup`. **No ledger call at all, no shift, no daily close, no per-collector cash.** |
| Backend permission | `payments.view` / `payments.record` / `payments.verify` via `hasBranchAccess` (`payments.controller.js:127`, `:140-146`); `ledger.today.view` (`ledger.routes.js:39,52,66`), `ledger.weekly.view` (`:80`), `ledger.monthly.view` (`:94`), `ledger.verify` (`:123-127`), `ledger.close` through `POST /actions/ledger.close` (`actions.routes.js:74`, `ledger.commands.js`). |
| Defects found (NEW-55 class) | **`POST /payments` sent no `Idempotency-Key`**, which the route requires (`payments.routes.js:98-101`, `idempotency.js:51-58`): every Record Payment answered 400 `idempotency_key_required`, shown as "Failed to record payment". Same for the two other callers (`gym/subscriptions/page.tsx`, `gym/members/[id]/page.tsx`). **The "Collected" tab sent `status=STAFF_COLLECTED`**, which the list validator rejects with 422 (`payments.validator.js:42-45`). Reject sent no reason (mobile requires one: `payment_verification_sheet`). Amounts were rounded to whole rupees on screen (`formatCurrency` with 0 decimals). Branch select offered branches without `payments.record`. |
| Mobile | `workspace_repository.dart:293-400` (ledger today / day / open-days / weekly / monthly, all-branches variants, `addLedgerAdjustment`), close via `POST /actions/ledger.close` (`team_ledger_workspace_screen.dart:573`). |
| Parity gaps | The mobile `addLedgerAdjustment` returns `void` and never reads the status, so a 202 is shown as saved (`workspace_repository.dart:394`). The mobile screens print `toStringAsFixed(0)`. The CMS does neither. Mobile has no shift entry either (the field exists on the server: `Payment.model.js:86`). |

### 3. Refunds and invoices

| | |
|---|---|
| Endpoints (before) | `GET /invoices` (no branch), `GET /invoices/:id`. **No refund control**: `POST /payments/:id/refund` (`payments.routes.js:294-298`) was never called. |
| Backend permission | `payments.refund`, `approvable`, Owner/Org Admin direct, Manager request (`permissions.js:297`, PERMISSIONS.md:131), enforced in the engine (`payments.controller.js:284-343`): **200** or **202**. `invoices.view` per branch (`payments.controller.js:242-244`). |
| Defects found | The invoice list sent no `branchId`. For a team member the server then treats the caller as the traveler and lists only their **own** invoices (`payments.controller.js:242-244`, `payment.service.js:853-857`), so a Branch Manager saw an empty page. `GetInvoicesParams` named `startDate/endDate`, which the server does not read (`from/to`). `invoicesApi.downloadInvoicePdf` calls `/invoices/:id/pdf`, which does not exist (`invoices.routes.js:74,116`); nothing used it. |
| PAY-05 | Gapless per-branch numbers are generated by the server (`invoice-sequence.service.js`); the CMS shows `invoiceNo` and never builds one. A cancelled invoice keeps its number (copy added). |
| Mobile | `workspace_repository.dart:270` sends `branchId` always. No refund UI in the app (grep `payments/.*refund` in `lib`: none). |

### 4. Payouts and bank details

| | |
|---|---|
| Endpoints (before) | **None.** No payout or bank-details UI existed in the CMS. |
| Backend permission | `payouts.view` (org-only, owner: `permissions.js:374`), `payouts.request` (approvable: `:376`), `payouts.bank.manage` (`:384`). Routes: `GET /host/payouts/balance`, `GET /host/payouts`, `POST /host/payouts` (`host.routes.js:18-20`), bank details via `PATCH /gyms/profile` with `paymentDetailsJson` + re-auth (`gyms.controller.js:37-47`, `assertReauth` `auth.service.js:1090`), `GET /gyms/profile` returns the details only to a holder (`gyms.controller.js:12-19`). 24 h cooling period (`payout.service.js:16-17`, `payout.commands.js`). |
| Social-only accounts (NEW-35) | The server accepts `{provider:'GOOGLE', idToken}` instead of a password (`auth.service.js:1090-1100`). The only existing CMS re-auth dialog (`delete-branch-dialog.tsx`) is password-only and tells Google users to use the app. New shared `ReauthDialog` accepts either. |
| Mobile | **Fake UI.** `payoutsProvider` and `bankAccountsProvider` are `StateProvider`s with hard-coded lists (`analytics_provider.dart:31`, `host_profile_provider.dart:61`); no call to `/host/payouts` anywhere in `lib`. The CMS is the first real client, so the backend is the contract. |

### 5. Reports

| | |
|---|---|
| Endpoints (before) | `GET /reports/monthly`, `GET /reports/monthly/export` (PDF), `GET /reports/yearly` (dashboard only). |
| Backend permission | `/yearly` and `/dashboard`: `dashboard.revenue.view` at any branch, summed over the permitted branches only (`reports.routes.js:138`, `reports.service.js:282-308`). `/branch/:id`: `can('dashboard.revenue.view')` (`:160`). **`/monthly`, `/monthly/export`, `/monthly/export-pdf`, `/monthly/print-layout` have no `can()` and no branch scope** (`reports.routes.js:76-82,105-111,127-136`, `reports.controller.js:20-33`). |
| Defects found (NEW-55 class) | The page read `totalRevenue`, `newMembers`, `activeSubscriptions`, `totalAttendance`, `revenueByDay[].amount`, `membershipBreakdown`, `attendanceByDay`. The server sends `{period, revenueByDay:[{day,totalRevenue,count}], subscriptionsByDay, checkInsByDay}` (`reports.service.js:273-278`). Every card was a dash and the revenue chart was empty. Export swallowed errors (`catch { // fallback }`). Tenant-wide monthly numbers were shown to branch-scoped users. |
| Mobile | `reportsMonthly`, `reportsMonthlyExportPdf` (`api_constants.dart:233-236`). Same endpoints, so the same gap exists in the app. |

### 6. Notifications

| | |
|---|---|
| Endpoints (before) | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` (`notifications.routes.js:9-13`), polled every 15 s from **every page's** `Header`. |
| Backend permission | `authenticate` only. Not tenant-scoped, filtered by the token's role (`notifications.service.js:8-16,21-23,49-52`). |
| Defects found | Errors only went to `console.error`. A mark-read failure was silent. `deepLink` is a mobile route (`/host/subscriptions`, `/host/today`, `/staff/dashboard`, `/traveler/...`); `router.push` opened a 404 in the CMS. No feed page, no socket (§9.2), no "99+" cap. |
| Mobile | Socket events `new_notification` / `notification` (`chat_socket_service.dart:138-147`), `notificationsProvider` (`me_providers.dart:24`). |

### Calls the backend validator rejects, and pages that decide access from the account role

| # | Call | Evidence | Status |
|---|---|---|---|
| 1 | `POST /payments` without `Idempotency-Key` (payments, subscriptions, member detail) | `payments.routes.js:98-101` | **Fixed** (3 callers) |
| 2 | `GET /payments?status=STAFF_COLLECTED` (422) | `payments.validator.js:42-45` | Worked around; backend fix proposed (NEW-58) |
| 3 | `GET /reports/monthly` fields read that do not exist | `reports.service.js:273-278` | **Fixed** |
| 4 | `GET /invoices` without `branchId` returns only the caller's own invoices | `payments.controller.js:242-244` | **Fixed** |
| 5 | `GET /invoices/:id/pdf` | route does not exist (`invoices.routes.js`) | Not used by any page; proposed (NEW-65) |
| 6 | `POST /payments/:id/action` reject with no reason | mobile requires one; server stores `null` | **Fixed** (reason required) |

Pages that decided access from the account role: **none of the six** (all use `holdsPermission` / `holdsAtBranch` from `/me/context`, NEW-42/43/46). Two nuances: `listsAll = isOwner || isGymHost` on Payments is the "no branch needed" rule the server itself applies (`isHost` at `payments.controller.js:244`), and is kept. The Reports page and dashboard had no access gate when opened by URL; they now show a no-access state.

## Step 2: what was built (one commit per page)

| Commit | Page | Summary |
|---|---|---|
| shared | helpers | `lib/money.ts` (integer minor units; format at display), `lib/api/idempotency.ts`, `lib/api/request-errors.ts` (server message first, specific fallback, "could not reach the server"), `lib/access/tier.ts` (Off / Needs approval / Direct), `NoAccess`, `ReauthDialog` (password or Google) |
| dashboard | `/dashboard` | skeletons while access loads; revenue hidden, never zero; dash and server reason after a failure with retry; no-figures state; amounts from the server with paisa |
| payments | `/gym/payments` | Idempotency-Key (same key for a retry, new key for a changed payment); two-decimal amounts parsed to minor units; Collected tab no longer 422; reject needs a reason; collect/record take a shift; row actions per branch permission; no-access, error and empty states; server messages in the dialogs |
| ledger | `/gym/ledger` (new) | Today, Open days (reconcile by date), This week, This month; server totals; cash collected vs expected per collector and shift; close day via `/actions/ledger.close`; reconciliation notes via `/ledger/:id/adjustments` (reason required, signed amount); 202 shows the shared notice; owner may see all branches, everyone else always sends a branch; weekly/monthly hidden without their own key |
| refunds + invoices | `/gym/payments`, `/gym/invoices` | Refund (full or part, reason, Idempotency-Key, 200 or 202 notice, tier-aware wording); invoices send the branch, no-access/error/empty, paisa |
| payouts | `/gym/payouts` (new) | ledger-derived balance, history, request (Idempotency-Key, 201 or 202 notice, server's cooling-period and balance messages), bank details masked on screen, edit then re-auth (password or Google) then `PATCH /gyms/profile`; the server's message stays in the dialog |
| reports | `/gym/reports` | real response shapes; yearly revenue and branch report (server totals, branches where revenue is held); the unscoped organization-wide monthly breakdown and PDF only for organization-wide holders; export errors shown |
| notifications | header bell, `/notifications` (new) | server unread count (never counted in the browser), latest ten, mark read / all with visible errors, one socket per session (token in `auth`, refreshed on reconnect, events only trigger a refetch), 60 s poll and refetch on focus as the fallback, deep links mapped to CMS pages (or nothing, never a 404); adds `socket.io-client` |

Sidebar: "Ledger" (`ledger.today.view`, branch scope) and "Payouts" (`payouts.view`, organization scope).
Other change: the 11-field-tall bank dialog scrolls inside the viewport (Playwright found its Continue button below the fold).

### Money rules and an honest deviation

The prompt asks for "integer minor units end to end". **The API does not speak minor units**: amounts are JSON numbers in major units with at most two decimals (`money.utils.js#toMajorUnitsNumber`; ledger, payout and payment responses). The CMS therefore (a) keeps what it must compare as integer minor units (`toMinor`), (b) parses typed amounts to minor units and sends `minor / 100` (two decimals at most), (c) formats only at display, and (d) never adds up what the server already totals. Moving the wire format to minor units would be a backend/API decision (proposed as NEW-63 below, together with the float addition in the gym-wide ledger merge).

## Tests

| Layer | Result |
|---|---|
| Vitest (×3, from inside `gymsera_cms`) | 44 files, 320 tests, passed 3 times |
| Playwright (once, whole suite) | 21 passed (16 existing + new `ledger` ×4, `payments-money` ×4, `payouts` ×3, `notifications` ×1, `reports-dashboard` ×2) |
| `tsc --noEmit` | clean |
| `npm run build` | exit 0 (31 static pages; only pre-existing `<img>` lint warnings) |

New component tests, each with allowed / permission missing / 202 pending / re-auth required / server error with message / empty where it applies:
`dashboard-states`, `payments-money`, `payments-refund`, `ledger-page`, `invoices-page`, `payouts-page`, `reports-page`, `notifications`; library tests `money-and-errors`, `realtime`.
Existing tests changed: `payments-record-member-lookup` (the second argument is now the Idempotency-Key), `sidebar-permissions` (two new menu entries).

## Parity gaps left

- Dashboard: the mobile "needs attention" items and `today-summary` are not on the CMS (the endpoint is `GYM_HOST`-only on the server).
- Ledger: no printable/exportable ledger; related-payment picker on a reversal is not offered (the server accepts `relatedPaymentId`).
- Payouts: nothing to match on mobile (fake UI). Cancel / withdraw a payout request has no endpoint.
- Reports: no per-branch month picker for scoped users (the server's branch report is month-to-date only); no PDF for scoped users (the export is unscoped).
- Notifications: no inbox (R-18, out of scope); no per-topic preferences (none exist server-side).
- Refunds: no remaining-refundable figure (the server does not return it; it answers 422 with the figure on over-refund).

## Step 3: proposed backend issues (not fixed here)

| Proposed | Severity | Finding (file:line) | Suggested fix |
|---|---|---|---|
| NEW-58 | P1 | `GET /payments?status=STAFF_COLLECTED` is rejected by the list validator (`payments.validator.js:42-45`, enum lacks `STAFF_COLLECTED`), so the "collected, waiting for final approval" queue cannot be asked for. | Add `STAFF_COLLECTED` to the enum; test. |
| NEW-59 | P1 | `GET /host/payouts/balance` and `GET /host/payouts` have no permission check (`host.routes.js:18-19`, `payouts.controller.js:12-39`): `payouts.view` (org-only) is never enforced, and `branchId` is not checked against the caller's branches. Any signed-in member of the tenant context reads balance and payout history. | `can('payouts.view', { orgWide: true })` on both routes; regression test with a Front Desk persona. |
| NEW-60 | P1 | `GET /reports/monthly`, `/monthly/export`, `/monthly/export-pdf`, `/monthly/print-layout` have no `dashboard.revenue.view` and no branch scope (`reports.routes.js:76-82,105-111,127-136`; `reports.service.js:228-279`). `tenantContext` turns every role assignment into `BRANCH_MANAGER` (`tenantContext.js:76`), so any team member, even a Trainer, can read whole-organization daily revenue. The response also has no totals. | `can.atAnyBranch('dashboard.revenue.view')` and pass `req.permittedBranchIds` to `monthlyBreakdown`; return server totals. |
| NEW-61 | P2 | `GET /gyms/profile` does not return `paymentDetailsUpdatedAt` (`gym.service.js:159-167`; only the PATCH reply does, `:235-241`), so the CMS cannot say "payouts paused until …" before the person tries. | Return it from `getProfile` (to holders of `payouts.bank.manage`). |
| NEW-62 | P2 | `PATCH /gyms/profile` is gated by `listing.manage` org-wide (`gyms.routes.js:85`) **before** the `payouts.bank.manage` check (`gyms.controller.js:37-47`): a person who holds only the bank permission gets 403. Latent today (the owner holds both). | A dedicated route for bank details, or `can.any([...])`. |
| NEW-63 | P2 | The gym-wide ledger merge adds amounts with JS floats (`ledger.service.js:517-519`, PAY-02 regression) and `GET /ledger/day/:date` without a branch answers a different shape (`ledger.controller.js:30`). The wire format is major-unit numbers, not minor units (§6.3). | Sum in minor units; one shape; decide the wire format. |
| NEW-64 | P2 | Notification list and count filter by the token's role, not tenant (`notifications.service.js:8-23,49-52`); mark-read returns `{success:true}` with no counts (`:60-82`, RT-03); the socket payload has no `role`, so an event may not correspond to a row the list returns. | Return counts from the mark-read calls; include `role`/`tenantId` in the payload. |
| NEW-65 | P3 | `/invoices/:id/pdf` does not exist but the CMS client declares it (`invoices.routes.js:74,116`); invoices have no downloadable receipt. | Add the route or remove the client method. |
| NEW-66 | P3 | `GET /host/today-summary` and `/branch-quota` are `authorize('GYM_HOST')` only (`host.routes.js:34-35`), so a team member cannot use the "Today" endpoint the app's host mode uses; spec §3.3's `GET /host/dashboard?branchId=` does not exist. | One permission-based dashboard endpoint. |
| NEW-67 | P3 | A Google/Apple re-auth mismatch answers 401 with no `code` (`auth.service.js:1065,1074`), so the CMS client treats it as an expired token and refreshes once before showing the message (`client.ts:58-62`). | Add `code: 'reauth_failed'`. |
| Mobile | P2 | `addLedgerAdjustment` ignores the status, so a 202 reads as saved (`workspace_repository.dart:394`); ledger and payout screens print whole rupees (`team_ledger_workspace_screen.dart:225,233`); payouts and bank accounts are local state (PAY-10 / NEW-09). | Separate mobile issue. |

None blocks a page entirely, so nothing was escalated.

## Not verified

- Nothing was run against a real backend or database (as instructed): every flow is proven against mocked responses shaped from the backend code.
- The socket was exercised with a mocked client (token in `auth`, refresh on reconnect, event to refetch) and in Playwright only up to a refused connection; not against a live Socket.IO server.
- The Google confirmation path of `ReauthDialog` was tested with the sign-in button mocked, not with Google's script.
