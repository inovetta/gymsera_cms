/**
 * The API this CMS calls (NEW-132). NEXT_PUBLIC_API_URL is required for `next build`
 * (build-env.mjs), so this fallback only serves `next dev` and tests. It is the local API on
 * purpose: a developer without the variable never administers production by accident.
 */
export const DEFAULT_API_URL = 'http://localhost:3000'

/** NEXT_PUBLIC_API_URL, or the local API when it is unset. Read literally so Next inlines it. */
export const apiUrl = (): string => process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL
