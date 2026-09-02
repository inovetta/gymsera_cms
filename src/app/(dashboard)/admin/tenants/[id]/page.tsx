'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, Mail, Phone, MapPin, CheckCircle, XCircle, ShieldOff,
  Package, Star, Users, GitBranch, Dumbbell, FileCheck, Globe, RefreshCw,
  Clock, ToggleLeft, ToggleRight, CreditCard, FileText, Plus, Send,
  CheckCheck, AlertCircle, Camera, ImageIcon, BanknoteIcon, History,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { StatusBadge } from '@/components/features/status-badge'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi, TenantSubscription, PlatformInvoice, AssignSubscriptionPayload, CreateInvoicePayload, TenantBranch, CreateTenantBranchPayload, UpdateTenantBranchPayload } from '@/lib/api/admin'
import { packagesApi } from '@/lib/api/packages'
import { citiesApi } from '@/lib/api/cities'
import { formatDate, getInitials, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { GymListingTab } from '@/components/features/gym-listing-tab'
import { BranchFormDialog } from '@/components/features/branch-form-dialog'

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

const SUB_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

export default function TenantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const tenantId = params.id as string

  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const [approveDialog, setApproveDialog] = useState(false)
  const [rejectDialog, setRejectDialog] = useState(false)
  const [suspendDialog, setSuspendDialog] = useState(false)
  const [reactivateDialog, setReactivateDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [suspendReason, setSuspendReason] = useState('')
  const [deactivateBranchDialog, setDeactivateBranchDialog] = useState<{ open: boolean; branchId: string }>({ open: false, branchId: '' })
  const [deactivateBranchReason, setDeactivateBranchReason] = useState('')
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; branchId: string; branchName: string }>({ open: false, branchId: '', branchName: '' })
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['admin-branch-visibility-history', historyDialog.branchId],
    queryFn: () => adminApi.getBranchVisibilityHistory(historyDialog.branchId),
    enabled: historyDialog.open && !!historyDialog.branchId,
  })

  // Subscription dialog
  const [assignSubDialog, setAssignSubDialog] = useState(false)
  const [subForm, setSubForm] = useState<AssignSubscriptionPayload>({ packageId: '', billingCycle: 'MONTHLY', createInvoice: true, autoRenew: true })

  // Branch dialogs
  const [branchDialog, setBranchDialog] = useState<{ open: boolean; mode: 'create' | 'edit'; branch?: TenantBranch }>({ open: false, mode: 'create' })

  // Invoice dialogs
  const [createInvoiceDialog, setCreateInvoiceDialog] = useState(false)
  const [updateStatusDialog, setUpdateStatusDialog] = useState<{ open: boolean; invoice: PlatformInvoice | null }>({ open: false, invoice: null })
  const [invoiceForm, setInvoiceForm] = useState<CreateInvoicePayload>({ subtotal: 0, description: '', dueDate: '', status: 'ISSUED' })
  const [newStatus, setNewStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => adminApi.getTenant(tenantId),
  })

  const { data: branchesData, isLoading: branchesLoading } = useQuery({
    queryKey: ['admin-tenant-branches', tenantId],
    queryFn: () => adminApi.getTenantBranches(tenantId),
    enabled: data?.data?.tenant?.status === 'ACTIVE',
  })

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['admin-tenant-members', tenantId],
    queryFn: () => adminApi.getTenantMembers(tenantId),
    enabled: data?.data?.tenant?.status === 'ACTIVE',
  })

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['admin-tenant-plans', tenantId],
    queryFn: () => adminApi.getTenantMembershipPlans(tenantId),
    enabled: data?.data?.tenant?.status === 'ACTIVE',
  })

  const { data: subscriptionsData, isLoading: subsLoading } = useQuery({
    queryKey: ['admin-tenant-subscriptions', tenantId],
    queryFn: () => adminApi.getTenantSubscriptions(tenantId),
  })

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['admin-tenant-invoices', tenantId],
    queryFn: () => adminApi.getTenantInvoices(tenantId),
  })

  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: () => packagesApi.getPackages(),
  })

  const { data: citiesData } = useQuery({
    queryKey: ['cities'],
    queryFn: () => citiesApi.getCities(),
  })

  const tenant = data?.data?.tenant
  const packages = Array.isArray(packagesData?.data) ? (packagesData.data as any[]) : []
  const cities = Array.isArray(citiesData?.data) ? (citiesData.data as any[]) : []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] })
    queryClient.invalidateQueries({ queryKey: ['tenants'] })
  }

  const approveMutation = useMutation({
    mutationFn: () => adminApi.approveTenant(tenantId),
    onSuccess: () => { invalidate(); setApproveDialog(false); toast({ title: 'Tenant approved — database provisioned' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to approve tenant', variant: 'destructive' }),
  })

  const rejectMutation = useMutation({
    mutationFn: () => adminApi.rejectTenant(tenantId, rejectReason),
    onSuccess: () => { invalidate(); setRejectDialog(false); setRejectReason(''); toast({ title: 'Application rejected' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to reject application', variant: 'destructive' }),
  })

  const suspendMutation = useMutation({
    mutationFn: () => adminApi.suspendTenant(tenantId, suspendReason),
    onSuccess: () => { invalidate(); setSuspendDialog(false); setSuspendReason(''); toast({ title: 'Tenant suspended' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to suspend tenant', variant: 'destructive' }),
  })

  const reactivateMutation = useMutation({
    mutationFn: () => adminApi.reactivateTenant(tenantId),
    onSuccess: () => { invalidate(); setReactivateDialog(false); toast({ title: 'Tenant reactivated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to reactivate tenant', variant: 'destructive' }),
  })

  const branchStatusMutation = useMutation({
    mutationFn: ({ branchId, status }: { branchId: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      adminApi.updateTenantBranchStatus(tenantId, branchId, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] }); toast({ title: 'Branch status updated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update branch status', variant: 'destructive' }),
  })

  const travelerVisibilityMutation = useMutation({
    mutationFn: ({ branchId, status, reason }: { branchId: string; status: 'active' | 'deactivated'; reason?: string }) =>
      adminApi.updateBranchTravelerVisibility(branchId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] })
      setDeactivateBranchDialog({ open: false, branchId: '' })
      setDeactivateBranchReason('')
      toast({ title: 'Branch traveler visibility updated' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update visibility', variant: 'destructive' }),
  })

  const createBranchMutation = useMutation({
    mutationFn: (payload: CreateTenantBranchPayload) => adminApi.createTenantBranch(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] })
      setBranchDialog({ open: false, mode: 'create' })
      toast({ title: 'Branch created' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to create branch', variant: 'destructive' }),
  })

  const updateBranchMutation = useMutation({
    mutationFn: ({ branchId, payload }: { branchId: string; payload: UpdateTenantBranchPayload }) =>
      adminApi.updateTenantBranch(tenantId, branchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-branches', tenantId] })
      setBranchDialog({ open: false, mode: 'create' })
      toast({ title: 'Branch updated' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update branch', variant: 'destructive' }),
  })

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadTenantLogo(tenantId, file),
    onSuccess: () => { invalidate(); toast({ title: 'Logo updated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to upload logo', variant: 'destructive' }),
  })

  const uploadCoverMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadTenantCover(tenantId, file),
    onSuccess: () => { invalidate(); toast({ title: 'Cover image updated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to upload cover', variant: 'destructive' }),
  })

  const assignSubMutation = useMutation({
    mutationFn: (payload: AssignSubscriptionPayload) => adminApi.assignTenantSubscription(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-subscriptions', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-invoices', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] })
      setAssignSubDialog(false)
      toast({ title: 'Subscription assigned successfully' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to assign subscription', variant: 'destructive' }),
  })

  const revokeSubMutation = useMutation({
    mutationFn: (subId: string) => adminApi.revokeTenantSubscription(tenantId, subId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-tenant-subscriptions', tenantId] }); toast({ title: 'Subscription revoked' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to revoke subscription', variant: 'destructive' }),
  })

  const createInvoiceMutation = useMutation({
    mutationFn: (payload: CreateInvoicePayload) => adminApi.createTenantInvoice(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-invoices', tenantId] })
      setCreateInvoiceDialog(false)
      setInvoiceForm({ subtotal: 0, description: '', dueDate: '', status: 'ISSUED' })
      toast({ title: 'Invoice created' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to create invoice', variant: 'destructive' }),
  })

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, payload }: { invoiceId: string; payload: any }) =>
      adminApi.updateTenantInvoice(tenantId, invoiceId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-invoices', tenantId] })
      setUpdateStatusDialog({ open: false, invoice: null })
      toast({ title: 'Invoice status updated' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to update invoice', variant: 'destructive' }),
  })

  const sendReminderMutation = useMutation({
    mutationFn: (invoiceId: string) => adminApi.sendInvoiceReminder(tenantId, invoiceId),
    onSuccess: () => toast({ title: 'Payment reminder sent' }),
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to send reminder', variant: 'destructive' }),
  })

  const sendConfirmationMutation = useMutation({
    mutationFn: (invoiceId: string) => adminApi.sendInvoiceConfirmation(tenantId, invoiceId),
    onSuccess: () => toast({ title: 'Payment confirmation sent' }),
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to send confirmation', variant: 'destructive' }),
  })

  if (isLoading) {
    return (
      <>
        <Header title="Tenant Detail" />
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

  if (!tenant) return null

  const canApprove = ['PENDING_REVIEW', 'UNDER_REVIEW', 'REJECTED', 'APPROVED'].includes(tenant.status)
  const canReject = ['PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'SUSPENDED'].includes(tenant.status)
  const canSuspend = tenant.status === 'ACTIVE'
  const canReactivate = tenant.status === 'SUSPENDED'
  const owner = tenant.owner || tenant.user

  const activeSub = subscriptionsData?.data?.subscriptions?.find((s: TenantSubscription) => s.status === 'ACTIVE')
  const invoices: PlatformInvoice[] = invoicesData?.data?.invoices ?? []

  return (
    <>
      <Header title={tenant.businessName} />
      <div className="p-6 animate-fade-in space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tenants
        </Button>

        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            {/* Cover image strip */}
            {tenant.coverImageUrl ? (
              <div className="relative h-36 -mx-6 -mt-6 mb-6 rounded-t-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tenant.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
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
                  {tenant.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tenant.logoUrl} alt={tenant.businessName} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{getInitials(tenant.businessName)}</span>
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
                  <h2 className="text-2xl font-bold">{tenant.businessName}</h2>
                  <StatusBadge status={tenant.status} />
                  {tenant.kycStatus && (
                    <Badge variant="outline" className="text-xs capitalize">
                      KYC: {tenant.kycStatus.replace('_', ' ')}
                    </Badge>
                  )}
                  {activeSub && (
                    <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                      Subscribed until {formatDate(activeSub.endDate)}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{tenant.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{tenant.phone || '—'}</span>
                  </div>
                  {tenant.city && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{tenant.city.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span>Applied {formatDate(tenant.createdAt)}</span>
                  </div>
                </div>
                {tenant.rejectionReason && (
                  <div className="mt-3 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
                    <strong>Rejection reason:</strong> {tenant.rejectionReason}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {canApprove && (
                  <Button onClick={() => setApproveDialog(true)} variant="success">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {tenant.status === 'REJECTED' ? 'Re-approve' : tenant.status === 'APPROVED' ? 'Re-provision' : 'Approve'}
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

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="gym-listing">
              <Globe className="h-3.5 w-3.5 mr-1" />
              Gym Listing
              {tenant?.gymListing && <Badge variant="secondary" className="ml-1.5 text-xs bg-green-100 text-green-700">Live</Badge>}
            </TabsTrigger>
            <TabsTrigger value="subscription">
              <CreditCard className="h-3.5 w-3.5 mr-1" />
              Subscription
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-3.5 w-3.5 mr-1" />
              Invoices
              {invoices.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{invoices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="branches">
              Branches
              {branchesData?.data?.branches?.length != null && (
                <Badge variant="secondary" className="ml-2 text-xs">{branchesData.data.branches.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="members">
              Members
              {membersData?.data?.members?.length != null && (
                <Badge variant="secondary" className="ml-2 text-xs">{membersData.data.members.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="mt-6">
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
                      {tenant.kycDocumentsJson && tenant.kycDocumentsJson.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><FileCheck className="h-3.5 w-3.5" /> KYC Docs</span>
                          <span className="font-medium">{tenant.kycDocumentsJson.length} document{tenant.kycDocumentsJson.length !== 1 ? 's' : ''}</span>
                        </div>
                      )}
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
          </TabsContent>

          {/* ── Gym Listing ── */}
          <TabsContent value="gym-listing" className="mt-6">
            <GymListingTab
              tenantId={tenantId}
              hasListing={!!tenant?.gymListing}
              tenantName={tenant?.businessName ?? ''}
            />
          </TabsContent>

          {/* ── Subscription ── */}
          <TabsContent value="subscription" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Subscription History</h3>
                <Button onClick={() => setAssignSubDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Assign Subscription
                </Button>
              </div>

              {subsLoading ? (
                <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : !subscriptionsData?.data?.subscriptions?.length ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No subscriptions found. Assign a subscription to get started.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {subscriptionsData.data.subscriptions.map((sub: TenantSubscription) => {
                    const isActive = sub.status === 'ACTIVE'
                    const daysLeft = isActive ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000) : null
                    const isExpired = daysLeft !== null && daysLeft < 0
                    const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7

                    return (
                      <Card key={sub.id} className={isActive ? 'border-green-200 bg-green-50/30' : ''}>
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold">{sub.package?.name ?? 'Unknown Package'}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SUB_STATUS_COLORS[sub.status] ?? ''}`}>{sub.status}</span>
                                {isExpired && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Expired</span>}
                                {isExpiringSoon && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">Expiring soon!</span>}
                              </div>
                              <div className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-3">
                                <span>Billing: {sub.billingCycle}</span>
                                <span>Amount: {formatCurrency(sub.amount)}</span>
                                <span>Auto-renew: {sub.autoRenew ? 'Yes' : 'No'}</span>
                                <span>Start: {formatDate(sub.startDate)}</span>
                                <span className={isExpiringSoon ? 'text-yellow-600 font-medium' : isExpired ? 'text-red-600 font-medium' : ''}>Expires: {formatDate(sub.endDate)}</span>
                                {daysLeft !== null && !isExpired && (
                                  <span className={isExpiringSoon ? 'text-yellow-600 font-semibold' : 'text-green-600'}>
                                    {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
                                  </span>
                                )}
                                {isExpired && (
                                  <span className="text-red-600 font-semibold">{Math.abs(daysLeft!)} day{Math.abs(daysLeft!) !== 1 ? 's' : ''} overdue</span>
                                )}
                              </div>
                              <div className="mt-1.5">
                                <span className={`text-xs font-medium ${sub.paymentStatus === 'PAID' ? 'text-green-600' : sub.paymentStatus === 'FAILED' ? 'text-red-600' : 'text-yellow-600'}`}>
                                  Payment: {sub.paymentStatus}
                                </span>
                              </div>
                            </div>
                            {isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-destructive text-destructive hover:bg-destructive hover:text-white shrink-0"
                                onClick={() => revokeSubMutation.mutate(sub.id)}
                                loading={revokeSubMutation.isPending}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Invoices ── */}
          <TabsContent value="invoices" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Platform Invoices</h3>
                <Button onClick={() => setCreateInvoiceDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invoice
                </Button>
              </div>

              {invoicesLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : !invoices.length ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No invoices yet. Create the first invoice for this tenant.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv: PlatformInvoice) => (
                    <Card key={inv.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-mono text-sm font-semibold">{inv.invoiceNo}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INVOICE_STATUS_COLORS[inv.status] ?? ''}`}>{inv.status}</span>
                            </div>
                            {inv.description && <p className="text-sm text-muted-foreground mb-1.5">{inv.description}</p>}
                            {inv.subscription?.package && (
                              <p className="text-xs text-muted-foreground mb-1.5">Package: {inv.subscription.package.name}</p>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>Amount: <strong className="text-foreground">{formatCurrency(inv.totalAmount)}</strong></span>
                              {inv.dueDate && <span>Due: {formatDate(inv.dueDate)}</span>}
                              {inv.paidAt && <span className="text-green-600">Paid: {formatDate(inv.paidAt)}</span>}
                              <span>Created: {formatDate(inv.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => { setUpdateStatusDialog({ open: true, invoice: inv }); setNewStatus(inv.status) }}>
                              Update Status
                            </Button>
                            {['ISSUED', 'OVERDUE'].includes(inv.status) && (
                              <Button size="sm" variant="outline" onClick={() => sendReminderMutation.mutate(inv.id)} loading={sendReminderMutation.isPending}>
                                <Send className="h-3.5 w-3.5 mr-1" />
                                Send Reminder
                              </Button>
                            )}
                            {inv.status === 'PAID' && (
                              <Button size="sm" variant="outline" onClick={() => sendConfirmationMutation.mutate(inv.id)} loading={sendConfirmationMutation.isPending}>
                                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                                Send Receipt
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Branches ── */}
          <TabsContent value="branches" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><GitBranch className="h-4 w-4" /> Gym Branches</h3>
                {tenant.status === 'ACTIVE' && (
                  <Button size="sm" onClick={() => setBranchDialog({ open: true, mode: 'create' })}>
                    <Plus className="h-4 w-4 mr-2" /> Add Branch
                  </Button>
                )}
              </div>

              {tenant.status !== 'ACTIVE' ? (
                <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Branch data is only available for active tenants.</CardContent></Card>
              ) : branchesLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : !branchesData?.data?.branches?.length ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <GitBranch className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No branches yet.</p>
                    <Button size="sm" className="mt-4" onClick={() => setBranchDialog({ open: true, mode: 'create' })}>
                      <Plus className="h-4 w-4 mr-2" /> Add First Branch
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {branchesData.data.branches.map((branch) => (
                    <Card key={branch.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-xs font-bold text-primary">{branch.branchName.charAt(0)}</span>
                          </div>
                           <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-semibold">{branch.branchName}</p>
                              <StatusBadge status={branch.status} />
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                (branch.travelerVisibilityStatus || 'pending') === 'active'
                                  ? 'bg-green-100 text-green-800 border border-green-200'
                                  : (branch.travelerVisibilityStatus || 'pending') === 'deactivated'
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                              }`}>
                                Traveler: {(branch.travelerVisibilityStatus || 'pending').toUpperCase()}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1.5 text-[10px] text-muted-foreground flex items-center gap-0.5 hover:text-primary hover:bg-muted"
                                onClick={() => setHistoryDialog({ open: true, branchId: branch.id, branchName: branch.branchName })}
                              >
                                <History className="h-3 w-3" /> History
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">{branch.address || '—'}</p>
                            {(branch.openingTime || branch.closingTime) && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3" />{branch.openingTime} – {branch.closingTime}
                              </p>
                            )}
                            {branch.facilitiesJson && branch.facilitiesJson.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {branch.facilitiesJson.slice(0, 5).map((f) => <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>)}
                                {branch.facilitiesJson.length > 5 && <Badge variant="secondary" className="text-xs">+{branch.facilitiesJson.length - 5}</Badge>}
                              </div>
                            )}
                            {(branch.travelerVisibilityStatus || 'pending') === 'deactivated' && branch.deactivationReason && (
                              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-2 max-w-md">
                                <strong>Deactivation Reason:</strong> {branch.deactivationReason}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => setBranchDialog({ open: true, mode: 'edit', branch })}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => branchStatusMutation.mutate({ branchId: branch.id, status: branch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })} disabled={branchStatusMutation.isPending}>
                              {branch.status === 'ACTIVE' ? <><ToggleRight className="h-4 w-4 mr-1 text-green-600" />Disable</> : <><ToggleLeft className="h-4 w-4 mr-1 text-muted-foreground" />Enable</>}
                            </Button>
                            {(branch.travelerVisibilityStatus || 'pending') !== 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-600 text-green-600 hover:bg-green-50 text-xs py-1 h-8"
                                onClick={() => travelerVisibilityMutation.mutate({ branchId: branch.id, status: 'active' })}
                                disabled={travelerVisibilityMutation.isPending}
                              >
                                Activate Traveler
                              </Button>
                            )}
                            {(branch.travelerVisibilityStatus || 'pending') !== 'deactivated' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-600 text-red-600 hover:bg-red-50 text-xs py-1 h-8"
                                onClick={() => setDeactivateBranchDialog({ open: true, branchId: branch.id })}
                                disabled={travelerVisibilityMutation.isPending}
                              >
                                Deactivate Traveler
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <BranchFormDialog
              open={branchDialog.open}
              onOpenChange={(o) => !o && setBranchDialog((p) => ({ ...p, open: false }))}
              mode={branchDialog.mode}
              branch={branchDialog.branch}
              cities={cities}
              onSubmit={(payload) => {
                if (branchDialog.mode === 'create') {
                  createBranchMutation.mutate(payload as CreateTenantBranchPayload)
                } else if (branchDialog.branch) {
                  updateBranchMutation.mutate({ branchId: branchDialog.branch.id, payload: payload as UpdateTenantBranchPayload })
                }
              }}
              loading={createBranchMutation.isPending || updateBranchMutation.isPending}
            />
          </TabsContent>

          {/* ── Members ── */}
          <TabsContent value="members" className="mt-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Member Subscriptions</CardTitle></CardHeader>
              <CardContent>
                {tenant.status !== 'ACTIVE' ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Member data is only available for active tenants.</p>
                ) : membersLoading ? (
                  <div className="space-y-4">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-1.5 flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div><Skeleton className="h-6 w-16 rounded-full" /><Skeleton className="h-4 w-24" /></div>)}</div>
                ) : !membersData?.data?.members?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No members found.</p>
                ) : (
                  <div className="space-y-4">
                    {membersData.data.members.map((member) => (
                      <div key={member.id} className="flex items-center gap-4 p-3 rounded-lg border">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">{getInitials(member.user?.fullName ?? '?')}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.user?.fullName ?? 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.user?.email ?? member.userId}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{member.plan?.name ?? '—'} · {member.branch?.branchName ?? '—'}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge status={member.status} />
                          <span className="text-xs text-muted-foreground">{formatDate(member.startDate)} – {formatDate(member.endDate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Plans ── */}
          <TabsContent value="plans" className="mt-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Dumbbell className="h-4 w-4" /> Membership Plans</CardTitle></CardHeader>
              <CardContent>
                {tenant.status !== 'ACTIVE' ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Plan data is only available for active tenants.</p>
                ) : plansLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4"><div className="space-y-1.5 flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div><Skeleton className="h-6 w-16 rounded-full" /></div>)}</div>
                ) : !plansData?.data?.plans?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No membership plans found.</p>
                ) : (
                  <div className="space-y-3">
                    {plansData.data.plans.map((plan) => (
                      <div key={plan.id} className="flex items-center gap-4 p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{plan.name}</p>
                            <StatusBadge status={plan.status} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {plan.branch?.branchName ?? 'Gym-wide'} · {plan.durationValue} {plan.durationType.toLowerCase()}
                            {plan.isTrial ? ' · Trial' : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold">{formatCurrency(plan.price)}</p>
                          {plan.freezeLimitDays > 0 && <p className="text-xs text-muted-foreground">Freeze: {plan.freezeLimitDays}d</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Approve */}
      <ConfirmDialog open={approveDialog} onOpenChange={setApproveDialog}
        title={tenant.status === 'REJECTED' ? 'Re-approve Tenant' : tenant.status === 'APPROVED' ? 'Re-provision Tenant' : 'Approve Tenant'}
        description={
          tenant.status === 'REJECTED' ? `Re-approve "${tenant.businessName}"? This will override the previous rejection and queue database provisioning.`
          : tenant.status === 'APPROVED' ? `Re-queue provisioning for "${tenant.businessName}"? This re-runs database setup which may have failed previously.`
          : `Approve "${tenant.businessName}"? They will gain full platform access once provisioning completes.`
        }
        confirmLabel={tenant.status === 'REJECTED' ? 'Re-approve' : tenant.status === 'APPROVED' ? 'Re-provision' : 'Approve'} variant="default"
        onConfirm={() => approveMutation.mutate()} loading={approveMutation.isPending} />

      {/* Reactivate */}
      <ConfirmDialog open={reactivateDialog} onOpenChange={setReactivateDialog}
        title="Reactivate Tenant" description={`Reactivate "${tenant.businessName}"? They will regain full platform access immediately.`}
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
          <DialogHeader><DialogTitle>Suspend Tenant</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Suspending will immediately revoke platform access for this tenant and all their staff.</p>
          <Textarea placeholder="E.g. Repeated violations of platform terms of service." value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => suspendMutation.mutate()} loading={suspendMutation.isPending} disabled={!suspendReason.trim()}>Suspend Tenant</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Subscription */}
      <Dialog open={assignSubDialog} onOpenChange={setAssignSubDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign Subscription</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Package *</Label>
              <Select value={subForm.packageId} onValueChange={(v) => setSubForm((p) => ({ ...p, packageId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a package" /></SelectTrigger>
                <SelectContent>
                  {packages.map((pkg: any) => (
                    <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} — {formatCurrency(pkg.price)} / {pkg.billingCycle?.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Billing Cycle</Label>
              <Select value={subForm.billingCycle} onValueChange={(v: any) => setSubForm((p) => ({ ...p, billingCycle: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Start Date</Label>
              <Input type="date" value={subForm.startDate || ''} onChange={(e) => setSubForm((p) => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <Label className="mb-2 block">Custom Amount (optional)</Label>
              <Input type="number" placeholder="Leave empty to use package price" value={subForm.amount ?? ''} onChange={(e) => setSubForm((p) => ({ ...p, amount: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="createInvoice" checked={subForm.createInvoice ?? true} onChange={(e) => setSubForm((p) => ({ ...p, createInvoice: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="createInvoice" className="cursor-pointer">Auto-create invoice</Label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="autoRenew" checked={subForm.autoRenew ?? true} onChange={(e) => setSubForm((p) => ({ ...p, autoRenew: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="autoRenew" className="cursor-pointer">Auto-renew</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignSubDialog(false)}>Cancel</Button>
            <Button onClick={() => assignSubMutation.mutate(subForm)} loading={assignSubMutation.isPending} disabled={!subForm.packageId}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice */}
      <Dialog open={createInvoiceDialog} onOpenChange={setCreateInvoiceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Description</Label>
              <Input placeholder="e.g. Monthly subscription — June 2026" value={invoiceForm.description ?? ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <Label className="mb-2 block">Amount (PKR) *</Label>
              <Input type="number" min="0" placeholder="0.00" value={invoiceForm.subtotal || ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, subtotal: Number(e.target.value) }))} />
            </div>
            <div>
              <Label className="mb-2 block">Tax Amount (PKR)</Label>
              <Input type="number" min="0" placeholder="0.00" value={invoiceForm.taxAmount ?? ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, taxAmount: Number(e.target.value) }))} />
            </div>
            <div>
              <Label className="mb-2 block">Due Date</Label>
              <Input type="date" value={invoiceForm.dueDate ?? ''} onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div>
              <Label className="mb-2 block">Status</Label>
              <Select value={invoiceForm.status ?? 'ISSUED'} onValueChange={(v: any) => setInvoiceForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateInvoiceDialog(false)}>Cancel</Button>
            <Button onClick={() => createInvoiceMutation.mutate(invoiceForm)} loading={createInvoiceMutation.isPending} disabled={!invoiceForm.subtotal}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Invoice Status */}
      <Dialog open={updateStatusDialog.open} onOpenChange={(o) => !o && setUpdateStatusDialog({ open: false, invoice: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Invoice Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Invoice: <span className="font-mono font-semibold">{updateStatusDialog.invoice?.invoiceNo}</span></p>
            <div>
              <Label className="mb-2 block">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED'].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateStatusDialog({ open: false, invoice: null })}>Cancel</Button>
            <Button
              onClick={() => updateStatusDialog.invoice && updateInvoiceMutation.mutate({ invoiceId: updateStatusDialog.invoice.id, payload: { status: newStatus as any } })}
              loading={updateInvoiceMutation.isPending}
              disabled={!newStatus}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Branch Dialog */}
      <Dialog open={deactivateBranchDialog.open} onOpenChange={(o) => !o && setDeactivateBranchDialog({ open: false, branchId: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate Branch Traveler Visibility</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to deactivate this branch from traveler visibility? It will no longer appear in traveler search or discovery results.
            </p>
            <div className="space-y-2">
              <Label htmlFor="deactivate-reason">Reason for Deactivation</Label>
              <Textarea
                id="deactivate-reason"
                placeholder="Enter the reason for deactivation (mandatory)..."
                value={deactivateBranchReason}
                onChange={(e) => setDeactivateBranchReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateBranchDialog({ open: false, branchId: '' })}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => travelerVisibilityMutation.mutate({
                branchId: deactivateBranchDialog.branchId,
                status: 'deactivated',
                reason: deactivateBranchReason
              })}
              disabled={!deactivateBranchReason.trim() || travelerVisibilityMutation.isPending}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Visibility History Dialog */}
      <Dialog open={historyDialog.open} onOpenChange={(o) => !o && setHistoryDialog({ open: false, branchId: '', branchName: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Visibility Logs: {historyDialog.branchName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[350px] overflow-y-auto">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading visibility history...</p>
            ) : !historyData?.data?.history || historyData.data.history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No visibility logs found for this branch.</p>
            ) : (
              <div className="space-y-3">
                {historyData.data.history.map((log: any) => (
                  <div key={log.id} className="border-b pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        log.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : log.status === 'deactivated'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {log.status.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center">
                        {log.changedAt ? new Date(log.changedAt).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    {log.reason && (
                      <p className="text-xs text-muted-foreground bg-muted p-2 rounded mt-1.5 border">
                        {log.reason}
                      </p>
                    )}
                    {log.changedBy && (
                      <p className="text-[9px] text-muted-foreground/80 mt-1">
                        By User ID: {log.changedBy}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialog({ open: false, branchId: '', branchName: '' })}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
