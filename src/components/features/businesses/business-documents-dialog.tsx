'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { hostApi, type Business, type BusinessDocument, type BusinessDocumentType } from '@/lib/api/host'
import { resolveApiError } from '@/lib/api/error-copy'
import { StatusBadge } from '@/components/features/status-badge'
import { GET_VERIFIED_PROMPT, VERIFIED_EXPLANATION, VerifiedCheck } from './verified-check'

const KINDS: Array<{ type: BusinessDocumentType; label: string; required: boolean; hint: string }> = [
  { type: 'PROOF_OF_PREMISES', label: 'Proof of premises', required: true, hint: 'A rent agreement, ownership paper or utility bill for the address. Needed for approval.' },
  { type: 'BUSINESS_REGISTRATION', label: 'Registration', required: false, hint: GET_VERIFIED_PROMPT + '.' },
]

/**
 * One business's documents (enterprise D10, contract v2 /host/businesses/:businessId/kyc-documents):
 * proof of premises (required for approval) and registration (optional; it gets the Verified badge).
 */
export function BusinessDocumentsDialog({ business, open, onOpenChange }: { business: Business | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient()
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [error, setError] = useState<string | null>(null)
  const businessId = business?.id ?? ''
  const key = ['business-documents', businessId]

  const docsQuery = useQuery({ queryKey: key, queryFn: () => hostApi.getBusinessDocuments(businessId), enabled: open && !!businessId })
  const docs: BusinessDocument[] = docsQuery.data ?? []

  const upload = useMutation({
    mutationFn: ({ type, files }: { type: BusinessDocumentType; files: File[] }) => hostApi.uploadBusinessDocuments(businessId, type, files),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: ['host-businesses'] })
    },
    onError: (err) => setError(resolveApiError(err).message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Documents · {business?.name}
            <VerifiedCheck verified={business?.businessVerified} withLabel />
          </DialogTitle>
          <DialogDescription>
            {business?.businessVerified ? VERIFIED_EXPLANATION + '.' : GET_VERIFIED_PROMPT + '.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {KINDS.map((k) => {
            const mine = docs.filter((d) => d.type === k.type)
            return (
              <div key={k.type} className="rounded-lg border p-3" data-testid={`doc-kind-${k.type}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{k.label}{k.required ? ' *' : ' (optional)'}</p>
                  <input
                    ref={(el) => { inputs.current[k.type] = el }}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    aria-label={`Upload ${k.label}`}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      if (files.length) upload.mutate({ type: k.type, files })
                      e.target.value = ''
                    }}
                  />
                  <Button size="sm" variant="outline" loading={upload.isPending && upload.variables?.type === k.type} onClick={() => inputs.current[k.type]?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Upload
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
                {mine.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {mine.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs" data-testid={`host-doc-${d.id}`}>
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        {k.label}, added {new Date(d.uploadedAt).toLocaleDateString()}
                        <StatusBadge status={d.status} />
                        {d.status === 'REJECTED' && d.rejectionReason && <span className="text-destructive">{d.rejectionReason}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
