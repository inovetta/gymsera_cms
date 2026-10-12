'use client'

import { AlertTriangle, RefreshCw, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveApiError } from '@/lib/api/error-copy'
import { describeRequestError, httpStatus } from '@/lib/api/request-errors'

interface ErrorStateProps {
  /** The error a query or mutation threw. */
  error: unknown
  /** What failed to load, e.g. "the member list". Used in the 403 sentence and the fallback. */
  what: string
  /** Wire to `query.refetch`. The Retry button only shows for errors that can succeed on a second try. */
  onRetry?: () => void
  /** Smaller layout for one failed section of a page (spec §2.5 "Partial"). */
  compact?: boolean
}

/** Network failures, timeouts and 5xx can succeed later; other 4xx answers will not change on retry. */
function isRetryable(error: unknown): boolean {
  const status = httpStatus(error)
  if (status === null) return true
  return status >= 500 || status === 408 || status === 429
}

/**
 * The error half of the screen-state contract (spec §2.5): the server's own sentence mapped through
 * the shared copy table, Retry only when a retry can help, and the request id to quote to support.
 * A 403 never shows raw: it says what is missing and who to ask.
 */
export function ErrorState({ error, what, onRetry, compact = false }: ErrorStateProps) {
  const forbidden = httpStatus(error) === 403
  const requestId = resolveApiError(error).requestId
  const message = forbidden
    ? `You do not have access to ${what}. Ask the owner of this organization.`
    : describeRequestError(error, `We could not load ${what}. Please try again.`)
  const Icon = forbidden ? ShieldOff : AlertTriangle

  return (
    <div
      role="alert"
      data-testid="error-state"
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <Icon className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <p className="max-w-md text-sm text-foreground">{message}</p>
      {requestId && (
        <p className="mt-2 text-xs text-muted-foreground">
          Reference: <span className="font-mono">{requestId}</span>
        </p>
      )}
      {!forbidden && onRetry && isRetryable(error) && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  )
}
