'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { NoAccess } from '@/components/features/no-access'
import { Skeleton } from '@/components/ui/skeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnectionBadge, DeviceStatusBadge, DIRECTION_LABEL } from '@/components/features/devices/device-ui'
import { LiveFeed } from '@/components/features/devices/device-tabs'
import { PushProgress } from '@/components/features/devices/push-progress'
import { describeRequestError } from '@/lib/api/request-errors'
import { useToast } from '@/hooks/use-toast'
import { AccessDevice, devicesApi } from '@/lib/api/devices'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { useGymAccess } from '@/hooks/use-gym-access'

/**
 * Access devices (ZKTeco spec §10.1, §10.5): every face / fingerprint / card terminal of the branches
 * the user may see, with its live status (refreshed every 10 seconds). For one branch: Push to
 * branch (every pending change now) and the branch's live check-ins. Links to Unlinked users and
 * Device settings.
 */
export default function DevicesPage() {
  const { organization, contextLoading } = useGymAccess()
  const [branchId, setBranchId] = useState('')
  const [push, setPush] = useState<string | null>(null)
  const { toast } = useToast()
  const mayView = holdsPermission(organization, 'devices.view', 'branch')
  const mayAdd = holdsPermission(organization, 'devices.manage', 'branch')
  const branches = (organization?.branches ?? []).filter((b) => holdsAtBranch(organization, b.id, 'devices.view'))

  const query = useQuery({
    queryKey: ['devices', branchId || 'all'],
    queryFn: () => devicesApi.list(branchId || undefined),
    enabled: mayView && !!organization,
    refetchInterval: 10000,
  })
  // One branch in view: the selected one, or the only one.
  const focusBranch = branchId || (branches.length === 1 ? branches[0].id : '')
  const pushBranch = useMutation({
    mutationFn: () => devicesApi.pushBranch(focusBranch),
    onSuccess: (res) => setPush(res.data.requestId),
    onError: (err) => toast({ title: describeRequestError(err, 'The branch could not be pushed.'), variant: 'destructive' }),
  })

  if (!organization && contextLoading) {
    return (
      <>
        <Header title="Access devices" />
        <div className="p-6"><Skeleton className="h-24 w-full" /></div>
      </>
    )
  }
  if (!mayView) {
    return (
      <>
        <Header title="Access devices" />
        <div className="p-6"><NoAccess what="access devices" needs="View access devices" /></div>
      </>
    )
  }

  const columns: Column<AccessDevice>[] = [
    {
      key: 'name',
      header: 'Device',
      cell: (d) => <Link href={`/gym/devices/${d.id}`} className="font-medium text-primary hover:underline">{d.name ?? d.key}</Link>,
    },
    { key: 'branch', header: 'Branch', cell: (d) => d.branchName ?? '—' },
    { key: 'direction', header: 'Direction', cell: (d) => (d.direction ? DIRECTION_LABEL[d.direction] : '—') },
    { key: 'status', header: 'Status', cell: (d) => <DeviceStatusBadge device={d} /> },
    { key: 'model', header: 'Model', cell: (d) => (d.model ? `${d.model}${d.firmware ? ` · ${d.firmware}` : ''}` : '—') },
    { key: 'connection', header: 'Connection', cell: (d) => <ConnectionBadge encrypted={d.encrypted} /> },
  ]

  return (
    <>
      <Header title="Access devices" />
      <div className="space-y-4 p-6">
        <PageHeader
          title="Access devices"
          description="Face, fingerprint and card terminals at your branches"
          action={mayAdd ? (
            <Link href="/gym/devices/new" className={buttonVariants()}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add device
            </Link>
          ) : undefined}
        />
        {branches.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="devices-branch" className="font-medium">Branch</label>
            <select
              id="devices-branch"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/gym/devices/unlinked" className="text-primary hover:underline">Unlinked device users</Link>
          <Link href="/gym/devices/settings" className="text-primary hover:underline">Device settings</Link>
          {focusBranch && holdsAtBranch(organization, focusBranch, 'devices.push') && (
            <Button size="sm" variant="outline" className="ml-auto" loading={pushBranch.isPending} onClick={() => pushBranch.mutate()}>
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />Push to branch
            </Button>
          )}
        </div>
        {push && <PushProgress requestId={push} title="Push to branch" />}
        <DataTable
          columns={columns}
          data={query.data?.data?.devices ?? []}
          loading={query.isLoading}
          error={query.error}
          errorWhat="the device list"
          onRetry={() => query.refetch()}
          emptyTitle="No access devices yet"
          emptyDescription="Add a face, fingerprint or card terminal to a branch. GymsEra gives you the settings to enter on it."
        />
        {focusBranch && (query.data?.data?.devices ?? []).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Live check-ins</CardTitle></CardHeader>
            <CardContent><LiveFeed branchId={focusBranch} /></CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
