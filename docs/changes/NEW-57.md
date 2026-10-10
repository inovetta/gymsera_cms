# NEW-57: Manual Check-in and Record Payment use the member lookup

Depends on backend NEW-56 (`gymsera_be` branch `fix/new-56`).

## Issue
1. Manual Check-in found the subscription with `GET /subscriptions/staff`, which needs `subscriptions.view` (`gymsera_be/src/routes/subscriptions.routes.js:213`). A team member with `checkins.manual.create` but not `subscriptions.view` got 403 and could not check anyone in.
2. Payments → Record Payment asked for a raw "User ID (UUID)" (`payments/page.tsx`, old `userId` field), which staff cannot know.

## Root cause
- `src/lib/attendance/manual-checkin.ts` (old `resolveManualCheckIn`) made the second call to `subscriptionsApi.getStaffSubscriptions`.
- `paymentSchema.userId` was a free-text `z.string().min(1)`.

## Pattern reused
The one member lookup, `hostApi.lookupBranchMember` (`GET /host/branches/:branchId/members/lookup`), already used by Manual Check-in. It is now wrapped once in `src/lib/members/lookup.ts` and used by both screens, so "no such member" means the same on both.

## Fix
- `src/lib/members/lookup.ts` (new): `lookupBranchMemberByEmail` → `found { userId, fullName, lookup }` or `not_found { message }`.
- `src/lib/api/host.ts`: `BranchMemberLookup` gains optional `subscriptions` (`id`, `planName`, `endDate`, `remainingVisits`).
- `src/lib/attendance/manual-checkin.ts`: uses `lookup.subscriptions` when the field is an array (an empty array means "no active subscription"; `/subscriptions/staff` is not called). If the field is absent (older server) the old call and the old client-side validity filter run unchanged. Picker, messages and `describeCheckInError` are unchanged.
- `src/app/(dashboard)/gym/payments/page.tsx`: "User ID" replaced by "Member email". On submit the mutation looks the member up at the chosen branch and posts the member's `userId` (no `email` in the payload).
  - Branch is now required in the dialog. The server already answers 400 "A branch is required to record this payment" without one (`gymsera_be/src/controllers/payments.controller.js:18-30`), and the lookup is per branch. The dialog starts on the branch the list shows, or the only branch.
  - Member not found: "No member with the email … was found at this branch." under the email field, nothing posted. Lookup failure (403 / offline): the server's message, else "You do not have permission to look up members at this branch." / "Could not look up the member…", also under the field. Payment POST failure keeps the old toast.
  - Email field is `type="text"` so the form's own message ("Enter a valid email address") shows instead of the browser tooltip.

## Behaviour to know
The lookup reports `exists: true` only when the person holds an ACTIVE, PENDING or FROZEN subscription at that branch (`host.controller.js:1445-1451`). A registered user with no subscription there is "not found" on Record Payment, same as on Manual Check-in. The recording user also needs `members.view` at the branch, on top of `payments.record`. Front Desk, Manager and Org Admin presets have it.

## Tests
- `tests/components/manual-checkin.test.tsx`: five new cases (id from lookup and no `/subscriptions/staff` call, picker, empty list, fallback when field omitted, not found). The existing cases still run the fallback path.
- `tests/components/payments-record-member-lookup.test.tsx` (new): no User ID field, lookup then `userId` posted, not found, 403 on lookup, invalid email.
- `e2e/payments-record-member.spec.ts` (new Playwright): unknown email shows the error and posts nothing; known email posts `userId`. `e2e/manual-checkin.spec.ts` still passes unchanged (fallback path).

## Result
- vitest ×3: 34 files, 217 tests, all pass each time.
- `tsc --noEmit` clean, `npm run build` succeeds.
- Playwright: `payments-record-member` and `manual-checkin` specs pass.
