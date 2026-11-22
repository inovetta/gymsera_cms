'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle, Eye, FileText, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/features/status-badge'
import { VERIFIED_EXPLANATION, VerifiedCheck } from '@/components/features/businesses/verified-check'
import { adminApi } from '@/lib/api/admin'
import type { BusinessDocument } from '@/lib/api/host'
import { resolveApiError } from '@/lib/api/error-copy'
import { MISSING_LABEL } from '@/lib/branches/rules'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

const DOC_LABEL: Record<string, string> = {
  PROOF_OF_PREMISES: 'Proof of premises',
  BUSINESS_REGISTRATION: 'Registration',
}

/** The `missing` list a 422 business_requirements_missing carries (`data.missing`), in words. */
export const missingFromError = (err: unknown): string[] => {
  const missing = (err as { response?: { data?: { data?: { missing?: unknown } } } })?.response?.data?.data?.missing
  return Array.isArray(missing) ? missing.map((m) => MISSING_LABEL[String(m)] ?? String(m)) : []
}

type Reject = { kind: 'business' } | { kind: 'document'; documentId: string; name: string }

/**
 * Admin approval of one business (enterprise spec §5, D10, D11; contract v2 new routes and G4).
 * Needs proof of premises and 3 photos (the API answers 422 `business_requirements_missing` with
 * `missing`); the registration is optional and only drives the Verified badge. Verify needs an
 * uploaded registration (422 `registration_missing`); revoke clears it. One business id (F7).
 */
export function BusinessReviewPanel({ businessId, organizationId }: { businessId: string; organizationId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const approveKey = useRef('')
  const [problem, setProblem] = useState<string | null>(null)
  const [reject, setReject] = useState<Reject | null>(null)
  const [reason, setReason] = useState('')

  const businessQuery = useQuery({ queryKey: ['admin-business', businessId], queryFn: () => adminApi.getBusiness(businessId) })
  const docsQuery = useQuery({ queryKey: ['admin-business-documents', businessId], queryFn: () => adminApi.getBusinessDocuments(businessId) })
  const business = businessQuery.data?.data?.business
  const docs: BusinessDocument[] = docsQuery.data ?? []

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-business', businessId] })
    queryClient.invalidateQueries({ queryKey: ['admin-business-documents', businessId] })
    queryClient.invalidateQueries({ queryKey: ['organization', organizationId] })
    queryClient.invalidateQueries({ queryKey: ['review-queue'] })
  }
  const fail = (title: string) => (err: unknown) => {
    const missing = missingFromError(err)
    const message = missing.length ? `Still needed: ${missing.join(', ')}.` : resolveApiError(err).message
    setProblem(message)
    toast({ title, description: message, variant: 'destructive' })
  }
  const done = (title: string) => () => { setProblem(null); setReject(null); setReason(''); refresh(); toast({ title }) }

  const approve = useMutation({ mutationFn: () => adminApi.approveBusiness(businessId, approveKey.current), onSuccess: done('Business approved'), onError: fail('Not approved') })
  const rejectBusiness = useMutation({ mutationFn: (why: string) => adminApi.rejectBusiness(businessId, why), onSuccess: done('Business sent back for changes'), onError: fail('Not rejected') })
  const verify = useMutation({ mutationFn: () => adminApi.verifyBusiness(businessId), onSuccess: done('Business verified'), onError: fail('Not verified') })
  const unverify = useMutation({ mutationFn: () => adminApi.unverifyBusiness(businessId), onSuccess: done('Verification removed'), onError: fail('Not changed') })
  const approveDoc = useMutation({ mutationFn: (documentId: string) => adminApi.approveBusinessDocument(businessId, documentId), onSuccess: done('Document approved'), onError: fail('Not approved') })
  const rejectDoc = useMutation({ mutationFn: ({ documentId, why }: { documentId: string; why: string }) => adminApi.rejectBusinessDocument(businessId, documentId, why), onSuccess: done('Document rejected'), onError: fail('Not rejected') })

  const view = async (doc: BusinessDocument) => {
    try {
      const blob = await adminApi.downloadBusinessDocument(businessId, doc.id)
      window.open(URL.createObjectURL(blob), '_blank', 'noopener')
    } catch (err) {
      toast({ title: 'Failed to load document', description: resolveApiError(err).message, variant: 'destructive' })
    }
  }

  if (businessQuery.error) return <p className="text-sm text-destructive">{resolveApiError(businessQuery.error).message}</p>
  if (!business) return null

  const status = (business.status ?? '').toUpperCase()
  const hasRegistration = docs.some((d) => d.type === 'BUSINESS_REGISTRATION')
  const missing = business.missingForApproval ?? []

  return (
    <Card data-testid={`business-review-${businessId}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {business.name}
          <VerifiedCheck verified={business.businessVerified} withLabel />
          <StatusBadge status={business.status} />
          {business.kycStatus && <Badge variant="outline" className="text-xs">Documents: {business.kycStatus.replace('_', ' ').toLowerCase()}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {missing.length > 0 && (
          <p className="text-warning" data-testid="review-missing">Needed for approval: {missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}.</p>
        )}
        {business.heldFirstBranch && <p className="text-muted-foreground">Approving builds the first branch the host submitted.</p>}
        {problem && <p role="alert" className="text-destructive" data-testid="review-problem">{problem}</p>}

        <div className="flex flex-wrap gap-2">
          {status !== 'ACTIVE' && (
            <Button size="sm" variant="success" loading={approve.isPending} onClick={() => { approveKey.current = crypto.randomUUID(); approve.mutate() }}>
              <CheckCircle className="mr-2 h-4 w-4" /> Approve business
            </Button>
          )}
          {status !== 'REJECTED' && (
            <Button size="sm" variant="destructive" onClick={() => setReject({ kind: 'business' })}>
              <XCircle className="mr-2 h-4 w-4" /> Reject business
            </Button>
          )}
          {business.businessVerified ? (
            <Button size="sm" variant="outline" loading={unverify.isPending} onClick={() => unverify.mutate()}>Remove verification</Button>
          ) : (
            <Button size="sm" variant="outline" disabled={!hasRegistration} title={hasRegistration ? VERIFIED_EXPLANATION : 'No registration document uploaded'} loading={verify.isPending} onClick={() => verify.mutate()}>
              <BadgeCheck className="mr-2 h-4 w-4" /> Verify
            </Button>
          )}
        </div>
        {business.verifiedAt && business.businessVerified && (
          <p className="text-xs text-muted-foreground">Verified {formatDate(business.verifiedAt)}: {VERIFIED_EXPLANATION}.</p>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documents</p>
          {docs.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-2 text-xs" data-testid={`business-doc-${d.id}`}>
                  <span className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium">{DOC_LABEL[d.type] ?? d.type}</span>
                    <span className="text-muted-foreground">added {formatDate(d.uploadedAt)}</span>
                    <StatusBadge status={d.status} />
                    {d.status === 'REJECTED' && d.rejectionReason && <span className="text-destructive">{d.rejectionReason}</span>}
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2" aria-label={`View ${DOC_LABEL[d.type] ?? d.type}`} onClick={() => view(d)}><Eye className="mr-1 h-3.5 w-3.5" />View</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" aria-label={`Approve ${DOC_LABEL[d.type] ?? d.type}`} onClick={() => approveDoc.mutate(d.id)}>Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" aria-label={`Reject ${DOC_LABEL[d.type] ?? d.type}`} onClick={() => setReject({ kind: 'document', documentId: d.id, name: DOC_LABEL[d.type] ?? d.type })}>Reject</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <Dialog open={!!reject} onOpenChange={(o) => !o && setReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reject?.kind === 'document' ? `Reject ${reject.name}` : `Reject ${business.name}`}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">The host sees this reason and can fix it.</p>
          <Textarea aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReject(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim()}
              loading={rejectBusiness.isPending || rejectDoc.isPending}
              onClick={() => (reject?.kind === 'document' ? rejectDoc.mutate({ documentId: reject.documentId, why: reason.trim() }) : rejectBusiness.mutate(reason.trim()))}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
