import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Manrope } from 'next/font/google'
import './globals.css'
import { Providers } from '@/providers'

// SEC-14: the CSP nonce is made per request, so pages cannot be prerendered once at build time.
export const dynamic = 'force-dynamic'

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })

export const metadata: Metadata = {
  title: 'GymsEra CMS',
  description: 'GymsEra Management Portal',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by src/middleware.ts; next-themes' inline script needs it (SEC-14).
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} font-sans`}>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  )
}
