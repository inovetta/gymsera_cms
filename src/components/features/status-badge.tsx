import { Badge } from '@/components/ui/badge'
import { getStatusColor } from '@/lib/utils'

interface StatusBadgeProps {
  status?: string | null
  className?: string
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Active',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  PAID: 'Paid',
  PENDING: 'Pending',
  PENDING_REVIEW: 'Pending Review',
  UNDER_REVIEW: 'Under Review',
  ISSUED: 'Issued',
  FROZEN: 'Frozen',
  INACTIVE: 'Inactive',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  FAILED: 'Failed',
  OVERDUE: 'Overdue',
  REFUNDED: 'Refunded',
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

const variantMap: Record<string, BadgeVariant> = {
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  secondary: 'secondary',
  default: 'default',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) return <Badge variant="secondary" className={className}>Unknown</Badge>
  const colorKey = getStatusColor(status)
  const variant: BadgeVariant = variantMap[colorKey] || 'secondary'
  const label = statusLabels[status] || status.replace(/_/g, ' ')

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}
