'use client'

import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { EmptyState } from '@/components/features/empty-state'
import { PayoutsView } from '@/components/features/payouts/payouts-view'
import { Skeleton } from '@/components/ui/skeleton'
import { usePayoutsEnabled } from '@/hooks/use-payouts-enabled'

/**
 * R-99 (P11d): while the API does not offer payouts (GET /meta/app-config `features.payouts`), this
 * page shows no balance and no payout requests and calls no payout route; a bookmark lands on a plain
 * "not available" state with the way to the bank details travellers pay into.
 */
export default function PayoutsPage() {
  const { payoutsEnabled, loading } = usePayoutsEnabled()

  if (loading) {
    return (
      <>
        <Header title="Payouts" />
        <div className="p-6"><Skeleton className="h-24 w-full" /></div>
      </>
    )
  }

  if (!payoutsEnabled) {
    return (
      <>
        <Header title="Payouts" />
        <div className="p-6" data-testid="payouts-unavailable">
          <EmptyState
            icon={Landmark}
            title="Payouts are not available yet"
            description="Travellers who pay by bank transfer send the money straight to your account. You can check or change those details under Bank details."
            action={
              <Link href="/gym/bank-details" className="font-medium text-primary hover:underline">
                Bank details
              </Link>
            }
          />
        </div>
      </>
    )
  }

  return <PayoutsView mode="payouts" />
}
