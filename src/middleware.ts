import { NextRequest, NextResponse } from 'next/server'
import { buildCsp, newNonce } from '@/lib/csp'

const PUBLIC_ROUTES = ['/login', '/forgot-password']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get('gymsera_session')?.value

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route))

  if (!session && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // SEC-14: a fresh nonce per request. Next.js reads it from the CSP header on the REQUEST and puts it on
  // its own inline scripts; the same policy goes out on the response, in Report-Only mode for now.
  const nonce = newNonce()
  const csp = buildCsp({ nonce, development: process.env.NODE_ENV !== 'production' })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy-report-only', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy-Report-Only', csp)
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|public).*)'],
}
