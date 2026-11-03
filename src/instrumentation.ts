/**
 * Server and edge error tracking (NEW-208, R-53). Next.js calls register() once per server runtime
 * and onRequestError() for an error while rendering or in a route handler. Nothing happens unless
 * NEXT_PUBLIC_SENTRY_DSN was set at build time; the options are those of
 * src/lib/observability/sentry.ts (errors only, scrubbed, no default PII).
 */
import type { Instrumentation } from 'next'
import { sentryOptions } from '@/lib/observability/sentry'

const currentOptions = () =>
  sentryOptions({
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  })

export async function register() {
  const options = currentOptions()
  if (!options) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.init(options)
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  const options = currentOptions()
  if (!options) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
