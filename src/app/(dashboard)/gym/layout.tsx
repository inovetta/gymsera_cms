'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useGymAccess } from '@/hooks/use-gym-access'

export default function GymLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  // NEW-43: only an organization's owner is held back by its billing status. A team
  // member is not an owner, whatever their account role says.
  const { isTenantOwner, tenant, tenantLoading, isTenantActive } = useGymAccess()
  const isActive = isTenantActive

  useEffect(() => {
    if (!tenantLoading && isTenantOwner && tenant && !isActive) {
      router.replace('/settings/billing')
    }
  }, [tenantLoading, isTenantOwner, tenant, isActive, router])

  if (tenantLoading) {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (isTenantOwner && tenant && !isActive) {
    return null
  }

  return <>{children}</>
}
