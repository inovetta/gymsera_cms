/**
 * Build-time settings check (NEW-132), run by next.config.mjs for `next build` only.
 *
 * NEXT_PUBLIC_API_URL is baked into the bundle at build time. The CMS used to fall back to
 * http://localhost:3000 when it was missing, so a production build quietly called the admin's own
 * machine. Like the mobile app (release builds need APP_ENV), a build now needs it, set explicitly to the
 * API's origin: https://api.gymsera.com for production, https://apistaging.gymsera.com for staging.
 * The client adds /api/v1 itself, so a path is refused. `next dev` and tests are not checked.
 */
export const API_URL_EXAMPLE = 'https://api.gymsera.com'

/** Why `value` cannot be the API URL, or null when it can. */
export const apiUrlProblem = (value) => {
  if (value === undefined) return 'is not set'
  if (value.trim() === '') return 'is empty'
  let url
  try {
    url = new URL(value)
  } catch {
    return `is not a URL ("${value}")`
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return `must be http or https ("${value}")`
  if (url.pathname !== '/' || url.search || url.hash) {
    return `must be the API origin only, without a path ("${value}"; the client adds /api/v1)`
  }
  return null
}

/** Throws when the build settings are not usable. */
export const assertBuildEnv = (env = process.env) => {
  const problem = apiUrlProblem(env.NEXT_PUBLIC_API_URL)
  if (problem) {
    throw new Error(
      `NEXT_PUBLIC_API_URL ${problem}. The build stops here so it cannot call the wrong API. ` +
        `Set it for this build, e.g. NEXT_PUBLIC_API_URL=${API_URL_EXAMPLE} (production) or ` +
        'https://apistaging.gymsera.com (staging), in the environment or .env.production.local.'
    )
  }
}
