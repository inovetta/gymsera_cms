/**
 * NEW-196 (P10b): the organization profile, as the mobile Edit Organization reads and writes it
 * (`edit_organization_screen.dart`): one organization through GET / PATCH /host/listings/:id.
 * /gyms/profile edited only the tenant's first organization.
 */
import type { HostListing, HostOrganization, UpdateOrganizationPayload } from '@/lib/api/host'

/** The categories the mobile screen offers; a category set elsewhere is kept as it is. */
export const ORGANIZATION_CATEGORIES = [
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

export interface OrganizationProfileForm {
  name: string
  category: string
  establishedYear: string
  description: string
  phone: string
  email: string
  website: string
  genderType: GenderType
}

export interface OrganizationImages {
  logoUrl: string | null
  coverImageUrl: string | null
  gallery: string[]
}

const text = (...values: unknown[]): string => {
  for (const v of values) if (v !== undefined && v !== null) return String(v)
  return ''
}

/**
 * The organizations a host picks from: the same rule as the Branches page strip (the ACTIVE ones,
 * or every one returned when none is ACTIVE yet). The API leaves out deleted organizations.
 */
export function visibleOrganizations<T extends Pick<HostListing, 'status'>>(listings: T[]): T[] {
  const active = listings.filter((l) => l.status?.toUpperCase() === 'ACTIVE')
  return active.length > 0 ? active : listings
}

/** The form as the mobile screen fills it: the organization's own gym first, then the organization. */
export function formFromOrganization(org: HostOrganization): OrganizationProfileForm {
  const gym = org.gym ?? {}
  const gender = text(gym.genderType, org.genderType)
  return {
    name: text(gym.name, org.title),
    category: text(org.category),
    establishedYear: text(org.establishedYear),
    description: text(gym.description, org.shortDescription),
    phone: text(gym.contactPhone, org.contactPhone),
    email: text(gym.contactEmail),
    website: text(gym.website, org.website),
    genderType: (GENDER_TYPES.some((g) => g.value === gender) ? gender : 'MIXED') as GenderType,
  }
}

export function imagesFromOrganization(org: HostOrganization): OrganizationImages {
  const gym = org.gym ?? {}
  const images = gym.imagesJson ?? org.imagesJson
  return {
    logoUrl: (gym.logoUrl ?? org.logoUrl ?? null) || null,
    coverImageUrl: (gym.coverImageUrl ?? org.coverImageUrl ?? null) || null,
    gallery: Array.isArray(images) ? images.map(String) : [],
  }
}

/**
 * PATCH body. Empty text is sent as '' so a cleared field is cleared (the API stores null), as on
 * mobile; an empty established year is null.
 */
export function payloadFromForm(values: OrganizationProfileForm, images: OrganizationImages): UpdateOrganizationPayload {
  const year = values.establishedYear.trim()
  return {
    gymName: values.name.trim(),
    gymDescription: values.description.trim(),
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
