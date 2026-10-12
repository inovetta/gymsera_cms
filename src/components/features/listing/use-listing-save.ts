'use client'

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { hostApi, type UpdateListingContentPayload } from '@/lib/api/host'
import { readApprovalOutcome, type ApprovalOutcome } from '@/lib/api/approvals'
import { describeRequestError } from '@/lib/api/request-errors'
import { useToast } from '@/hooks/use-toast'

export const listingContentKey = (branchId: string) => ['listing-content', branchId] as const

/**
 * One save for every section: PATCH /host/branches/:id/listing-content with only the fields the
 * section changed. A 202 is reported as "sent for approval", never as saved. A failure shows the
 * server's own message.
 */
export function useListingSave(branchId: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approval, setApproval] = useState<ApprovalOutcome | null>(null)

  const save = useCallback(
    async (payload: UpdateListingContentPayload, successTitle: string): Promise<boolean> => {
      setSaving(true)
      setError(null)
      setApproval(null)
      try {
        const response = await hostApi.updateBranchListingContent(branchId, payload)
        const outcome = readApprovalOutcome(response)
        if (outcome.pending) {
          setApproval(outcome)
          return false
        }
        await queryClient.invalidateQueries({ queryKey: listingContentKey(branchId) })
        queryClient.invalidateQueries({ queryKey: ['branch', branchId] })
        toast({ title: successTitle })
        return true
      } catch (err) {
        setError(
          describeRequestError(err, 'The listing could not be saved. Check your connection and try again.', {
            403: 'You are not allowed to change this listing.',
          })
        )
        return false
      } finally {
        setSaving(false)
      }
    },
    [branchId, queryClient, toast]
  )

  const reset = useCallback(() => {
    setError(null)
    setApproval(null)
  }, [])

  return { save, saving, error, approval, reset }
}
