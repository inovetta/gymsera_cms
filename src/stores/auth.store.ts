import { create } from 'zustand'
import { User } from '@/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthActions {
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  hydrate: () => {
    if (typeof window === 'undefined') return
    try {
      const accessToken = localStorage.getItem('gymsera_access_token')
      const refreshToken = localStorage.getItem('gymsera_refresh_token')
      const userStr = localStorage.getItem('gymsera_user')
      const user = userStr ? JSON.parse(userStr) : null
      set({ accessToken, refreshToken, user, isAuthenticated: !!accessToken && !!user, isLoading: false })
    } catch {
      // Corrupted localStorage — clear it and treat as logged out
      localStorage.removeItem('gymsera_access_token')
      localStorage.removeItem('gymsera_refresh_token')
      localStorage.removeItem('gymsera_user')
      set({ isLoading: false, isAuthenticated: false })
    }
  },

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('gymsera_access_token', accessToken)
    localStorage.setItem('gymsera_refresh_token', refreshToken)
    localStorage.setItem('gymsera_user', JSON.stringify(user))
    document.cookie = `gymsera_session=1; path=/; max-age=${30 * 24 * 3600}; SameSite=Lax`
    set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false })
  },

  setUser: (user) => {
    localStorage.setItem('gymsera_user', JSON.stringify(user))
    set({ user })
  },

  logout: () => {
    localStorage.removeItem('gymsera_access_token')
    localStorage.removeItem('gymsera_refresh_token')
    localStorage.removeItem('gymsera_user')
    document.cookie = 'gymsera_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
  },
}))
