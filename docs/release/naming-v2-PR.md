# CMS: API contract v2 and the enterprise Organization → Business → Branch model (R-120, NEW-303)

**Branch:** `feat/naming-v2` → `main` (12 commits, fast-forward, no conflicts with `main` at the time of writing).
**Needs:** the API from `gymsera_be` `feat/naming-v2-r2` (contract v2). This CMS does not work against the current
production API, and the current production CMS does not work against the v2 API: release them together (see the
deploy notes).

## What changes

**Names and routes (contract v2)**
- Every API call uses the v2 routes and keys: `/organizations/me/*` (was `/tenants/me`, `/gyms/*`),
  `/host/businesses*` (was `/host/listings*`), `/admin/organizations*` (was `/admin/tenants*`),
  `/admin/businesses/:businessId*`, `/host/business-quota`. Keys renamed as in contract §2 (`tenantId` →
  `organizationId`, `listingId` → `businessId`, `title` → `name`, `businessName` → `organizationName`).
- The selected organization is sent as `X-Organization-Id` (was `X-Tenant-Id`) and kept in localStorage under
  `gymsera_selected_organization` (was `gymsera_selected_tenant`).

**Host (owner)**
- Settings › Profile is the organization: "Organization name", private to the host and GymsEra (D2).
- New Businesses page: one card per business with its branches, status, documents, verified check; Add Business and
  Add Branch follow the app's rules (Add Branch only into an approved business; 409 `business_not_approved` shown).
- A banner from `GET /host/status` `nextStep`: "Upload your proof of premises to go live" (opens that business's
  Documents), then "GymsEra is reviewing" until the business is approved.
- Refund policy per branch, with "Apply to all branches" (D12).

**Admin**
- New Review queue (`GET /admin/review-queue`): organizations and businesses waiting, with Organizations / Businesses tabs.
- Organization page: the first business's approval sits under the organization's own approval, so both are approved on
  one page. Per business: approve (422 `business_requirements_missing` names what is missing), reject with a reason,
  documents (view, approve, reject), Verify (needs a registration document; 422 `registration_missing`) and Remove verification.
- The Organizations list holds organizations only; it points to the Review queue for businesses.
- Notification links: `/host/businesses/<id>` and `/host/businesses/<id>/documents` open Businesses.

## How it was checked
- Unit and component tests: 806 / 806 (`vitest`), `tsc` clean, `next lint` 0 errors.
- Live run against a local v2 API (`feat/naming-v2-r2` `36930cd`, throwaway database): register → approve organization
  → proof of premises → approve business → branch visible to travellers → verify / revoke; 26 / 26 checks pass.
  Notes: `docs/CMS_WEB_V2_HANDOFF.md`.
- Every API path the CMS calls was matched against the contract route table. One path is not in it:
  `GET /invoices/:id/pdf` (`src/lib/api/invoices.ts`, `downloadInvoicePdf`). It is already on `main`, nothing calls
  it, and the API has no such route. Left as it is; remove it in a separate change.

## Reviewer notes
- After deploy, staff who work in several organizations pick theirs again once (new localStorage key).
- No environment variable added or removed; `web.config` and `server.js` unchanged.
- No merge or deploy from this PR without the API release (deploy notes: `docs/release/naming-v2-DEPLOY.md`).
