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
- [ ] PR 2: state sweep (pages with no error handling, then 3A-3D pages)
- [ ] PR 3: UX-17 admin tenant detail per tab
- [ ] PR 6: next-intl + hard-coded-string check + 3A-3D screens
