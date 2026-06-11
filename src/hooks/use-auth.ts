import { useAuthStore } from '@/stores/auth.store'

export function useAuth() {
  const { user, isAuthenticated, isLoading, logout } = useAuthStore()
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN'
  const isGymHost = user?.role === 'GYM_HOST'
  const isBranchManager = user?.role === 'BRANCH_MANAGER'
  return { user, isAuthenticated, isLoading, logout, isPlatformAdmin, isGymHost, isBranchManager }
}
