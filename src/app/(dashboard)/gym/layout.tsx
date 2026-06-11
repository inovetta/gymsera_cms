'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { tenantsApi } from '@/lib/api/tenants'
import { useAuth } from '@/hooks/use-auth'

export default function GymLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isPlatformAdmin, isGymHost, isBranchManager } = useAuth()
  const isGymOwner = isGymHost || isBranchManager

  const { data, isLoading } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: () => tenantsApi.getMyTenant(),
    enabled: isGymOwner,
    staleTime: 30_000,
  })

  const tenant = data?.data?.tenant
  const isActive = isPlatformAdmin || tenant?.status === 'ACTIVE'

  useEffect(() => {
    if (!isLoading && isGymOwner && tenant && !isActive) {
      router.replace('/settings/billing')
    }
  }, [isLoading, isGymOwner, tenant, isActive, router])

  if (isLoading && isGymOwner) {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (isGymOwner && tenant && !isActive) {
    return null
  }

  return <>{children}</>
}
