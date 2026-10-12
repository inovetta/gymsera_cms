'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, Dumbbell, Eye, FileCheck, FileText, GitBranch, Globe, Lock, Package,
  RefreshCw, ShieldAlert, Star, Users,
} from 'lucide-react'
import { StatusBadge } from '@/components/features/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { adminApi, KycDocument } from '@/lib/api/admin'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import type { Tenant } from '@/types'

/** Owner, gym profile, KYC documents and onboarding progress. Mounted only while its tab is open (PERF-10). */
export function OverviewTab({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const owner = tenant.owner || tenant.user
  const [viewingKycDoc, setViewingKycDoc] = useState<KycDocument | null>(null)
  const [kycBlobUrl, setKycBlobUrl] = useState<string | null>(null)
  const [kycLoading, setKycLoading] = useState(false)

  const { data: kycDocsData } = useQuery({
    queryKey: ['admin-tenant-kyc-docs', tenantId],
    queryFn: () => adminApi.getTenantKycDocuments(tenantId),
    enabled: !!tenantId,
  })
  const kycDocs = kycDocsData?.data || []

  const handleViewKycDoc = async (doc: KycDocument) => {
    setViewingKycDoc(doc)
    setKycLoading(true)
    try {
      const blob = await adminApi.downloadKycDocumentBlob(doc.streamUrl)
      const objectUrl = URL.createObjectURL(blob)
      setKycBlobUrl(objectUrl)
    } catch (err: any) {
      toast({ title: 'Failed to load document', description: err.message || 'Access denied', variant: 'destructive' })
      setViewingKycDoc(null)
    } finally {
      setKycLoading(false)
    }
  }

  const handleCloseKycDoc = () => {
    if (kycBlobUrl) {
      URL.revokeObjectURL(kycBlobUrl)
      setKycBlobUrl(null)
    }
    setViewingKycDoc(null)
  }

  return (
    <>
    <div className="grid gap-6 sm:grid-cols-2">
      {owner && (
        <Card>
          <CardHeader><CardTitle className="text-base">Owner Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Full Name</span><span className="font-medium">{owner.fullName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{owner.email}</span></div>
              {owner.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{owner.phone}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Account Status</span><StatusBadge status={owner.status} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Verified</span><span className="font-medium">{owner.isVerified ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Member Since</span><span className="font-medium">{formatDate(owner.createdAt)}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Gym Profile</CardTitle></CardHeader>
        <CardContent>
          {tenant.gymName ? (
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Gym Name</span><span className="font-medium">{tenant.gymName}</span></div>
              {tenant.genderType && <div className="flex justify-between"><span className="text-muted-foreground">Gender Type</span><span className="font-medium capitalize">{tenant.genderType.replace('_', ' ')}</span></div>}
              {tenant.gymDescription && <div><span className="text-muted-foreground block mb-1">Description</span><p className="text-foreground leading-relaxed">{tenant.gymDescription}</p></div>}
              <div className="pt-2 border-t mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground flex items-center gap-1 text-xs font-semibold uppercase tracking-wider">
                    <FileCheck className="h-3.5 w-3.5" /> KYC Verification Documents ({kycDocs.length > 0 ? kycDocs.length : (tenant.kycDocumentsJson?.length || 0)})
                  </span>
                  {tenant.kycStatus && <StatusBadge status={tenant.kycStatus} />}
                </div>
                {kycDocs.length === 0 && (!tenant.kycDocumentsJson || tenant.kycDocumentsJson.length === 0) ? (
                  <p className="text-xs text-muted-foreground italic">No KYC documents uploaded.</p>
                ) : (
                  <div className="space-y-2">
                    {kycDocs.map((doc: KycDocument) => (
                      <div key={doc.documentId} className="flex items-center justify-between p-2 rounded-md bg-muted/40 border text-xs">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium truncate">{doc.originalName}</span>
                          {doc.size > 0 && <span className="text-muted-foreground shrink-0">({(doc.size / 1024).toFixed(0)} KB)</span>}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs flex items-center gap-1 shrink-0"
                          onClick={() => handleViewKycDoc(doc)}
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {tenant.gymListing && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Public Listing</span>
                    <div className="flex items-center gap-2"><StatusBadge status={tenant.gymListing.status} />{tenant.gymListing.isFeatured && <Badge className="text-xs">Featured</Badge>}</div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Rating</span>
                    <span className="font-medium">{(Number(tenant.gymListing.averageRating) || 0).toFixed(1)} ({tenant.gymListing.totalReviews || 0} reviews)</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Gym profile not submitted yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Subscription Package</CardTitle></CardHeader>
        <CardContent>
          {tenant.selectedPackage ? (
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Plan</span><span className="font-semibold text-base">{tenant.selectedPackage.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-medium">{formatCurrency(tenant.selectedPackage.price)} / {tenant.selectedPackage.billingCycle?.toLowerCase()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" /> Max Branches</span><span className="font-medium">{tenant.selectedPackage.maxBranches}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Max Members</span><span className="font-medium">{tenant.selectedPackage.maxMembers?.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Dumbbell className="h-3.5 w-3.5" /> Max Trainers</span><span className="font-medium">{tenant.selectedPackage.maxTrainers}</span></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No package selected yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Onboarding Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { step: 1, label: 'Business Registration', done: (tenant.onboardingStep ?? 0) >= 1 },
              { step: 2, label: 'Gym Profile & KYC Submitted', done: (tenant.onboardingStep ?? 0) >= 2 },
              { step: 3, label: 'Package Selected', done: (tenant.onboardingStep ?? 0) >= 3 },
            ].map(({ step, label, done }) => (
              <div key={step} className="flex items-center gap-3 text-sm">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {done ? '✓' : step}
                </div>
                <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>

  <Dialog open={!!viewingKycDoc} onOpenChange={(open) => { if (!open) handleCloseKycDoc() }}>
    <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5 text-primary" />
          <span>KYC Document: {viewingKycDoc?.originalName}</span>
          <Badge variant="outline" className="ml-2 text-xs uppercase">{viewingKycDoc?.documentType || 'Verification'}</Badge>
        </DialogTitle>
      </DialogHeader>

      {/* Audit Alert Banner */}
      <div className="flex items-center gap-2 rounded bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-300">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span><strong>Audited Access:</strong> Your viewing of this identity verification document has been immutably logged with your admin account ({user?.email || 'admin'}) and IP address.</span>
      </div>

      {/* Document Preview Container with Visual Watermark Overlay (Decision R-27) */}
      <div className="relative mt-2 flex-1 min-h-[450px] max-h-[60vh] overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center select-none">
        {/* Visual Watermark Overlay */}
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-wrap items-center justify-center gap-12 overflow-hidden opacity-15 select-none p-4">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="-rotate-45 transform whitespace-nowrap text-xs font-bold tracking-widest text-red-600 dark:text-red-400">
              CONFIDENTIAL • {user?.email || 'PLATFORM_ADMIN'} • {new Date().toLocaleDateString()} • GYMSERA AUDITED ACCESS
            </div>
          ))}
        </div>

        {kycLoading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground py-16">
            <RefreshCw className="h-8 w-8 animate-spin" />
            <p className="text-sm">Fetching and decrypting document stream...</p>
          </div>
        ) : kycBlobUrl ? (
          viewingKycDoc?.mimetype === 'application/pdf' ? (
            <iframe src={kycBlobUrl} className="w-full h-full min-h-[500px] border-none" title="KYC PDF Viewer" />
          ) : (
            <img src={kycBlobUrl} alt="KYC Document" className="max-h-[500px] max-w-full object-contain mx-auto" />
          )
        ) : null}
      </div>

      <DialogFooter className="mt-4 flex items-center justify-between sm:justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" /> Private Encrypted Storage (AES-256)
        </div>
        <Button variant="outline" size="sm" onClick={handleCloseKycDoc}>
          Close Preview
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
    </>
  )
}
