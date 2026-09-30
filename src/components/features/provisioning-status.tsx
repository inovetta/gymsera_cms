import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TenantProvisioning } from '@/types'

// Admin labels for the six backend steps (FLOW-02), in order.
export const PROVISIONING_STEP_LABELS = [
  'Create database',
  'Set up tables',
  'Create listing',
  'Create gym and main branch',
  'Link plan',
  'Activate',
]

interface ProvisioningStatusProps {
  status: string
  provisioning?: TenantProvisioning | null
  onResume: () => void
  resuming?: boolean
}

/**
 * "Provisioning… (step n/6)" for an APPROVED tenant, with Resume when the
 * last run stopped. Shows only what the API reports; the server decides
 * whether a run is in progress and whether Resume is allowed.
 */
export function ProvisioningStatus({ status, provisioning, onResume, resuming = false }: ProvisioningStatusProps) {
  if (status !== 'APPROVED' || !provisioning) return null

  const { step, totalSteps, inProgress, lockedUntil, lastError, canResume, state } = provisioning
  const nextLabel = PROVISIONING_STEP_LABELS[Math.min(step, totalSteps - 1)]
  const notStarted = state === null

  return (
    <div role="status" aria-live="polite" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {inProgress ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <AlertCircle className="h-4 w-4" aria-hidden />}
          <span className="font-medium">
            {inProgress
              ? `Provisioning… (step ${step}/${totalSteps} done, now: ${nextLabel})`
              : notStarted
                ? 'Approved, but provisioning has not run yet'
                : `Provisioning stopped at step ${step}/${totalSteps} (next: ${nextLabel})`}
          </span>
        </div>
        {!inProgress && canResume && (
          <Button size="sm" onClick={onResume} loading={resuming}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Resume
          </Button>
        )}
      </div>
      {inProgress && lockedUntil && (
        <p className="mt-1 text-xs">
          Another run is working on it. If it stopped, Resume is available after{' '}
          {new Date(lockedUntil).toLocaleTimeString()}.
        </p>
      )}
      {!inProgress && lastError && (
        <p className="mt-1 text-xs break-words">
          <strong>Last error:</strong> {lastError}
        </p>
      )}
    </div>
  )
}
