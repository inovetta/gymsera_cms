'use client'

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleSignInButton } from '@/components/features/google-sign-in-button'

/**
 * What the server's `assertReauth` accepts (`gymsera_be/src/services/auth.service.js:1090`):
 * the account password, or a fresh Google ID token for the account's own Google identity.
 * A Google-only account has no password, so it can only confirm with the second.
 */
export type ReauthCredential =
  | { password: string }
  | { provider: 'GOOGLE'; idToken: string }

interface ReauthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  onConfirm: (credential: ReauthCredential) => void
  loading?: boolean
  /** The server's message from the last attempt (wrong password, no match, …). */
  error?: string | null
}

/**
 * Re-authentication before a sensitive money change (SEC-13 bank details, NEW-35). Shows the
 * server's message as given; never says "done" itself. Offers the password and, for accounts
 * that sign in with Google, the Google confirmation.
 */
export function ReauthDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading = false,
  error = null,
}: ReauthDialogProps) {
  const [password, setPassword] = React.useState('')

  React.useEffect(() => {
    if (open) setPassword('')
  }, [open])

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password.trim() || loading) return
    onConfirm({ password })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reauth-password">Account password</Label>
            <Input
              id="reauth-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              error={!!error}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Signed in with Google? Confirm with Google instead.</p>
            <GoogleSignInButton onCredential={(idToken) => onConfirm({ provider: 'GOOGLE', idToken })} />
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <Button type="submit" disabled={!password.trim() || loading} loading={loading}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
