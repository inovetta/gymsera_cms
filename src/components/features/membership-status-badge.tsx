import { Badge } from '@/components/ui/badge'
import type { MembershipDisplayStatus } from '@/types'

/**
 * NEW-244: a member's plan status, as the app's member list shows it (Active, Expiring soon,
 * Expired, On hold, Pending). The server decides the value (`membershipStatus` on
 * GET /gyms/members); this only names and colours it.
 */
export const MEMBERSHIP_STATUS_OPTIONS: { value: MembershipDisplayStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING', label: 'Expiring soon' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'FROZEN', label: 'On hold' },
  { value: 'PENDING', label: 'Pending' },
]

const LABEL: Record<string, string> = Object.fromEntries(MEMBERSHIP_STATUS_OPTIONS.map((o) => [o.value, o.label]))

const VARIANT: Record<MembershipDisplayStatus, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'destructive',
  FROZEN: 'secondary',
  PENDING: 'outline',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A plan end date is a calendar day ('YYYY-MM-DD'). Read it as that day, never through `new Date()`,
 * which would move it a day back in time zones west of UTC.
 */
export function formatPlanDay(day?: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? '')
  if (!m) return null
  const month = MONTHS[Number(m[2]) - 1]
  return month ? `${Number(m[3])} ${month} ${m[1]}` : null
}

/** The hover text: what the subscription row says, when the badge alone does not. */
function hoverText(status: MembershipDisplayStatus, subscriptionStatus?: string | null, endDate?: string | null) {
  const day = formatPlanDay(endDate)
  if (subscriptionStatus === 'CANCELLED') return 'Subscription cancelled'
  if (status === 'EXPIRED') return day ? `Plan ended ${day}` : 'Plan ended'
  if (status === 'EXPIRING') return day ? `Plan ends ${day}` : 'Plan ends soon'
  if (status === 'FROZEN') return 'Membership on hold (frozen)'
  if (status === 'PENDING') return 'Waiting for payment or approval'
  return day ? `Plan active until ${day}` : 'Plan active'
}

interface Props {
  status?: MembershipDisplayStatus | null
  subscriptionStatus?: string | null
  endDate?: string | null
}

export function MembershipStatusBadge({ status, subscriptionStatus, endDate }: Props) {
  if (!status) {
    return (
      <Badge variant="secondary" data-testid="membership-status" title="No plan at your branches">
        No plan
      </Badge>
    )
  }
  return (
    <Badge variant={VARIANT[status] ?? 'secondary'} data-testid="membership-status" title={hoverText(status, subscriptionStatus, endDate)}>
      {LABEL[status] ?? status}
    </Badge>
  )
}
