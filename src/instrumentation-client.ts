/**
 * Browser error tracking (NEW-208, R-53). Runs before the app in the browser. Nothing happens unless
 * NEXT_PUBLIC_SENTRY_DSN was set when the CMS was built; then the SDK is loaded and started with the
 * options of src/lib/observability/sentry.ts (errors only, scrubbed, no default PII).
 */
import { sentryOptions } from '@/lib/observability/sentry'

// Written out in full: Next.js inlines NEXT_PUBLIC_ values only where they are named like this.
const options = sentryOptions({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
})

function start() {
  if (!options) return
  // Loaded only when a DSN is set, so a build without one never runs Sentry code.
  void import('@sentry/nextjs').then((Sentry) => Sentry.init(options))
}

start()
