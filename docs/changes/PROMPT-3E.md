# Prompt 3E: screen-state and design-system pass (CMS)

Owner decisions (to be recorded in spec §14 in the final docs PR): mobile orange is the primary brand
color everywhere; UX-09 covers string infrastructure plus the Phase 3A-3D screens only (rest = GLB-03).

## PR 1: foundation
- `design/design-tokens.json` (copy of `gymsera_be/docs/design-tokens.json`) → `scripts/generate-tokens.mjs` → `src/styles/tokens.css`.
  Run `npm run tokens` after editing; `tests/lib/design-tokens.test.ts` fails on drift and on any role pair below its contrast minimum.
- Orange `#FF5C00` with white text is 3.10:1 (fails AA 4.5). Split into `brand` (`#FF5C00`: decoration, icons, large text on white)
  and `primary` (`#C2410C`: buttons and text, white-on-primary 5.18:1).
- Shared states: `ErrorState` (server sentence, Retry only when a retry can help, request id, 403 never raw),
  `OfflineBanner`, `SkeletonList`; `SkipLink` + `#main-content` in `DashboardLayout`.
- axe harness: `tests/helpers/axe.ts` (`axe-core`; color-contrast is covered at token level because jsdom has no layout).

## Screen checklist
Ticked as committed (copied into AGENT_HANDOFF §2 in the final docs PR).
- [x] PR 2: state sweep. A failed load used to show an empty list ("No members found"), a blank page, or a form over data that never loaded.
  Now each shows `ErrorState` (Retry, reference id, 403 never raw): gym members, member detail, branch detail (+ its tables),
  subscriptions, attendance, plans, trainers, gym profile, business profile, admin tenants / cities / billing plans / packages / reviews / reports.
  Billing settings: only a 404 means "no plan" (R-21); any other failure is a failed load. `DataTable` gained `error` / `errorWhat` / `onRetry`.
  Already right (3A-3D, not changed): team, approvals, ledger, payments, payouts, invoices, reports, dashboard, notifications, listing editor.
- [x] PR 3: UX-17 / PERF-10 admin tenant detail per tab. `admin/tenants/[id]/page.tsx` 1,505 → 403 lines (tenant record, header, lifecycle actions);
  seven tab components in `src/components/features/admin-tenant/`, each mounted and fetching only while open (was 13 `useQuery` in the page).
  Behaviour change: the tab triggers no longer carry counts or the capacity "!" badge (they needed every tab's data up front);
  the same information is inside each tab. Package and city lists load only when their dialog opens.
- [ ] PR 6: next-intl + hard-coded-string check + 3A-3D screens
