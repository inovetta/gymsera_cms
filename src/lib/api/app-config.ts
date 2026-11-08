import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * GET /meta/app-config (backend NEW-81, R-99): public, cached for a minute by the API. The CMS reads
 * only `features`, the launch switches; the version fields are for the mobile app.
 */
export interface AppConfig {
  minAppVersion?: { ios: string | null; android: string | null }
  storeUrls?: { ios: string | null; android: string | null }
  /** R-99 (P11d): absent on an older API, which counts as off. */
  features?: { payouts?: boolean }
}

export const appConfigApi = {
  get: async (): Promise<ApiResponse<AppConfig>> => {
    const { data } = await apiClient.get('/meta/app-config')
    return data
  },
}
