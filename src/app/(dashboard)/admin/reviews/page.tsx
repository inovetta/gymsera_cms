'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Star, CheckCircle, XCircle } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { EmptyState } from '@/components/features/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/lib/api/admin'
import { GymReview } from '@/types'
import { formatDate, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`}
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground">({rating}/5)</span>
    </div>
  )
}

function ReviewCard({ review, onAction }: {
  review: GymReview
  onAction: (id: string, action: 'APPROVE' | 'REJECT') => void
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-sm bg-primary/10 text-primary">
                {review.user?.fullName ? getInitials(review.user.fullName) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-sm">{review.user?.fullName ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={review.status} />
            {review.status === 'PENDING' && (
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-success hover:text-success hover:bg-success/10"
                  onClick={() => onAction(review.id, 'APPROVE')}
                  title="Approve"
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onAction(review.id, 'REJECT')}
                  title="Reject"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <StarRating rating={review.rating} />
          <h4 className="font-semibold mt-2">{review.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{review.body}</p>
        </div>

        {review.gymListing && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              Gym: <span className="font-medium text-foreground">{review.gymListing.name}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ReviewsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', statusFilter],
    queryFn: () => adminApi.getReviews({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      limit: 20,
    }),
  })

  const moderateMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) =>
      adminApi.moderateReview(id, action),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      toast({ title: `Review ${vars.action === 'APPROVE' ? 'approved' : 'rejected'}` })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to moderate review', variant: 'destructive' }),
  })

  const reviews = data?.data?.reviews ?? []

  return (
    <>
      <Header title="Review Moderation" description="Approve or reject user reviews" />
      <div className="p-6 animate-fade-in">
        <PageHeader title="Review Moderation" description="Manage user-submitted gym reviews" />

        <Card className="mb-6">
          <CardHeader className="pb-0">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="PENDING">Pending</TabsTrigger>
                <TabsTrigger value="APPROVED">Approved</TabsTrigger>
                <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
        </Card>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No reviews found"
            description={`No ${statusFilter !== 'all' ? statusFilter.toLowerCase() : ''} reviews at this time`}
          />
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onAction={(id, action) => moderateMutation.mutate({ id, action })}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
