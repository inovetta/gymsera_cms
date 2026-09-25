'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

// Google Identity Services' own typings live in @types/google.accounts, which
// this project doesn't depend on — declared narrowly here to exactly the
// shape actually used below, rather than pulling in the whole library.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              shape?: 'rectangular' | 'pill' | 'circle' | 'square'
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
              logo_alignment?: 'left' | 'center'
              width?: number
            }
          ) => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  /** Called with the raw Google ID token (a JWT) once the person picks an account. */
  onCredential: (idToken: string) => void
}

/**
 * The CMS's own copy of gymsera_web's identical component — not extracted
 * into a shared package because these two apps don't share one, and this is
 * genuinely the whole component either way. Renders Google's own button via
 * Google Identity Services (GIS), the one flow that hands back a real,
 * backend-verifiable ID token from an actual click; the OAuth "token client"
 * alternative only yields an access token, which nothing here can verify.
 *
 * `theme: 'filled_black'` (not 'outline', which gymsera_web uses) because
 * this login card is dark (bg-slate-800) — GIS's own light "outline" button
 * would sit oddly on it.
 *
 * Posts to /auth/social/google/staff, not the public /auth/social/google —
 * see auth.service.js#googleLogin's `staffOnly` mode. That's what makes this
 * button refuse a random Gmail account instead of silently provisioning one;
 * nothing on this component enforces that, the route it calls does.
 */
export function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null)
  const onCredentialRef = useRef(onCredential)
  onCredentialRef.current = onCredential
  const [scriptReady, setScriptReady] = useState(false)
  const [configError, setConfigError] = useState(false)

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!scriptReady) return
    if (!clientId) {
      setConfigError(true)
      return
    }
    if (!window.google || !buttonRef.current) return

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => onCredentialRef.current(response.credential),
    })
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      shape: 'rectangular',
      text: 'signin_with',
      logo_alignment: 'left',
      width: buttonRef.current.parentElement?.clientWidth,
    })
  }, [scriptReady, clientId])

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      {configError ? (
        <div className="w-full h-10 flex items-center justify-center rounded-md border border-slate-600 text-sm text-slate-400">
          Google sign-in is not configured
        </div>
      ) : (
        // GIS renders its own button into this div (an iframe it injects
        // itself) — h-10 matches the submit button's height so nothing
        // jumps once the script loads and replaces this placeholder.
        <div ref={buttonRef} className="w-full h-10 flex items-center justify-center overflow-hidden rounded-md" />
      )}
    </>
  )
}
