'use client'

import { useQuery } from '@tanstack/react-query'
import { Clock, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hostApi, type Business } from '@/lib/api/host'

export const UPLOAD_PROOF_TITLE = 'Upload your proof of premises to go live'

/**
 * HostStatus.nextStep (NEW-303 M3e, R-121): the server says what the owner does next for a first
 * business that still holds its first branch. `upload_proof_of_premises` opens that business's
 * Documents; `wait_for_business_approval` says GymsEra is reviewing. Nothing when `nextStep` is null.
 */
export function NextStepBanner({ businesses, onUpload }: { businesses: Business[]; onUpload: (b: Business) => void }) {
  const { data: step } = useQuery({ queryKey: ['host-next-step'], queryFn: hostApi.getNextStep, retry: false })
  if (!step) return null
  const business = businesses.find((b) => b.id === step.businessId)
  const name = business?.name ?? 'your business'

  if (step.key === 'upload_proof_of_premises') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4" data-testid="next-step-upload">
        <div className="flex items-start gap-3">
          <FileUp className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <p className="font-medium">{UPLOAD_PROOF_TITLE}</p>
            <p className="text-sm text-muted-foreground">GymsEra approves {name} once it has your proof of premises (a utility bill, lease or ownership paper).</p>
          </div>
        </div>
        {business && <Button size="sm" onClick={() => onUpload(business)}>Upload proof of premises</Button>}
      </div>
    )
  }
  if (step.key === 'wait_for_business_approval') {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4" data-testid="next-step-wait">
        <Clock className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <p className="text-sm">Proof of premises received. GymsEra is reviewing {name}; its first branch opens when it is approved.</p>
      </div>
    )
  }
  return null
}
