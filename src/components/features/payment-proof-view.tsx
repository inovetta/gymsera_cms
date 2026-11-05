'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/features/error-state'
import { fetchPrivateFile } from '@/lib/api/private-file'

interface PaymentProofViewProps {
  /** The API's proof route (`/api/v1/payments/<id>/proof`), or null/undefined when there is none. */
  proofUrl?: string | null
  /** True when the payment says a proof was sent but the file was never stored (before P9c). */
  proofMissing?: boolean
  label?: string
}

/**
 * Phase 7 P9c (A): opens a payment proof the only way it can be opened — through the
 * authenticated API route, as a Blob — inside the dashboard. There is no public link to copy.
 */
export function PaymentProofView({ proofUrl, proofMissing, label = 'View' }: PaymentProofViewProps) {
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open || !proofUrl) return
    let objectUrl: string | null = null
    let cancelled = false
    setSrc(null)
    setError(null)
    fetchPrivateFile(proofUrl)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, proofUrl, attempt])

  if (!proofUrl) {
    if (proofMissing) {
      return (
        <span className="text-xs text-muted-foreground" title="The proof was sent before uploads were stored. Ask the member to upload it again.">
          Proof not saved — ask the member to upload it again
        </span>
      )
    }
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">
        {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment proof</DialogTitle>
          </DialogHeader>
          {error ? (
            <ErrorState error={error} what="this payment proof" onRetry={() => setAttempt((n) => n + 1)} compact />
          ) : src ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable remote image
            <img src={src} alt="Payment proof" className="max-h-[70vh] w-full object-contain rounded-md" />
          ) : (
            <Skeleton className="h-80 w-full rounded-md" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
