import { resolveApiError } from '@/lib/api/error-copy'
import type {
  PermissionDef,
  PermissionOverride,
  TeamMember,
  TeamMemberDetail,
  TeamRole,
} from '@/lib/api/team'

/**
 * Permission maths for the Team & Access editor.
 *
 * A port of the mobile models and editor
 * (gyms_era/lib/features/host/data/models/team_models.dart,
 * presentation/screens/permission_editor_screen.dart), so the same person reads
 * the same in the app and in the CMS. The server computes effective permissions;
 * nothing here grants anything.
 */

export type AccessTier = 'OFF' | 'REQUEST' | 'DIRECT'

export const TIER_LABEL: Record<AccessTier, string> = {
  OFF: 'Off',
  REQUEST: 'Needs approval',
  DIRECT: 'Direct',
}

const DIRECT_SUFFIX = '.direct'

export const directKeyFor = (permissionKey: string) => `${permissionKey}${DIRECT_SUFFIX}`

/** Staged overrides, keyed by permission and branch (`*` = every branch in scope). */
export type OverrideMap = Record<string, PermissionOverride>

export const overrideMapKey = (permissionKey: string, branchId?: string | null) =>
  `${permissionKey}@${branchId ?? '*'}`

export const toOverrideMap = (overrides: PermissionOverride[]): OverrideMap => {
  const map: OverrideMap = {}
  for (const o of overrides) map[overrideMapKey(o.permissionKey, o.branchId)] = o
  return map
}

/** The owner shorthand: the server sends `['*']` instead of every key. */
export const hasEverything = (detail: Pick<TeamMemberDetail, 'effectivePermissions'>) =>
  detail.effectivePermissions.includes('*')

/** The tier the server resolved for this person. Same rule as the mobile `tierFor`. */
export const savedTier = (
  detail: Pick<TeamMemberDetail, 'effectivePermissions'>,
  permissionKey: string
): AccessTier => {
  if (hasEverything(detail)) return 'DIRECT'
  if (!detail.effectivePermissions.includes(permissionKey)) return 'OFF'
  return detail.effectivePermissions.includes(directKeyFor(permissionKey)) ? 'DIRECT' : 'REQUEST'
}

const sameOverride = (a?: PermissionOverride, b?: PermissionOverride) =>
  (a?.effect ?? null) === (b?.effect ?? null) && (a?.dataScope ?? null) === (b?.dataScope ?? null)

/** True when the row was changed in this editing session. */
export const isRowChanged = (perm: PermissionDef, saved: OverrideMap, working: OverrideMap) => {
  const base = overrideMapKey(perm.key)
  const twin = overrideMapKey(directKeyFor(perm.key))
  return !sameOverride(saved[base], working[base]) || !sameOverride(saved[twin], working[twin])
}

/**
 * The tier to show for a row: the server's answer until the row is edited, then
 * what the staged overrides will produce (what mobile's `_effectiveTier` shows).
 */
export const displayTier = (
  perm: PermissionDef,
  detail: Pick<TeamMemberDetail, 'effectivePermissions'>,
  saved: OverrideMap,
  working: OverrideMap,
  presetTier: AccessTier
): AccessTier => {
  if (!isRowChanged(perm, saved, working)) return savedTier(detail, perm.key)

  const base = working[overrideMapKey(perm.key)]
  if (!base) return presetTier
  if (base.effect === 'DENY') return 'OFF'
  // A non-approvable permission has no `.direct` twin: on means it just happens.
  if (!perm.approvable) return 'DIRECT'
  const twin = working[overrideMapKey(directKeyFor(perm.key))]
  return twin && twin.effect === 'ALLOW' ? 'DIRECT' : 'REQUEST'
}

/** Stage one row. Returns a new map; the same writes mobile's `_stagePermission` makes. */
export const stageTier = (working: OverrideMap, perm: PermissionDef, next: AccessTier): OverrideMap => {
  const out = { ...working }
  const baseKey = overrideMapKey(perm.key)
  const twinKey = overrideMapKey(directKeyFor(perm.key))
  const keep = out[baseKey]
  const base = (effect: 'ALLOW' | 'DENY'): PermissionOverride => ({
    ...(keep ?? {}),
    permissionKey: perm.key,
    effect,
  })

  if (!perm.approvable) {
    out[baseKey] = base(next === 'OFF' ? 'DENY' : 'ALLOW')
    return out
  }

  if (next === 'OFF') {
    out[baseKey] = base('DENY')
    delete out[twinKey]
    return out
  }
  out[baseKey] = base('ALLOW')
  out[twinKey] = { permissionKey: directKeyFor(perm.key), effect: next === 'DIRECT' ? 'ALLOW' : 'DENY' }
  return out
}

/** What the role alone gives for this permission, in the editor's three choices. */
export const presetTierFor = (role: TeamRole | undefined, permissionKey: string): AccessTier => {
  if (!role) return 'OFF'
  const keys = new Set(role.preset.map((g) => g.permissionKey))
  if (!keys.has(permissionKey)) return 'OFF'
  return keys.has(directKeyFor(permissionKey)) ? 'DIRECT' : 'REQUEST'
}

const PRESET_ONLY_LABEL: Record<string, string> = {
  V: 'View only',
  A: 'Can approve',
  F: 'Full access',
}

/**
 * Spec §8.3.3 / RBAC-01: View, Approve and Full come from the role and are not
 * edited per person. Returns the read-only label for such a row, or null when the
 * row is one of the three editable choices.
 *
 * A row that already carries an override stays editable so it can be undone.
 */
export const presetOnlyLabel = (
  perm: PermissionDef,
  role: TeamRole | undefined,
  working: OverrideMap
): string | null => {
  if (!role) return null
  if (working[overrideMapKey(perm.key)] || working[overrideMapKey(directKeyFor(perm.key))]) return null
  const grant = role.preset.find((g) => g.permissionKey === perm.key)
  if (!grant) return null
  // Full on an approvable permission is "Direct", which is one of the three choices.
  if (grant.tier === 'F' && perm.approvable) return null
  const label = PRESET_ONLY_LABEL[grant.tier]
  return label ? `${label} · from ${role.name} role` : null
}

export interface PermissionChange {
  permissionKey: string
  label: string
  approvable: boolean
  before: AccessTier
  after: AccessTier
}

/** How a tier reads in the diff: a plain on/off permission has no "needs approval". */
export const tierText = (tier: AccessTier, approvable: boolean) =>
  approvable ? TIER_LABEL[tier] : tier === 'OFF' ? 'Off' : 'On'

/** Only the rows the user changed, with their tier before and after. */
export const diffChanges = (
  permissions: PermissionDef[],
  detail: Pick<TeamMemberDetail, 'effectivePermissions'>,
  saved: OverrideMap,
  working: OverrideMap,
  role: TeamRole | undefined
): PermissionChange[] =>
  permissions
    .filter((perm) => isRowChanged(perm, saved, working))
    .map((perm) => ({
      permissionKey: perm.key,
      label: perm.label,
      approvable: perm.approvable,
      before: savedTier(detail, perm.key),
      after: displayTier(perm, detail, saved, working, presetTierFor(role, perm.key)),
    }))

// ── Member presentation (mobile `TeamMember` getters) ─────────────────────────

export const memberDisplayName = (m: Pick<TeamMember, 'fullName' | 'email'>) =>
  m.fullName && m.fullName.trim() ? m.fullName.trim() : m.email || 'Team member'

export const memberScopeLabel = (m: Pick<TeamMember, 'scopeType' | 'branches'>) => {
  if (m.scopeType === 'ORG') return 'All branches'
  if (m.branches.length === 0) return 'No branches'
  if (m.branches.length === 1) return m.branches[0].name
  return `${m.branches.length} branches`
}

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited',
  SUSPENDED: 'Suspended',
  REVOKED: 'Revoked',
}

// ── Errors ───────────────────────────────────────────────────────────────────

/** Codes the server falls back to when a route gives no specific one. */
const GENERIC_CODES = new Set(['forbidden', 'conflict', 'not_found', 'validation_error'])

/**
 * Message for a failed team call. The shared resolver answers first; where the
 * server sent only a generic code, its own sentence says more ("You cannot assign
 * the Org Admin role — it is at or above your own level"), so that one is shown.
 */
export const teamErrorMessage = (error: unknown): { code: string | null; status: number | null; message: string } => {
  const resolved = resolveApiError(error)
  const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response
  const serverMessage = response?.data?.message
  const message =
    resolved.code && GENERIC_CODES.has(resolved.code) && serverMessage ? serverMessage : resolved.message
  return { code: resolved.code, status: response?.status ?? null, message }
}

export const isGrantsChanged = (error: unknown) => {
  const { code, status } = teamErrorMessage(error)
  return status === 409 && code === 'grants_changed'
}
