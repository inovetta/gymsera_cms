'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useGymAccess } from '@/hooks/use-gym-access'
import { PORTAL_REFUSAL } from '@/lib/access/portal'
import { authApi } from '@/lib/api/auth'

/**
 * Sits behind AuthGuard (NEW-43). Being signed in is not enough: the person must
 * hold a gym permission, own an organization, or have a legacy staff account.
 * Covers a session that already existed before the check was added.
 */
export function PortalGuard({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth()
  const { portalAllowed, contextLoading } = useGymAccess()

  if (contextLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!portalAllowed) {
    const signOut = async () => {
      try {
        await authApi.logout()
      } catch {
        // ignore
      } finally {
        logout()
        window.location.href = '/login'
      }
    }
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="max-w-sm font-medium">{PORTAL_REFUSAL}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ask the owner of your gym to give you a team role, or use the GymsEra app.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
