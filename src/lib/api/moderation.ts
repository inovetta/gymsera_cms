import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * NEW-256 (App Store 1.2, Google Play UGC policy): the platform admin's report queue and the word
 * list. Platform admins only (GET/PATCH /admin/reports, GET/PUT /admin/moderation/words). The server
 * decides which actions fit a report (`allowedActions`) and what each one does.
 */

export type ReportTargetType = 'REVIEW' | 'MESSAGE'
export type ReportStatus = 'OPEN' | 'ACTIONED' | 'DISMISSED'
export type ReportAction = 'DISMISS' | 'HIDE_REVIEW' | 'DELETE_MESSAGE' | 'SUSPEND_USER'

export const REPORT_REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam or advertising',
  HARASSMENT: 'Harassment or bullying',
  HATE: 'Hate speech',
  SEXUAL: 'Sexual content',
  VIOLENCE: 'Violence or threats',
  FALSE_INFO: 'False or misleading',
  OTHER: 'Something else',
}

export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  DISMISS: 'Dismiss',
  HIDE_REVIEW: 'Hide review',
  DELETE_MESSAGE: 'Delete message',
  SUSPEND_USER: 'Suspend author',
}

/** What each action does, shown before the admin confirms it. */
export const REPORT_ACTION_EFFECTS: Record<ReportAction, string> = {
  DISMISS: 'Closes the report. Nothing changes.',
  HIDE_REVIEW: 'The review is rejected and disappears from the gym page for everyone.',
  DELETE_MESSAGE: 'The message is deleted from the conversation. The report keeps a copy of the text.',
  SUSPEND_USER: 'The author can no longer sign in, and all their sessions end. The content stays until you hide or delete it.',
}

interface Person {
  id: string
  fullName?: string | null
  email?: string | null
  status?: string | null
}

export interface ContentReport {
  id: string
  reporterUserId: string
  targetType: ReportTargetType
  targetId: string
  targetUserId: string | null
  conversationId: string | null
  organizationId: string | null
  reason: string
  note: string | null
  snapshotText: string | null
  status: ReportStatus
  action: ReportAction | null
  adminNote: string | null
  handledAt: string | null
  createdAt: string
  ageHours: number
  overdue: boolean
  allowedActions: ReportAction[]
  reporter?: Person | null
  targetUser?: Person | null
  handledBy?: Person | null
  /** GET /admin/reports/:id only: the content as it is now. */
  current?: { exists: boolean; status?: string; text?: string; title?: string | null; body?: string | null }
  otherReports?: number
}

export interface ReportQueue {
  reports: ContentReport[]
  counts: { open: number; overdue: number }
  responseHours: number
}

export interface GetReportsParams {
  status?: ReportStatus | 'ALL'
  targetType?: ReportTargetType
  page?: number
  limit?: number
}

export const MODERATION_QUEUE_KEY = ['moderation-reports'] as const
export const MODERATION_WORDS_KEY = ['moderation-words'] as const

export const moderationApi = {
  getReports: async (params?: GetReportsParams): Promise<ApiResponse<ReportQueue>> => {
    const { data } = await apiClient.get('/admin/reports', { params })
    return data
  },

  getReport: async (id: string): Promise<ApiResponse<{ report: ContentReport }>> => {
    const { data } = await apiClient.get(`/admin/reports/${id}`)
    return data
  },

  act: async (id: string, action: ReportAction, adminNote?: string): Promise<ApiResponse<{ report: ContentReport; closedOthers: number }>> => {
    const note = adminNote?.trim()
    const { data } = await apiClient.patch(`/admin/reports/${id}`, { action, ...(note ? { adminNote: note } : {}) })
    return data
  },

  getWords: async (): Promise<ApiResponse<{ words: string[] }>> => {
    const { data } = await apiClient.get('/admin/moderation/words')
    return data
  },

  saveWords: async (words: string[]): Promise<ApiResponse<{ words: string[] }>> => {
    const { data } = await apiClient.put('/admin/moderation/words', { words })
    return data
  },
}

/** The word list as typed in the editor: one word or phrase per line; blanks dropped. */
export const parseWordList = (text: string): string[] =>
  text
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean)
