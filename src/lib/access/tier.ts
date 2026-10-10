import type { OrgMembership } from '@/lib/api/me'

/**
 * Off / Needs approval / Direct for one permission, read from the effective permissions in
 * GET /me/context (the same rule as the mobile `tierFor` and `savedTier` in lib/team/access.ts).
 * A key is held at "Needs approval" when it is listed alone, and at "Direct" when
 * `<key>.direct` is listed too. The server still decides; this only labels the button.
 */
export type ActionTier = 'OFF' | 'REQUEST' | 'DIRECT'

const holdsKey = (permissions: string[], key: string) => permissions.includes('*') || permissions.includes(key)

export function tierAt(org: OrgMembership | null, key: string, branchId?: string | null): ActionTier {
  if (!org) return 'OFF'
  if (org.isOwner) return 'DIRECT'
  const lists: string[][] = [org.orgPermissions]
  if (branchId) {
    const branch = org.branches.find((b) => b.id === branchId)
    if (branch) lists.push(branch.permissions)
  } else {
    for (const b of org.branches) lists.push(b.permissions)
  }
  let best: ActionTier = 'OFF'
  for (const permissions of lists) {
    if (!holdsKey(permissions, key)) continue
    if (permissions.includes('*') || permissions.includes(`${key}.direct`)) return 'DIRECT'
    best = 'REQUEST'
  }
  return best
}
