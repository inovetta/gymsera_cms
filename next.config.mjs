import { PHASE_PRODUCTION_BUILD } from 'next/constants.js'
import { assertBuildEnv } from './build-env.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  // SEC-18 / SEC-14: headers every response carries. The full CSP is built per request in
  // src/middleware.ts (it needs a nonce) and is Report-Only. Enforced now: frame-ancestors and base-uri.
  // object-src 'none' is in the Report-Only policy only: the KYC preview shows a PDF in an iframe
  // (overview-tab.tsx) and the built-in PDF viewer may count as a plugin. Enforce it after a PDF preview
  // check in a real browser.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'" },
        ],
      },
    ]
  },
}

// NEW-132: `next build` stops without an explicit NEXT_PUBLIC_API_URL (build-env.mjs).
// `next lint` loads the config in the build phase too, but builds nothing, so it is not checked.
const isLint = () => process.argv[2] === 'lint'

export default (phase) => {
  if (phase === PHASE_PRODUCTION_BUILD && !isLint()) assertBuildEnv(process.env)
  return nextConfig
}
