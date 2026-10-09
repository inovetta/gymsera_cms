'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useGymAccess } from '@/hooks/use-gym-access'

/**
 * Guard for all /settings routes (NEW-46d).
 * Settings (Business Profile, Subscription & Billing) are owner-only for the selected organization.
 * Non-owners of the currently selected organization are redirected to /dashboard.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isTenantOwner, contextLoading } = useGymAccess()

  useEffect(() => {
    if (!contextLoading && !isTenantOwner) {
      router.replace('/dashboard')
    }
  }, [contextLoading, isTenantOwner, router])

  if (contextLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isTenantOwner) {
    return null
  }

  return <>{children}</>
}
