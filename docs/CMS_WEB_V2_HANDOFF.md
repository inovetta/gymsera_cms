# CMS and website: naming v2 handoff

Owner of this file: the CMS/website agent. It does not replace `gymsera_be/docs/AGENT_HANDOFF.md` or spec §13.

## State (2026-11-24)
- Worktrees: `gymsera_cms_namingv2`, `gymsera_web_namingv2`, branch `feat/naming-v2` in both. Nothing merged or deployed.
- Contract: `gymsera_be` branch `docs/naming-and-contract`, `docs/API_CONTRACT_V2.md`, A1 + A2 + A3 (commit 46f3353) read.
- Tests (mocks only, no live server): CMS 795 pass (tsc clean), website 207 pass.

## A3 check against the clients
- `branches` list keys (discovery, host, organizations): both clients already read `branches`; no `gyms` key is read.
- `GET /me/subscriptions` → `{ memberships }` with `branchId`, `businessId`: website type `MemberSubscription` already has both.
- HostStatus `area`, `/me/staff-status`, staff invites, saved businesses, inbox `business { id, name }` + `branchName`:
  neither client calls these routes (they are mobile-only today). Nothing to change; check again if a screen adds them.
- Notification `organization_reactivated`: neither client names the old type.
- Business documents: A3 does not name the host list wrapper. `documentsFrom` (`src/lib/api/host.ts`) reads both a bare array and
  `{ documents: [...] }`. A3 J11 (final): the documents wrapper is `{ documents: [...] }`, host and admin; the tolerant helper stays for now.
- J10-J12 compared 2026-11-24: CMS Add Business matches. Website mismatches (not fixed, owner to decide): the wizard's
  `POST /organizations/:id/first-business` sends `firstBranchDraft` + flat `address/latitude/longitude` and draft keys
  `name/placeId/plans`, where J10 wants `firstBranch` with `branchName/googlePlaceId/packages/areaId/imagesJson`; and it
  uploads photos to `first-business/images` before the complete `firstBranch` exists (J12 says no partial server save).

## Decisions
- Documents item is `{ id, type, status, uploadedAt, reviewedAt, rejectionReason }`; upload body key is `type`.
- Verified badge wording is fixed (D11): "Registration document checked by GymsEra". Never "trusted", "safe", "licensed".
- Review queue rows have no API id; the page builds `kind:businessId|organizationId` client-side.

## Tests added this session
- CMS `tests/components/review-queue-and-documents.test.tsx`: review queue page (rows, row links, Businesses tab query),
  `reviewQueueHref`, `documentsFrom`, documents dialog (rejection reason, upload key `type`), `VerifiedCheck`.
- Website `tests/components/verified-check.test.tsx`. Wizard order is already covered by `register-step-order.test.tsx`.

## Next steps
1. Wait for Agent A's API on a live server, then run the live-server pass (CMS and website against the real API).
2. Resolve the host documents wrapper (see above) and drop the tolerance if only one shape is sent.
3. Open pull requests only when the owner asks. No merge, no deploy.

## Update 2026-11-24 (J10 decision applied on the website)
- Wizard now posts `organizationName?`, `firstBusinessName`, `firstBusinessDescription`, `genderType`, `firstBranch` (FirstBranch:
  branchName, cityId, areaId, address, latitude, longitude, googlePlaceId, phone, openingTime/closingTime, imagesJson, packages).
- Photo upload before submit stays on `first-business/images` until the owner sends the stateless route (J12).
- Resolved (owner go-ahead 2026-11-24): area = `areaId` when matched, else `areaRequestId` (typed area kept via
  `/places/area-requests/check` then create, as the CMS); the location step does not continue with neither. `hours` is the
  contract WeeklyHours (one slot on all 7 days, default 06:00-22:00). No `facilitiesJson` (wizard collects none).
- Photos now go to `POST /host/staging-images` (field `images`, `data.urls`), kept in wizard state, at least 3 and at most 10;
  the old `first-business/images` calls are removed. Remove drops the URL locally.
- Not ported: the CMS's Google roads/landmarks (`extended`) area search; the wizard offers real areas and typed requests only.
- Not sent by the wizard (optional in the body): `logoUrl`, `coverImageUrl`; `genderType` is sent. No `kycDocumentsJson`.

## Live pass 2026-11-26 (local API, be `feat/naming-v2-r2` `bb5913c`, no mocks)
- Setup: local Docker MySQL 5.7 (`gymsera-walkthrough-mysql57`, port 3306), a fresh platform database `gymsera_v2_live`
  (model sync + platform migrations, one city/area, one admin, one package), API on port 3100, Redis off, mail to an
  invalid host. The only shortcut: the OTP is set in the database (no mail). Script and answers: kept outside the repo.
- Flow run (43 checks pass): register → OTP → organization → staging photos → first-business → package → finalize
  (PENDING_REVIEW) → review queue (ORGANIZATION) → approve organization (tenant provisioned) → review queue (BUSINESS) →
  Add Branch into the pending business = 409 `business_not_approved` → approve = 422 `business_requirements_missing`
  `missing: [PROOF_OF_PREMISES]` → host uploads proof → document view/approve → approve business (held first branch built)
  → verify without registration = 422 `registration_missing` → registration upload → verify → **branch appears in
  `GET /discovery/branches`** with `businessVerified: true` → revoke → false.
- Client changes from the pass:
  - CMS: the organization page shows the first business's approval under the organization (before approval: what comes
    next); `withBusinesses` reads the live `organization.organizations`; `reviewQueueFor` keeps the tab's kind and counts rows;
    error copy for `business_requirements_missing` and `registration_missing`; the organization list points to the review queue.
  - Website: first-business sends `organizationName` (required) and no `genderType` (refused, 422 unknown_field); branch
    phone is required before Photos (the API requires it); after submit, "Upload your proof of premises to go live" on the
    confirmation step and at `/gym-owner/proof-of-premises` (protected route).

### Server issues found (not fixed here; for Agent A / the owner)
1. The first business exists only after the organization is approved. After submit, `GET /host/businesses` is `[]` and
   `POST /host/businesses/:id/kyc-documents` answers 409 `tenant_not_active`, so a new host cannot upload proof of premises
   until the organization is approved, and the review queue has no BUSINESS row for it until then.
2. `GET /admin/review-queue` ignores `kind` (both kinds come back) and sends no `page` / `total`.
3. `GET /admin/organizations/:id` sends the businesses as `organization.organizations` (+ `gymListing`), not `businesses`
   (contract A1 G2). The contract's own F7 note says "organizations as before": the two notes disagree.
4. `GET /discovery/businesses/:id` → `business` has no `businessVerified` (contract §3); branch lists do have it.
5. The error code is still `tenant_not_active` ("Your gym is not live yet…"); A1 G16 renamed it `organization_not_active`.
6. `POST /organizations/:id/first-business` refuses `genderType`, so the first business is saved `MIXED` whatever the host
   picked (Add Business accepts `genderType`).
- Not a bug: Add Business answered 403 `branch_limit_reached` (pool max 1 with PAY_LATER and no paid plan).

### Tests
- CMS 803 / 803 (`tests/components/live-pass-review.test.tsx` new), tsc 0, lint 0 errors. The NEW-256 word-list test failed once
  in a full run and passed alone and on the rerun (timing).
- Website 219 / 219 (`tests/components/proof-of-premises.test.tsx` new; wizard tests send the phone and pin the new keys),
  tsc 0, lint 0, `next build` OK.
- Untouched, for the owner: tracked `tests/components/*.test.tsx-E` files on the website branch (sed backups from an earlier commit).
