import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { useSelectedOrgStore } from '@/stores/selected-org.store'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Calls that must not carry an organization: /me/context is what lists them, and /auth/* is
// about the account, not a gym.
const isOrganizationFree = (url?: string) => !!url && (url.startsWith('/me/context') || url.startsWith('/auth/'))

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // The organization chosen in the switcher, sent the way the mobile team workspace does.
  const tenantId = useSelectedOrgStore.getState().tenantId
  if (tenantId && !isOrganizationFree(config.url)) {
    config.headers.set('X-Tenant-Id', tenantId)
  }
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('gymsera_access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

interface RefreshSubscriber {
  resolve: (token: string) => void
  reject: (error: any) => void
}

let isRefreshing = false
let refreshSubscribers: RefreshSubscriber[] = []

const subscribeTokenRefresh = (sub: RefreshSubscriber) => {
  refreshSubscribers.push(sub)
}

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((sub) => sub.resolve(token))
  refreshSubscribers = []
}

const onTokenRefreshFailed = (error: any) => {
  refreshSubscribers.forEach((sub) => sub.reject(error))
  refreshSubscribers = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    const isReauthError =
      error.response?.data?.code === 'invalid_credentials' ||
      error.response?.data?.code === 'reauth_required'

    if (error.response?.status === 401 && !originalRequest._retry && !isReauthError) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`
              }
              resolve(apiClient(originalRequest))
            },
            reject: (err: any) => {
              reject(err)
            },
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('gymsera_refresh_token')
      if (!refreshToken) {
        onTokenRefreshFailed(error)
        isRefreshing = false
        localStorage.clear()
        document.cookie = 'gymsera_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, { refreshToken })
        const newAccessToken = data.data.accessToken
        const newRefreshToken = data.data.refreshToken

        localStorage.setItem('gymsera_access_token', newAccessToken)
        localStorage.setItem('gymsera_refresh_token', newRefreshToken)

        onTokenRefreshed(newAccessToken)
        isRefreshing = false

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        }
        return apiClient(originalRequest)
      } catch (refreshError) {
        onTokenRefreshFailed(refreshError)
        isRefreshing = false
        localStorage.clear()
        document.cookie = 'gymsera_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
