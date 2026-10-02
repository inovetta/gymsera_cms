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

export interface DeleteBranchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchName?: string
  onConfirm: (password: string) => void
  loading?: boolean
  error?: string | null
}

export function DeleteBranchDialog({
  open,
  onOpenChange,
  branchName,
  onConfirm,
  loading = false,
  error = null,
}: DeleteBranchDialogProps) {
  const [password, setPassword] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setPassword('')
    }
  }, [open])

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password.trim() || loading) return
    onConfirm(password)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Branch</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete {branchName ? `"${branchName}"` : 'this branch'}? All related membership plans, staff assignments, and branch-specific data will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="delete-branch-password">
              Account Password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="delete-branch-password"
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
            {error && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Social Sign-in Accounts</p>
            <p className="mt-1">
              The CMS requires an account password for verification. If your account only signs in with Google, please set a password in your account settings or use the mobile app to delete this branch.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={loading}
              onClick={() => {
                setPassword('')
              }}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="submit"
              variant="destructive"
              disabled={!password.trim() || loading}
              loading={loading}
            >
              Delete Branch
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
