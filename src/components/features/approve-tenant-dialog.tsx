'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { adminApi } from '@/lib/api/admin'
import { describeRequestError, serverCode } from '@/lib/api/request-errors'
import type { ApprovalPhoto, Tenant } from '@/types'

const KIND_LABEL: Record<ApprovalPhoto['kind'], string> = { logo: 'Logo', cover: 'Cover', gallery: 'Photo' }

/** What the admin is told when the approval is refused (the host's copy talks about "submit"). */
export function approvalErrorMessage(error: unknown): string {
  switch (serverCode(error)) {
    case 'visible_plan_required':
      return 'This gym has no plan travellers can see, so it would not be listed. Ask the host to show at least one plan in the GymsEra app, then approve.'
    case 'city_required':
      return 'This gym has no known city. Set its city before approving.'
    case 'photos_not_checked':
      return 'Look at the photos and tick "I checked the photos" before approving.'
    default:
      return describeRequestError(error, 'The gym could not be approved. Please try again.')
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant: Tenant
  tenantId: string
  loading: boolean
  /** The approval failed: its message is shown here, in the dialog. */
  error: unknown
  onApprove: () => void
}

/**
 * Approve / Re-approve / Resume (Phase 7 P9, R-84, NEW-158): every photo the approval publishes,
 * each with Remove, and "I checked the photos" before Approve. The API refuses without the tick and
 * records who gave it.
 */
export function ApproveTenantDialog({ open, onOpenChange, tenant, tenantId, loading, error, onApprove }: Props) {
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState(false)
  const photos = tenant.approvalPhotos ?? []
  const photoKey = photos.map((p) => p.url).join('|')

  // A changed set of photos needs a new look.
  useEffect(() => setChecked(false), [open, photoKey])

  const removeMutation = useMutation({
    mutationFn: (url: string) => adminApi.removeApprovalPhoto(tenantId, url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  })

  const verb = tenant.status === 'REJECTED' ? 'Re-approve' : tenant.status === 'APPROVED' ? 'Resume' : 'Approve'
  const title = tenant.status === 'REJECTED' ? 'Re-approve Tenant' : tenant.status === 'APPROVED' ? 'Resume Provisioning' : 'Approve Tenant'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Travellers will see these photos for &quot;{tenant.businessName}&quot;. Remove any that is not a real photo of
            the gym, such as a screenshot.
          </DialogDescription>
        </DialogHeader>

        {photos.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">This gym has no photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Photos to check">
            {photos.map((p, i) => (
              <li key={p.url} className="overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`${KIND_LABEL[p.kind]} ${i + 1}`} className="h-32 w-full object-cover" />
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                  <span className="text-muted-foreground">{KIND_LABEL[p.kind]}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove photo ${i + 1}`}
                    loading={removeMutation.isPending && removeMutation.variables === p.url}
                    onClick={() => removeMutation.mutate(p.url)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {removeMutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>{describeRequestError(removeMutation.error, 'The photo could not be removed. Please try again.')}</AlertDescription>
          </Alert>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>I checked the photos: they show this gym and nothing else.</span>
        </label>

        {!!error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{approvalErrorMessage(error)}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={onApprove} loading={loading} disabled={!checked || removeMutation.isPending}>{verb}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
