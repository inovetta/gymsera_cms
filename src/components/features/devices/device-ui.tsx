'use client'

import { useState } from 'react'
import { Check, Copy, Lock, LockOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AccessDevice, DeviceDirection, DeviceSetup } from '@/lib/api/devices'

/** 840 → "14 min ago". */
export const agoText = (seconds: number | null): string | null => {
  if (seconds === null || seconds === undefined) return null
  if (seconds < 60) return `${seconds} s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86400)} d ago`
}

export const statusText = (d: Pick<AccessDevice, 'connection' | 'lastSeenSecondsAgo'>): string => {
  switch (d.connection) {
    case 'online':
      return 'Online'
    case 'awaiting_connection':
      return 'Waiting for first connection'
    case 'disabled':
      return 'Disabled'
    case 'removed':
      return 'Removed'
    case 'wiping':
      return 'Wiping: waiting for the device to delete its users'
    default: {
      const ago = agoText(d.lastSeenSecondsAgo)
      return ago ? `Offline · last seen ${ago}` : 'Offline'
    }
  }
}

const STATUS_TONE: Record<string, string> = {
  online: 'bg-green-100 text-green-800',
  awaiting_connection: 'bg-yellow-100 text-yellow-800',
  offline: 'bg-red-100 text-red-800',
  disabled: 'bg-gray-100 text-gray-800',
  removed: 'bg-gray-100 text-gray-800',
  wiping: 'bg-amber-100 text-amber-900',
}

export function DeviceStatusBadge({ device }: { device: Pick<AccessDevice, 'connection' | 'lastSeenSecondsAgo'> }) {
  return <Badge className={STATUS_TONE[device.connection] ?? ''} variant="outline">{statusText(device)}</Badge>
}

export const DIRECTION_LABEL: Record<DeviceDirection, string> = {
  in: 'Check-in',
  out: 'Check-out',
  both: 'Check-in and out',
}

/** HTTPS / HTTP badge (spec §10.1, D-3): unknown until the device has connected. */
export function ConnectionBadge({ encrypted }: { encrypted: boolean | null }) {
  if (encrypted === null || encrypted === undefined) return <span className="text-muted-foreground">—</span>
  return encrypted ? (
    <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" aria-hidden="true" />HTTPS</Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-amber-300 text-amber-800"><LockOpen className="h-3 w-3" aria-hidden="true" />HTTP (unencrypted)</Badge>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </Button>
  )
}

/** What the host types on the device (spec §4.4). Menu names differ a little between models. */
export function SetupCard({ setup }: { setup: DeviceSetup }) {
  const rows: { label: string; value: string; copy?: boolean }[] = [
    { label: 'Server mode', value: 'ADMS' },
    { label: 'Enable domain name', value: setup.domainName ? 'ON' : 'OFF' },
    { label: 'Server address', value: setup.serverAddress, copy: true },
    { label: 'Server port', value: String(setup.port) },
    { label: 'HTTPS', value: setup.https ? 'ON (if your model has it)' : 'OFF' },
    { label: 'Proxy server', value: 'OFF' },
  ]
  if (setup.mode === 'serial' && setup.commKey) rows.push({ label: 'Comm Key (COMM › PC Connection)', value: setup.commKey, copy: true })
  return (
    <div data-testid="setup-card" className="rounded-md border bg-muted/40 p-4">
      <p className="mb-3 text-sm">
        On the device go to <span className="font-medium">Menu › COMM › Cloud Server Setting</span> and enter:
      </p>
      <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="flex items-center gap-1 font-mono break-all">
              {r.value}
              {r.copy && <CopyButton value={r.value} label={r.label.toLowerCase()} />}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm">
        Device key: <span className="font-mono font-semibold">{setup.key}</span>
        <CopyButton value={setup.key} label="device key" />
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        The key works for one device only. Exits must never depend on the network: keep the door&apos;s exit button and fire release working.
      </p>
    </div>
  )
}
