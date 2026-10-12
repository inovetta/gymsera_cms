import type { BranchListingContent, UpdateListingContentPayload } from '@/lib/api/host'

/**
 * Pure helpers for the listing editor (UX-21). Mirrors what the mobile editor does in
 * gyms_era/lib/features/host/presentation/providers/listings_provider.dart: the same lists,
 * the same single opening/closing pair, the same comma-joined category string.
 */

/** The category chips of the mobile basic-info screen (edit_basic_info_screen.dart). */
export const LISTING_CATEGORIES = ['Strength', 'CrossFit', 'Yoga', 'Boxing', 'HIIT', 'Powerlifting', 'Pilates'] as const

/** Equipment and facility choices of the mobile amenities screen (edit_amenities_screen.dart). */
export const EQUIPMENT_AMENITIES = ['Barbells', 'Cables', 'Dumbbells', 'Machines', 'Cardio', 'Boxing Ring', 'Pool', 'Mat Area'] as const
export const FACILITY_AMENITIES = ['Changing Room', 'Showers', 'Lockers', 'AC', 'Sauna', 'Parking', 'Elevator', 'WiFi', 'CCTV'] as const

export const COUNTRIES = ['Pakistan', 'United States', 'United Kingdom', 'United Arab Emirates'] as const

export const TAGLINE_MAX = 50
export const DESCRIPTION_MAX = 250
export const MAX_PHOTOS = 10

/** A JSON column that may arrive as an array, a JSON string, or nothing. */
export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((v) => v.trim() !== '')
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter((v) => v.trim() !== '')
    } catch {
      /* a plain string is one entry, as on mobile */
    }
    return [text]
  }
  return []
}

/** The category column holds the chosen chips joined by ", " (mobile `_selectedCategories.join(', ')`). */
export const splitCategories = (category: string | null | undefined): string[] =>
  (category ?? '').split(',').map((c) => c.trim()).filter(Boolean)

export const joinCategories = (categories: string[]): string => categories.join(', ')

/** "06:00:00" → "06:00" for a time input; anything else that is not a time → "". */
export function toHourMinute(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((value ?? '').trim())
  if (!match) return ''
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return ''
  return `${String(h).padStart(2, '0')}:${match[2]}`
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Only the keys whose value changed, so a PATCH never rewrites what the person did not touch.
 * `base` is the branch as loaded; `draft` holds the section's new values.
 */
export function changedFields(base: BranchListingContent, draft: UpdateListingContentPayload): UpdateListingContentPayload {
  const out: Record<string, unknown> = {}
  const listKeys = new Set(['tagsJson', 'facilitiesJson', 'imagesJson'])
  for (const [key, next] of Object.entries(draft)) {
    if (next === undefined) continue
    const current = (base as unknown as Record<string, unknown>)[key]
    if (listKeys.has(key)) {
      if (!sameList(asStringList(current), next as string[])) out[key] = next
    } else if (key === 'openingTime' || key === 'closingTime') {
      if (toHourMinute(current as string) !== next) out[key] = next
    } else if (key === 'latitude' || key === 'longitude') {
      if (current === null || current === undefined || Number(current) !== next) out[key] = next
    } else if (typeof next === 'string') {
      if (String(current ?? '').trim() !== next.trim()) out[key] = next.trim()
    } else if (current !== next) {
      out[key] = next
    }
  }
  return out as UpdateListingContentPayload
}

export interface ListingQuality {
  percent: number
  advice: string
}

/**
 * The mobile "Listing Quality" card: equally weighted parts. `planCount` is the number of live
 * (not INACTIVE) packages, or null when the person may not see packages: that part is then left
 * out instead of counted as missing.
 */
export function listingQuality(branch: BranchListingContent, planCount: number | null): ListingQuality {
  const photos = asStringList(branch.imagesJson).length
  const amenities = asStringList(branch.facilitiesJson).length
  const parts = [
    photos > 0,
    !!branch.branchName?.trim(),
    amenities > 0,
    !!branch.openingTime && !!branch.closingTime,
    !!(branch.address && branch.address.trim()),
  ]
  if (planCount !== null) parts.push(planCount > 0)
  const percent = Math.floor((parts.filter(Boolean).length / parts.length) * 100)
  let advice = 'Great job! Your listing is highly detailed and traveler-friendly.'
  if (photos === 0) advice = 'Add branch photos to boost listing quality.'
  else if (planCount === 0) advice = 'Add at least one package to allow bookings.'
  else if (amenities === 0) advice = 'Add amenities to stand out to travelers.'
  return { percent, advice }
}
