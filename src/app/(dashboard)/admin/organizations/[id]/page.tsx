'use client'

import { organizationDisplayName, firstBusinessSubName } from '@/lib/organizations/organization-name'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Mail, Phone, MapPin, CheckCircle, XCircle, ShieldOff, Globe, RefreshCw,
  CreditCard, FileText, GitBranch, Camera, ImageIcon,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { StatusBadge } from '@/components/features/status-badge'
import { ApproveOrganizationDialog } from '@/components/features/approve-organization-dialog'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { ErrorState } from '@/components/features/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminApi, AdminOrganizationSubscription } from '@/lib/api/admin'
import { formatDate, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { BusinessesTab } from '@/components/features/admin-organization/businesses-tab'
import { FirstBusinessApproval } from '@/components/features/admin-organization/first-business-approval'
import { ProvisioningStatus } from '@/components/features/provisioning-status'
import { OverviewTab } from '@/components/features/admin-organization/overview-tab'
import { SubscriptionTab } from '@/components/features/admin-organization/subscription-tab'
import { CapacityTab } from '@/components/features/admin-organization/capacity-tab'
import { InvoicesTab } from '@/components/features/admin-organization/invoices-tab'
import { BranchesTab } from '@/components/features/admin-organization/branches-tab'
import { MembersTab } from '@/components/features/admin-organization/members-tab'
import { PlansTab } from '@/components/features/admin-organization/plans-tab'

/**
 * Organization detail (UX-17 / PERF-10). This page owns the organization record, the header and the lifecycle
 * actions (approve, reject, suspend, reactivate). Each tab is its own component that mounts only
 * while it is open and fetches only its own data. The one exception is the subscription list the
 * header badge needs; the Subscription tab shares its query key and so reads the same cache.
 */
export default function OrganizationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const organizationId = params.id as string
  // ?business=<id> from the review queue opens that business.
  const searchParams = useSearchParams()
  const queueBusinessId = searchParams?.get('business') ?? null

  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const [approveDialog, setApproveDialog] = useState(false)
  // One Idempotency-Key per approve/resume click (FLOW-02): a repeated request
  // replays the first answer instead of starting a second provisioning.
  const approveKeyRef = useRef<string>('')
  const openApproveDialog = () => {
    approveKeyRef.current = crypto.randomUUID()
    approveMutation.reset()
    setApproveDialog(true)
  }
  const [rejectDialog, setRejectDialog] = useState(false)
  const [suspendDialog, setSuspendDialog] = useState(false)
  const [reactivateDialog, setReactivateDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [suspendReason, setSuspendReason] = useState('')

  const { data, isLoading, error: tenantError, refetch: refetchTenant } = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => adminApi.getOrganization(organizationId),
    // While another run is provisioning, check its step every 10 s.
    refetchInterval: (query) => (query.state.data?.data?.organization?.provisioning?.inProgress ? 10_000 : false),
  })

  // For the header's "Subscribed until" badge. Same key as the Subscription tab.
  const { data: subscriptionsData } = useQuery({
    queryKey: ['admin-organization-subscriptions', organizationId],
    queryFn: () => adminApi.getSubscriptions(organizationId),
  })

  const organization = data?.data?.organization

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['organization', organizationId] })
    queryClient.invalidateQueries({ queryKey: ['organizations'] })
  }

  const approveMutation = useMutation({
    // R-84: only reachable from the approve dialog, after "I checked the photos".
    mutationFn: (idempotencyKey: string) => adminApi.approveOrganization(organizationId, idempotencyKey, { photosChecked: true }),
    onSuccess: (res) => {
      invalidate()
      setApproveDialog(false)
      const p = res?.data?.provisioning
      if (p?.inProgress) toast({ title: `Provisioning is already in progress (step ${p.step}/${p.totalSteps})` })
      else toast({ title: 'Organization approved — database provisioned' })
    },
    // Shown in the approve dialog (approvalErrorMessage); the page shows the step it stopped at, with Resume.
    onError: () => invalidate(),
  })
  // Resume is an approve call too, so it goes through the same photo check (R-84).
  const resumeProvisioning = openApproveDialog

  const rejectMutation = useMutation({
    mutationFn: () => adminApi.rejectOrganization(organizationId, rejectReason),
    onSuccess: () => { invalidate(); setRejectDialog(false); setRejectReason(''); toast({ title: 'Application rejected' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to reject application', variant: 'destructive' }),
  })

  const suspendMutation = useMutation({
    mutationFn: () => adminApi.suspendOrganization(organizationId, suspendReason),
    onSuccess: () => { invalidate(); setSuspendDialog(false); setSuspendReason(''); toast({ title: 'Organization suspended' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to suspend organization', variant: 'destructive' }),
  })

  const reactivateMutation = useMutation({
    mutationFn: () => adminApi.reactivateOrganization(organizationId),
    onSuccess: () => { invalidate(); setReactivateDialog(false); toast({ title: 'Organization reactivated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to reactivate organization', variant: 'destructive' }),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadFirstBusinessLogo(organizationId, file),
    onSuccess: () => { invalidate(); toast({ title: 'Logo updated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to upload logo', variant: 'destructive' }),
  })

  const uploadCoverMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadFirstBusinessCover(organizationId, file),
    onSuccess: () => { invalidate(); toast({ title: 'Cover image updated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to upload cover', variant: 'destructive' }),
  })

  if (isLoading) {
    return (
      <>
        <Header title="Organization Detail" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-48 rounded-lg" />
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      </>
    )
  }

  if (tenantError) {
    return (
      <>
        <Header title="Organization Detail" />
        <div className="p-6">
          <ErrorState error={tenantError} what="this organization" onRetry={() => refetchTenant()} />
        </div>
      </>
    )
  }

  if (!organization) return null

  const canApprove = ['PENDING_REVIEW', 'UNDER_REVIEW', 'REJECTED', 'APPROVED'].includes(organization.status)
  const canReject = ['PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'SUSPENDED'].includes(organization.status)
  const canSuspend = organization.status === 'ACTIVE'
  const canReactivate = organization.status === 'SUSPENDED'

  const activeSub = subscriptionsData?.data?.subscriptions?.find((s: AdminOrganizationSubscription) => s.status === 'ACTIVE')

  return (
    <>
      <Header title={organizationDisplayName(organization)} />
      <div className="p-6 animate-fade-in space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Organizations
        </Button>

        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            {/* Cover image strip */}
            {organization.coverImageUrl ? (
              <div className="relative h-36 -mx-6 -mt-6 mb-6 rounded-t-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={organization.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                <button
                  onClick={() => coverInputRef.current?.click()}
                  className="absolute bottom-2 right-2 h-8 w-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  title="Update cover image"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                className="relative h-20 -mx-6 -mt-6 mb-6 rounded-t-lg bg-gradient-to-r from-primary/10 to-primary/5 flex items-center justify-center cursor-pointer hover:from-primary/20 hover:to-primary/10 transition-colors border-b border-dashed border-primary/20"
                onClick={() => coverInputRef.current?.click()}
              >
                <div className="flex items-center gap-2 text-primary/60">
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-sm font-medium">Upload cover image</span>
                </div>
              </div>
            )}

            <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCoverMutation.mutate(f); e.target.value = '' }} />
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogoMutation.mutate(f); e.target.value = '' }} />

            <div className="flex flex-col sm:flex-row items-start gap-6">
              {/* Logo */}
              <div className="relative shrink-0">
                <div className="h-20 w-20 rounded-xl border-2 border-border bg-muted flex items-center justify-center overflow-hidden">
                  {organization.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={organization.logoUrl} alt={organization.organizationName} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{getInitials(organizationDisplayName(organization))}</span>
                  )}
                </div>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 h-7 w-7 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
                  title="Update logo"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h2 className="text-2xl font-bold">{organizationDisplayName(organization)}</h2>
                  <StatusBadge status={organization.status} />
                  {organization.kycStatus && (
                    <Badge variant="outline" className="text-xs capitalize">
                      KYC: {organization.kycStatus.replace('_', ' ')}
                    </Badge>
                  )}
                  {activeSub && (
                    <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                      Subscribed until {formatDate(activeSub.endDate)}
                    </Badge>
                  )}
                </div>
                {firstBusinessSubName(organization) && (
                  <p className="-mt-2 mb-3 text-sm text-muted-foreground" data-testid="first-business-name">
                    First business: {firstBusinessSubName(organization)}
                  </p>
                )}
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{organization.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{organization.phone || '—'}</span>
                  </div>
                  {organization.city && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{organization.city.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span>Applied {formatDate(organization.createdAt)}</span>
                  </div>
                </div>
                {organization.rejectionReason && (
                  <div className="mt-3 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
                    <strong>Rejection reason:</strong> {organization.rejectionReason}
                  </div>
                )}
                <ProvisioningStatus status={organization.status} provisioning={organization.provisioning}
                  onResume={resumeProvisioning} resuming={approveMutation.isPending} />
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {/* An APPROVED organization resumes from the provisioning panel; this
                    button stays for one only if the API sent no provisioning state. */}
                {canApprove && (organization.status !== 'APPROVED' || !organization.provisioning) && (
                  <Button onClick={openApproveDialog} variant="success">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {organization.status === 'REJECTED' ? 'Re-approve' : organization.status === 'APPROVED' ? 'Resume provisioning' : 'Approve'}
                  </Button>
                )}
                {canReactivate && (
                  <Button onClick={() => setReactivateDialog(true)} className="bg-green-600 hover:bg-green-700 text-white">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reactivate
                  </Button>
                )}
                {canReject && (
                  <Button onClick={() => setRejectDialog(true)} variant="destructive">
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                )}
                {canSuspend && (
                  <Button onClick={() => setSuspendDialog(true)} variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
                    <ShieldOff className="h-4 w-4 mr-2" />
                    Suspend
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The organization and its first business are approved on one page (enterprise §5, D10). */}
        <FirstBusinessApproval organization={organization} organizationId={organizationId} />

        {/* Tabs: each one mounts, and fetches, only while open */}
        <Tabs defaultValue={queueBusinessId ? 'business' : 'overview'}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="business">
              <Globe className="h-3.5 w-3.5 mr-1" />
              Businesses
              <Badge variant="secondary" className="ml-1.5 text-xs">{organization.businesses?.length ?? 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="subscription">
              <CreditCard className="h-3.5 w-3.5 mr-1" />
              Subscription
            </TabsTrigger>
            <TabsTrigger value="capacity">
              <GitBranch className="h-3.5 w-3.5 mr-1" />
              Capacity
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-3.5 w-3.5 mr-1" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab organization={organization} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="business" className="mt-6">
            <BusinessesTab organization={organization} organizationId={organizationId} initialBusinessId={queueBusinessId} />
          </TabsContent>
          <TabsContent value="subscription" className="mt-6">
            <SubscriptionTab organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="capacity" className="mt-6">
            <CapacityTab organization={organization} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="invoices" className="mt-6">
            <InvoicesTab organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="branches" className="mt-6">
            <BranchesTab organization={organization} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="members" className="mt-6">
            <MembersTab organization={organization} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="plans" className="mt-6">
            <PlansTab organization={organization} organizationId={organizationId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Approve / Re-approve / Resume, with the photo check (R-84, NEW-158) */}
      <ApproveOrganizationDialog open={approveDialog} onOpenChange={setApproveDialog} organization={organization} organizationId={organizationId}
        loading={approveMutation.isPending} error={approveMutation.error}
        onApprove={() => approveMutation.mutate(approveKeyRef.current)} />


      {/* Reactivate */}
      <ConfirmDialog open={reactivateDialog} onOpenChange={setReactivateDialog}
        title="Reactivate Organization" description={`Reactivate "${organization.organizationName}"? They will regain full platform access immediately.`}
        confirmLabel="Reactivate" variant="default" onConfirm={() => reactivateMutation.mutate()} loading={reactivateMutation.isPending} />


      {/* Reject */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Application</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Provide a reason for rejection — the applicant will be notified by email.</p>
          <Textarea placeholder="E.g. KYC documents are incomplete." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} loading={rejectMutation.isPending} disabled={!rejectReason.trim()}>Reject Application</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Suspend */}
      <Dialog open={suspendDialog} onOpenChange={setSuspendDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Suspend Organization</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Suspending will immediately revoke platform access for this organization and all their staff.</p>
          <Textarea placeholder="E.g. Repeated violations of platform terms of service." value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => suspendMutation.mutate()} loading={suspendMutation.isPending} disabled={!suspendReason.trim()}>Suspend Organization</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}
