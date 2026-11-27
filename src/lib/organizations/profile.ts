/**
 * NEW-196 (P10b): one business's profile, as the mobile Edit Business reads and writes it:
 * GET / PATCH /host/businesses/:businessId (contract v2). The contact e-mail is only on the
 * staff view of the business (GET /organizations/me/businesses/:businessId/profile).
 */
import type { Business, UpdateBusinessPayload } from '@/lib/api/host'
import type { BusinessProfile } from '@/types'

/** The categories the mobile screen offers; a category set elsewhere is kept as it is. */
export const BUSINESS_CATEGORIES = [
  'General',
  'Fitness & Bodybuilding',
  'CrossFit & Functional',
  'Ladies Only',
  'Martial Arts & MMA',
  'Yoga & Pilates',
  'Aquatics & Swimming',
] as const

export const GENDER_TYPES = [
  { value: 'MIXED', label: 'Mixed (Co-ed)' },
  { value: 'MALE_ONLY', label: 'Male only' },
  { value: 'FEMALE_ONLY', label: 'Female only' },
] as const

export type GenderType = (typeof GENDER_TYPES)[number]['value']

export interface BusinessProfileForm {
  name: string
  category: string
  establishedYear: string
  description: string
  phone: string
  email: string
  website: string
  genderType: GenderType
}

export interface BusinessImages {
  logoUrl: string | null
  coverImageUrl: string | null
  gallery: string[]
}

const text = (...values: unknown[]): string => {
  for (const v of values) if (v !== undefined && v !== null) return String(v)
  return ''
}

/**
 * The businesses a host picks from in a strip: the ACTIVE ones, or every one returned when none is
 * ACTIVE yet. The API leaves out deleted businesses.
 */
export function visibleBusinesses<T extends Pick<Business, 'status'>>(businesses: T[]): T[] {
  const active = businesses.filter((b) => b.status?.toUpperCase() === 'ACTIVE')
  return active.length > 0 ? active : businesses
}

/** The form as the mobile screen fills it, from the business (option S: one id, one record). */
export function formFromBusiness(business: Business, profile?: Pick<BusinessProfile, 'contactEmail'> | null): BusinessProfileForm {
  const gender = text(business.genderType)
  return {
    name: text(business.name),
    category: text(business.category),
    establishedYear: text(business.establishedYear),
    description: text(business.description),
    phone: text(business.contactPhone),
    email: text(profile?.contactEmail),
    website: text(business.website),
    genderType: (GENDER_TYPES.some((g) => g.value === gender) ? gender : 'MIXED') as GenderType,
  }
}

export function imagesFromBusiness(business: Business): BusinessImages {
  const images = business.imagesJson
  return {
    logoUrl: business.logoUrl || null,
    coverImageUrl: business.coverImageUrl || null,
    gallery: Array.isArray(images) ? images.map(String) : [],
  }
}

/**
 * PATCH body. Empty text is sent as '' so a cleared field is cleared (the API stores null), as on
 * mobile; an empty established year is null.
 */
export function payloadFromForm(values: BusinessProfileForm, images: BusinessImages): UpdateBusinessPayload {
  const year = values.establishedYear.trim()
  return {
    businessName: values.name.trim(),
    businessDescription: values.description.trim(),
    category: values.category || null,
    establishedYear: year ? Number.parseInt(year, 10) : null,
    contactPhone: values.phone.trim(),
    contactEmail: values.email.trim(),
    website: values.website.trim(),
    genderType: values.genderType,
    logoUrl: images.logoUrl ?? '',
    coverImageUrl: images.coverImageUrl ?? '',
    imagesJson: images.gallery,
  }
}
