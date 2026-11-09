'use client'

import { PayoutsView } from '@/components/features/payouts/payouts-view'

/**
 * R-99 (P11d): the bank details travellers pay into by bank transfer (the business's payout account,
 * PUT /host/payout-account with re-authentication), on their own page while payouts are hidden.
 */
export default function BankDetailsPage() {
  return <PayoutsView mode="bank" />
}
