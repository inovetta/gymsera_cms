'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Upload } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { ErrorState } from '@/components/features/error-state'
import { EmptyState } from '@/components/features/empty-state'
import { NoAccess } from '@/components/features/no-access'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MemberPicker } from '@/components/features/devices/member-picker'
import { BIO_TYPE_LABEL, CSV_ERROR_TEXT, IMPORT_STATUS_LABEL, importConflictText } from '@/components/features/devices/device-copy'
import { DeviceImport, ImportMappingError, ImportUser, ImportUserFilter, devicesApi } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch } from '@/lib/access/menu'
import { formatDate } from '@/lib/utils'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

const PAGE = 50
const OPEN = ['querying', 'ready', 'applied']
const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm'

const templatesText = (t: ImportUser['templates']): string => {
  const parts = Object.entries(t).map(([type, n]) => `${BIO_TYPE_LABEL[Number(type)] ?? 'Template'} ×${n}`)
  return parts.length ? parts.join(', ') : 'None'
}

/**
 * Import from device (ZKTeco spec §15 Phase 4): for a device GymBioSync managed. GymsEra reads its users
 * and faces or fingerprints (nothing on the device changes), the host matches each device user to a
 * member (CSV or one by one), checks the preview, and applies. The device keeps letting people in as it
 * did until the host goes live on the cut-over page.
 */
export default function DeviceImportPage() {
  const { id } = useParams<{ id: string }>()
  const { organization, contextLoading } = useGymAccess()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<ImportUserFilter>('all')
  const [offset, setOffset] = useState(0)
  const [matching, setMatching] = useState<ImportUser | null>(null)
  const [memberId, setMemberId] = useState('')
  const [csvErrors, setCsvErrors] = useState<ImportMappingError[] | null>(null)
  const [confirm, setConfirm] = useState<'apply' | 'rollback' | 'cancel' | null>(null)

  const deviceQuery = useQuery({ queryKey: ['device', id], queryFn: () => devicesApi.get(id), enabled: !!id && !!organization })
  const device = deviceQuery.data?.data?.device
  const importsQuery = useQuery({
    queryKey: ['device-imports', id],
    queryFn: () => devicesApi.imports(id),
    enabled: !!device,
    refetchInterval: (q) => (q.state.data?.data?.imports?.[0]?.status === 'querying' ? 2000 : false),
  })
  const latest: DeviceImport | undefined = importsQuery.data?.data?.imports?.[0]
  const current = latest && OPEN.includes(latest.status) ? latest : undefined
  const usersQuery = useQuery({
    queryKey: ['device-import-users', id, current?.id, filter, offset],
    queryFn: () => devicesApi.importUsers(id, current!.id, { filter, limit: PAGE, offset }),
    enabled: !!current && current.status !== 'querying',
  })
  const previewQuery = useQuery({
    queryKey: ['device-import-preview', id, current?.id],
    queryFn: () => devicesApi.importPreview(id, current!.id),
    enabled: !!current && current.status !== 'querying',
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['device-imports', id] })
    void queryClient.invalidateQueries({ queryKey: ['device-import-users', id] })
    void queryClient.invalidateQueries({ queryKey: ['device-import-preview', id] })
    void queryClient.invalidateQueries({ queryKey: ['device', id] })
    void queryClient.invalidateQueries({ queryKey: ['device-cutover', id] })
  }
  const onError = (fallback: string) => (err: unknown) => toast({ title: describeRequestError(err, fallback), variant: 'destructive' })

  const start = useMutation({
    mutationFn: () => devicesApi.startImport(id),
    onSuccess: () => { refresh(); toast({ title: 'Reading the users on the device. This takes a minute or two.' }) },
    onError: onError('The import could not be started.'),
  })
  const match = useMutation({
    mutationFn: (v: { pin: string; memberId?: string | null; removeAtGoLive?: boolean }) =>
      devicesApi.matchImportUser(id, current!.id, v.pin, { ...(v.memberId !== undefined && { memberId: v.memberId }), ...(v.removeAtGoLive !== undefined && { removeAtGoLive: v.removeAtGoLive }) }),
    onSuccess: () => { setMatching(null); setMemberId(''); refresh() },
    onError: onError('The match could not be saved.'),
  })
  const upload = useMutation({
    mutationFn: (csv: string) => devicesApi.uploadImportMapping(id, current!.id, csv),
    onSuccess: (res) => {
      setCsvErrors(res.data.errors)
      toast({ title: `${res.data.matched} device user${res.data.matched === 1 ? '' : 's'} matched${res.data.errors.length ? `, ${res.data.errors.length} line${res.data.errors.length === 1 ? '' : 's'} not` : ''}` })
      refresh()
    },
    onError: onError('The file could not be read.'),
  })
  const act = useMutation({
    mutationFn: (what: 'apply' | 'rollback' | 'cancel') =>
      what === 'apply' ? devicesApi.applyImport(id, current!.id) : what === 'rollback' ? devicesApi.rollbackImport(id, current!.id) : devicesApi.cancelImport(id, current!.id),
    onSuccess: (_res, what) => {
      setConfirm(null)
      refresh()
      toast({
        title: what === 'apply' ? 'Applied. Nothing changes on the device until you go live.'
          : what === 'rollback' ? 'Rolled back. The device was not changed.' : 'Import cancelled. GymsEra manages the device again.',
      })
    },
    onError: onError('That did not work.'),
  })

  const readFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > 1024 * 1024) {
      toast({ title: 'The file is over 1 MB. Split it and upload each part.', variant: 'destructive' })
      return
    }
    void file.text().then((text) => upload.mutate(text))
  }

  const back = (
    <Link href={`/gym/devices/${id}`} className="inline-flex items-center text-sm text-primary hover:underline">
      <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Back to the device
    </Link>
  )
  if (deviceQuery.error) return <><Header title="Import from device" /><div className="space-y-4 p-6">{back}<ErrorState error={deviceQuery.error} what="this device" onRetry={() => deviceQuery.refetch()} /></div></>
  if (contextLoading || !device) return <><Header title="Import from device" /><div className="space-y-4 p-6">{back}<Skeleton className="h-40 w-full" /></div></>
  if (!holdsAtBranch(organization, device.branchId, 'devices.view')) return <><Header title="Import from device" /><div className="p-6"><NoAccess what="this device's import" needs="View access devices" /></div></>
  const mayManage = holdsAtBranch(organization, device.branchId, 'devices.manage')
  const editable = current?.status === 'ready' && mayManage
  const preview = previewQuery.data?.data?.preview
  const users = usersQuery.data?.data

  return (
    <>
      <Header title="Import from device" />
      <div className="space-y-4 p-6">
        {back}
        <PageHeader
          title={`Import from ${device.name ?? device.key}`}
          description="For a device that GymBioSync managed: keep its users and their faces or fingerprints, with no gap at the door."
        />
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Nothing on the device changes during the import</AlertTitle>
          <AlertDescription>
            The device keeps letting people in exactly as GymBioSync left it. GymsEra only reads it. Changes start when you go live on the{' '}
            <Link className="text-primary underline" href={`/gym/devices/${id}/cutover`}>cut-over page</Link>.
          </AlertDescription>
        </Alert>

        {importsQuery.error ? <ErrorState error={importsQuery.error} what="the import" onRetry={() => importsQuery.refetch()} /> : !importsQuery.data ? <Skeleton className="h-24 w-full" /> : !current ? (
          <Card>
            <CardHeader>
              <CardTitle>1. Read the device</CardTitle>
              <CardDescription>
                {latest ? `Last import: ${IMPORT_STATUS_LABEL[latest.status] ?? latest.status} (${formatDate(latest.startedAt)}).` : 'GymsEra reads every user and every face or fingerprint on the device.'}
                {device.connection !== 'online' && ' The device must be online.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mayManage
                ? <Button loading={start.isPending} disabled={device.connection !== 'online'} onClick={() => start.mutate()}>{latest ? 'Import again' : 'Start import'}</Button>
                : <p className="text-sm text-muted-foreground">Ask a manager or the owner to start the import.</p>}
            </CardContent>
          </Card>
        ) : current.status === 'querying' ? (
          <Card data-testid="import-reading">
            <CardHeader>
              <CardTitle>Reading the device…</CardTitle>
              <CardDescription>{current.counts.users} users and {current.counts.templates} faces or fingerprints so far. This page updates by itself.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card data-testid="import-summary">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Read from the device <Badge variant="outline">{IMPORT_STATUS_LABEL[current.status] ?? current.status}</Badge>
                </CardTitle>
                <CardDescription>
                  {current.counts.users} users, {current.counts.templates} faces or fingerprints · {current.counts.matched} matched, {current.counts.unmatched} not matched,
                  {' '}{current.counts.admins} device administrator{current.counts.admins === 1 ? '' : 's'} (left as they are)
                  {current.counts.conflicts ? ` · ${current.counts.conflicts} need a decision` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {current.truncated && <p role="alert" className="text-amber-900">The device has more users or templates than one import takes. The rest were not read.</p>}
                {current.counts.templatesTooLarge > 0 && <p className="text-amber-900">{current.counts.templatesTooLarge} template{current.counts.templatesTooLarge === 1 ? ' was' : 's were'} too large to import.</p>}
                {editable && <Button size="sm" variant="outline" onClick={() => setConfirm('cancel')}>Cancel import</Button>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Match device users to members</CardTitle>
                <CardDescription>
                  Upload a CSV with the columns <span className="font-mono">pin</span> and <span className="font-mono">member_id</span>, <span className="font-mono">email</span> or <span className="font-mono">phone</span>, or match them one by one. Members keep their device PIN.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {editable && (
                  <div>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="CSV file" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = '' }} />
                    <Button variant="outline" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-1 h-4 w-4" aria-hidden="true" />Upload CSV
                    </Button>
                  </div>
                )}
                {csvErrors && csvErrors.length > 0 && (
                  <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="csv-errors">
                    <p className="font-medium">Lines not matched</p>
                    <ul className="mt-1 space-y-0.5">
                      {csvErrors.slice(0, 50).map((e) => <li key={e.line}>Line {e.line}{e.pin ? ` (PIN ${e.pin})` : ''}: {CSV_ERROR_TEXT[e.reason] ?? 'Not matched'}</li>)}
                    </ul>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Show</span>
                  <select aria-label="Filter device users" className={selectClass} value={filter} onChange={(e) => { setFilter(e.target.value as ImportUserFilter); setOffset(0) }}>
                    <option value="all">Everyone</option>
                    <option value="unmatched">Not matched</option>
                    <option value="matched">Matched</option>
                    <option value="conflict">Need a decision</option>
                    <option value="remove">Removed at go-live</option>
                    <option value="admin">Device administrators</option>
                  </select>
                </label>
                {usersQuery.error ? <ErrorState error={usersQuery.error} what="the device users" onRetry={() => usersQuery.refetch()} /> : !users ? <Skeleton className="h-32 w-full" /> : users.users.length === 0 ? (
                  <EmptyState title="Nobody here" description="No device user matches this filter." />
                ) : (
                  <>
                    <Table data-testid="import-users">
                      <TableHeader>
                        <TableRow><TableHead>PIN</TableHead><TableHead>Name on device</TableHead><TableHead>Faces / fingerprints</TableHead><TableHead>Member</TableHead><TableHead>At go-live</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.users.map((u) => (
                          <TableRow key={u.pin}>
                            <TableCell className="font-mono">{u.pin}</TableCell>
                            <TableCell>{u.name ?? '—'}{u.isAdmin && <div className="text-xs text-muted-foreground">Device administrator: left as it is</div>}</TableCell>
                            <TableCell className="text-sm">{templatesText(u.templates)}</TableCell>
                            <TableCell className="text-sm">
                              {u.memberId ? (u.memberName ?? 'Member') : <span className="text-muted-foreground">Not matched</span>}
                              {u.conflict && <div className={`mt-1 text-xs ${u.blocking ? 'text-destructive' : 'text-amber-900'}`}>{importConflictText(u.conflict, u.memberPin)}</div>}
                              {editable && !u.isAdmin && (
                                <div className="mt-1 flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => setMatching(u)}>{u.memberId ? 'Change' : 'Match'}</Button>
                                  {u.memberId && <Button size="sm" variant="ghost" loading={match.isPending && match.variables?.pin === u.pin} onClick={() => match.mutate({ pin: u.pin, memberId: null })}>Unmatch</Button>}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {u.isAdmin ? <span className="text-sm text-muted-foreground">Stays</span> : (
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={u.removeAtGoLive}
                                    disabled={!editable}
                                    aria-label={`Remove device user ${u.pin} at go-live`}
                                    onChange={(e) => match.mutate({ pin: u.pin, removeAtGoLive: e.target.checked })}
                                  />
                                  Remove
                                </label>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {users.total > PAGE && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{offset + 1} to {Math.min(offset + PAGE, users.total)} of {users.total}</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
                          <Button size="sm" variant="outline" disabled={offset + PAGE >= users.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card data-testid="import-preview">
              <CardHeader>
                <CardTitle>3. Check and apply</CardTitle>
                <CardDescription>Apply stores the matches in GymsEra. The device still does not change.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {previewQuery.error ? <ErrorState error={previewQuery.error} what="the preview" onRetry={() => previewQuery.refetch()} /> : !preview ? <Skeleton className="h-20 w-full" /> : (
                  <>
                    <ul className="space-y-1">
                      <li>{preview.willStore.identities} member{preview.willStore.identities === 1 ? '' : 's'} keep their device PIN</li>
                      <li>{preview.willStore.templates} face{preview.willStore.templates === 1 ? '' : 's'} or fingerprints stored (consent on file)</li>
                      {preview.willStore.templatesPending > 0 && <li>{preview.willStore.templatesPending} waiting for consent: {preview.consentNeeded.map((c) => c.memberName ?? `PIN ${c.pin}`).join(', ')}. They stay on this device only, for 7 days after go-live.</li>}
                      {preview.willStore.alreadyEnrolled > 0 && <li>{preview.willStore.alreadyEnrolled} already in GymsEra (kept as they are)</li>}
                      <li>{preview.skipped.unmatched} not matched: they stay on the device as they are</li>
                      {preview.atGoLive.removePins.length > 0 && <li>Removed from the device at go-live: PIN {preview.atGoLive.removePins.join(', ')}</li>}
                      {preview.atGoLive.notEntitled > 0 && <li>{preview.atGoLive.notEntitled} matched member{preview.atGoLive.notEntitled === 1 ? ' has' : 's have'} no active package: removed by the check after go-live</li>}
                      {preview.capacity.percent !== null && <li>Device after go-live: {preview.capacity.users} of {preview.capacity.maxUsers} users ({preview.capacity.percent}%)</li>}
                    </ul>
                    {preview.blocking.length > 0 && (
                      <p role="alert" className="text-destructive">
                        {preview.blocking.length} device user{preview.blocking.length === 1 ? ' needs' : 's need'} a decision first (PIN {preview.blocking.map((b) => b.pin).join(', ')}).
                      </p>
                    )}
                    {current.status === 'ready' && mayManage && (
                      <Button disabled={preview.blocking.length > 0} onClick={() => setConfirm('apply')}>Apply</Button>
                    )}
                    {current.status === 'applied' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-green-100 text-green-800">Applied {current.appliedAt ? formatDate(current.appliedAt) : ''}</Badge>
                        <Link className="text-primary underline" href={`/gym/devices/${id}/cutover`}>Continue to the cut-over</Link>
                        {mayManage && <Button size="sm" variant="outline" onClick={() => setConfirm('rollback')}>Roll back</Button>}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={matching !== null} onOpenChange={(open) => { if (!open) { setMatching(null); setMemberId('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Match device user {matching?.pin}{matching?.name ? ` (${matching.name})` : ''}</DialogTitle>
            <DialogDescription>The member keeps this device PIN, so the face or fingerprint already on the device stays theirs.</DialogDescription>
          </DialogHeader>
          <MemberPicker id="import-member-search" value={memberId} onChange={(mid) => setMemberId(mid)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatching(null)}>Cancel</Button>
            <Button disabled={!memberId} loading={match.isPending} onClick={() => matching && match.mutate({ pin: matching.pin, memberId })}>Match</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === 'apply' ? 'Apply the import?' : confirm === 'rollback' ? 'Roll back the import?' : 'Cancel the import?'}</DialogTitle>
            <DialogDescription>
              {confirm === 'apply' && 'Matched members keep their device PIN and their faces or fingerprints are stored, encrypted. Nothing changes on the device until you go live.'}
              {confirm === 'rollback' && 'What the import stored in GymsEra is deleted. The device is not changed and stays in import.'}
              {confirm === 'cancel' && 'The device leaves the import and GymsEra starts managing it at once. Only do this for a device without GymBioSync users.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Back</Button>
            <Button variant={confirm === 'apply' ? 'default' : 'destructive'} loading={act.isPending} onClick={() => confirm && act.mutate(confirm)}>
              {confirm === 'apply' ? 'Apply' : confirm === 'rollback' ? 'Roll back' : 'Cancel import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
