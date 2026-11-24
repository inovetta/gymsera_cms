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
