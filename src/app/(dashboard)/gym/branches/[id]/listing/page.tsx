'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Clock, CreditCard, FileText, ImageIcon, MapPin, Sparkles, Tag } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { NoAccess } from '@/components/features/no-access'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionCard } from '@/components/features/listing/section-card'
import { BasicInfoSection } from '@/components/features/listing/basic-info-section'
import { CategoryTagsSection } from '@/components/features/listing/category-tags-section'
import { PhotosSection } from '@/components/features/listing/photos-section'
import { AmenitiesSection } from '@/components/features/listing/amenities-section'
import { HoursSection } from '@/components/features/listing/hours-section'
import { LocationSection } from '@/components/features/listing/location-section'
import { PackagesSection } from '@/components/features/listing/packages-section'
import { BoostCard } from '@/components/features/listing/boost-card'
import { listingContentKey } from '@/components/features/listing/use-listing-save'
import { hostApi } from '@/lib/api/host'
import { plansApi } from '@/lib/api/plans'
import { Progress } from '@/components/ui/progress'
import { Card } from '@/components/ui/card'
import { describeRequestError } from '@/lib/api/request-errors'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'
import { listingAccess } from '@/lib/listing/access'
import { asStringList, listingQuality, splitCategories, toHourMinute } from '@/lib/listing/content'

type SectionId = 'photos' | 'basic' | 'category' | 'amenities' | 'hours' | 'location' | 'packages'

/**
 * The branch listing editor (UX-21): the same sections as the mobile listing_editor_hub_screen.dart,
 * on the same endpoints (GET / PATCH /host/branches/:branchId/listing-content). Sections show from
 * the person's grants; the server still decides every save.
 */
export default function ListingEditorPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const branchId = params.id as string
  const { organization, contextLoading } = useGymAccess()
  const access = listingAccess(organization, branchId)
  const [open, setOpen] = useState<SectionId | null>(null)

  const contentQuery = useQuery({
    queryKey: listingContentKey(branchId),
    queryFn: () => hostApi.getBranchListingContent(branchId),
    enabled: access.manage,
  })
  const branch = contentQuery.data?.data?.branch

  const plansQuery = useQuery({
    queryKey: ['listing-plans', branchId],
    queryFn: () => plansApi.getHostPlans(branchId),
    enabled: access.manage && access.plans,
  })
  const plans = plansQuery.data?.data?.plans
  const livePlanCount = plans ? plans.filter((p) => p.status !== 'INACTIVE').length : null

  const resubmit = useMutation({
    mutationFn: () => hostApi.resubmitBranchReview(branchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listingContentKey(branchId) })
      toast({ title: 'Listing resubmitted for review' })
    },
    onError: (err) =>
      toast({
        title: 'Could not resubmit',
        description: describeRequestError(err, 'The listing could not be resubmitted. Try again.'),
        variant: 'destructive',
      }),
  })

  const toggle = (id: SectionId) => setOpen((current) => (current === id ? null : id))

  if (contextLoading) {
    return (
      <>
        <Header title="Listing editor" />
        <div className="space-y-3 p-6"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      </>
    )
  }

  if (!access.manage) {
    return (
      <>
        <Header title="Listing editor" />
        <div className="p-6"><NoAccess what="the listing editor" needs="Manage the public listing" /></div>
      </>
    )
  }

  const deactivated = branch?.travelerVisibilityStatus?.toLowerCase() === 'deactivated'
  const categories = splitCategories(branch?.category)
  const tags = asStringList(branch?.tagsJson)
  const photoCount = asStringList(branch?.imagesJson).length
  const amenityCount = asStringList(branch?.facilitiesJson).length
  const opens = toHourMinute(branch?.openingTime)
  const closes = toHourMinute(branch?.closingTime)
  const quality = branch ? listingQuality(branch, access.plans ? livePlanCount : null) : { percent: 0, advice: '' }
  const hoursSummary = opens && closes ? `${opens} – ${closes}` : 'Not set'

  return (
    <>
      <Header title={branch?.branchName ?? 'Listing editor'} />
      <div className="mx-auto max-w-3xl animate-fade-in space-y-4 p-4 sm:p-6">
        <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {contentQuery.isLoading && (
          <div className="space-y-3" data-testid="listing-loading">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        )}

        {contentQuery.isError && (
          <Alert variant="destructive" data-testid="listing-error">
            <AlertTitle>The listing could not be loaded</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{describeRequestError(contentQuery.error, 'Could not load this listing. Try again.')}</p>
              <Button size="sm" variant="outline" onClick={() => contentQuery.refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        )}

        {branch && (
          <>
            {deactivated && (
              <Alert variant="destructive" data-testid="deactivation-banner">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Traveler view deactivated</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{branch.deactivationReason || 'No reason provided by an administrator.'}</p>
                  {access.settings && (
                    <Button size="sm" onClick={() => resubmit.mutate()} disabled={resubmit.isPending}>
                      {resubmit.isPending ? 'Sending…' : 'Resubmit for review'}
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <SectionCard
              id="photos"
              title="Photos"
              icon={ImageIcon}
              summary={`${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`}
              open={open === 'photos'}
              onToggle={() => toggle('photos')}
              canEdit={access.manage}
            >
              <PhotosSection branchId={branchId} branch={branch} access={access} onClose={() => setOpen(null)} />
            </SectionCard>

            <SectionCard
              id="basic"
              title="Basic Info"
              icon={FileText}
              summary={branch.tagline || branch.branchName || 'Not set'}
              open={open === 'basic'}
              onToggle={() => toggle('basic')}
              canEdit={access.manage}
            >
              <BasicInfoSection branchId={branchId} branch={branch} access={access} onClose={() => setOpen(null)} />
            </SectionCard>

            <SectionCard
              id="category"
              title="Category & Tags"
              icon={Tag}
              summary={categories.length ? categories.join(', ') + (tags.length ? ` · ${tags.length} tags` : '') : 'Not set'}
              open={open === 'category'}
              onToggle={() => toggle('category')}
              canEdit={access.manage}
            >
              <CategoryTagsSection branchId={branchId} branch={branch} access={access} onClose={() => setOpen(null)} />
            </SectionCard>

            <SectionCard
              id="amenities"
              title="Amenities"
              icon={Sparkles}
              summary={`${amenityCount} listed`}
              open={open === 'amenities'}
              onToggle={() => toggle('amenities')}
              canEdit={access.manage}
            >
              <AmenitiesSection branchId={branchId} branch={branch} access={access} onClose={() => setOpen(null)} />
            </SectionCard>

            <SectionCard
              id="hours"
              title="Operating Hours"
              icon={Clock}
              summary={hoursSummary}
              open={open === 'hours'}
              onToggle={() => toggle('hours')}
              canEdit={access.manage}
            >
              <HoursSection branchId={branchId} branch={branch} access={access} onClose={() => setOpen(null)} />
            </SectionCard>

            <SectionCard
              id="location"
              title="Location & Map"
              icon={MapPin}
              summary={branch.addressLine1 || branch.address || 'Not set'}
              open={open === 'location'}
              onToggle={() => toggle('location')}
              canEdit={access.manage}
            >
              <LocationSection branchId={branchId} branch={branch} access={access} onClose={() => setOpen(null)} />
            </SectionCard>

            {access.plans && (
              <SectionCard
                id="packages"
                title="Packages & Pricing"
                icon={CreditCard}
                summary={
                  plansQuery.isError
                    ? 'Could not load'
                    : livePlanCount === null
                      ? 'Loading…'
                      : `${livePlanCount} ${livePlanCount === 1 ? 'package' : 'packages'}`
                }
                open={open === 'packages'}
                onToggle={() => toggle('packages')}
                canEdit
              >
                <PackagesSection plans={plans} loading={plansQuery.isLoading} error={plansQuery.error} canManage={access.plansWrite} />
              </SectionCard>
            )}

            <BoostCard />

            {!(access.plans && plansQuery.isLoading) && (
            <Card className="p-4" data-testid="listing-quality">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Listing quality</h3>
                <span className="text-xs font-semibold" data-testid="quality-percent">{quality.percent}%</span>
              </div>
              <Progress value={quality.percent} aria-label="Listing quality" />
              <p className="mt-2 text-xs text-muted-foreground">{quality.advice}</p>
            </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}
