import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'PKR') {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount)
}

export function formatDate(date: string | Date, pattern = 'MMM dd, yyyy') {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return format(d, pattern)
}

export function formatRelativeTime(date: string | Date) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

export function getInitials(name?: string | null) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function getStatusColor(status?: string | null): string {
  if (!status) return 'secondary'
  const map: Record<string, string> = {
    ACTIVE: 'success',
    APPROVED: 'success',
    COMPLETED: 'success',
    PAID: 'success',
    PENDING: 'warning',
    PENDING_REVIEW: 'warning',
    UNDER_REVIEW: 'warning',
    ISSUED: 'warning',
    FROZEN: 'warning',
    INACTIVE: 'secondary',
    CANCELLED: 'secondary',
    EXPIRED: 'secondary',
    REJECTED: 'destructive',
    SUSPENDED: 'destructive',
    FAILED: 'destructive',
    OVERDUE: 'destructive',
  }
  return map[status] || 'secondary'
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function formatDuration(durationType: string, durationValue: number) {
  const map: Record<string, string> = {
    DAILY: durationValue === 1 ? '1 Day' : `${durationValue} Days`,
    WEEKLY: durationValue === 1 ? '1 Week' : `${durationValue} Weeks`,
    MONTHLY: durationValue === 1 ? '1 Month' : `${durationValue} Months`,
    QUARTERLY: durationValue === 1 ? '1 Quarter' : `${durationValue} Quarters`,
    YEARLY: durationValue === 1 ? '1 Year' : `${durationValue} Years`,
  }
  return map[durationType] || `${durationValue} ${durationType}`
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
