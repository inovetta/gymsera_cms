# NEW-55: Manual Check-in returned 422

## Issue
Attendance → Manual Check-in posted `{ email, branchId }` to `POST /attendance/check-in`. Every attempt was rejected with 422 and the page showed only "Failed to record check-in".

## Root cause
- CMS: `src/app/(dashboard)/gym/attendance/page.tsx` (old `checkInMutation`) sent `email` and `branchId` only; `src/lib/api/attendance.ts` typed the payload with optional `userId`/`email`.
- Backend: `gymsera_be/src/routes/attendance.routes.js:354-362` mounts `/check-in` with `validate(validators.manual)`; `src/validators/attendance.validator.js:17-30` requires `userId`, `branchId`, `subscriptionId` (all UUID v4). `email` is not read anywhere. The controller (`attendance.controller.js:26`) passes the body to `attendanceService.manual` (`attendance.service.js:158`).
- Old error handler: `onError: () => toast('Failed to record check-in')` ignored the server's reply.

## Pattern reused
- Member lookup: `GET /host/branches/:branchId/members/lookup?email=` (`host.routes.js:99`, `host.controller.js:1421`). It resolves the tenant from the branch and returns `{ exists, user }`; `exists` is true only for a member holding an ACTIVE/PENDING/FROZEN subscription at that branch.
- Subscription list: `GET /subscriptions/staff?branchId&userId&status=ACTIVE` (existing `subscriptionsApi.getStaffSubscriptions`), which resolves branch scope with `subscriptions.view`.
- Branch choice: the Payments page pattern (`holdsAtBranch` from `lib/access/menu.ts` over `useGymAccess().organization`).

## Fix
- `src/lib/attendance/manual-checkin.ts` (new): `resolveManualCheckIn` (lookup → active subscriptions → pick the one valid today, or return the list to choose from) and `describeCheckInError` (server message first, fixed copy only when the reply has none).
- `src/lib/api/host.ts`: `hostApi.lookupBranchMember`.
- `src/lib/api/attendance.ts`: `ManualCheckInPayload` is now `{ userId, subscriptionId, branchId, notes? }`.
- Dialog: email is required; the branch list is the owner's/host's branches, or for a team member only branches where they hold `checkins.manual.create`; a subscription picker appears when more than one subscription is valid; the error shows inside the dialog.
- "Valid today" mirrors the server (`attendance.service.js:6-25`): status ACTIVE, end date not passed, visits left. The server still makes the final decision.

## Messages
| Case | Shown |
|---|---|
| No member with that email at this branch | "No member with the email … was found at this branch." |
| Member has no valid subscription at this branch | "<name> has no active subscription at this branch." |
| Already checked in (409 `ALREADY_CHECKED_IN`) | server text, e.g. "Member already checked in at 10:32" |
| 403 | server text if any (e.g. "Subscription is frozen"), else "You do not have permission to check members in at this branch." (on the lookup step: "…to look up members at this branch.") |
| 422 | the server's field messages joined, else its message |

## Tests
- `tests/components/manual-checkin.test.tsx` (11): success body, member not found, no active subscription, one valid among expired, several valid (picker), 409, 403 (with and without server text), 403 on lookup, 422 with server message, branch filtering for a team member and for the owner.
- `e2e/manual-checkin.spec.ts` (2, `**/api/v1/**` answered by `page.route`): posts all three ids; shows the 409 reason.

## Findings outside the CMS (backend, not changed)
1. `POST /attendance/check-in` and `/manual` have no `can('checkins.manual.create')` guard (`attendance.routes.js:81-88, 354-362`). They check only `authorize('GYM_HOST','BRANCH_MANAGER')`. The key exists in `constants/permissions.js:154` but no route enforces it. The CMS hides branches the user lacks the key at, but that is a convenience, not enforcement.
2. `GET /host/branches/:branchId/members/lookup` and `/members` (`host.routes.js:99-101`) have no `can()`/branch-access check either; any BRANCH_MANAGER of the tenant can query any branch.
3. A team member with `checkins.manual.create` but without `subscriptions.view` gets 403 from `GET /subscriptions/staff` (`subscriptions.routes.js:213`), so the dialog cannot find the subscription id. The lookup endpoint does not return a subscription id. Fix options for the backend: return the active subscription ids from the lookup route, or accept `email` on `/attendance/check-in`.

## Other CMS requests the backend validator would reject
- **Payments → Record Payment** (`src/app/(dashboard)/gym/payments/page.tsx:33,340`): the "User ID" field is free text (`z.string().min(1)`), but `payments.validator.js` `recordPayment` needs a UUID v4 `userId`; anything else is a 422, shown only as "Failed to record payment" (`page.tsx:118`). Same class of bug; not changed here.
- Checked and consistent: subscription freeze (`freezeFrom`/`freezeTo`), trainer assign (`branchId`), `POST /payments` field names and enums. Not audited exhaustively: admin, tenant, plan, city and user endpoints.
