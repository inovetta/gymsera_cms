'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { devicesApi } from '@/lib/api/devices'
import { describeRequestError } from '@/lib/api/request-errors'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { useGymAccess } from '@/hooks/use-gym-access'
import { useToast } from '@/hooks/use-toast'

/**
 * Door access for a team member (owner decision D-8): with it on, the person is put on the access
 * devices of that branch as a plain user (never a device administrator), without a package.
 * One switch per branch they work at; changing it needs "Add and manage access devices" there.
 */
export function StaffDoorAccess({ userId }: { userId: string }) {
  const { organization } = useGymAccess()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const mayView = holdsPermission(organization, 'devices.view', 'branch')
  const query = useQuery({
    queryKey: ['staff-door-access', userId],
    queryFn: () => devicesApi.staffAccess(userId),
    enabled: mayView && !!userId,
  })
  const save = useMutation({
    mutationFn: ({ staffId, on }: { staffId: string; on: boolean }) => devicesApi.setStaffAccess(staffId, on),
    onSuccess: (_res, { on }) => {
      void queryClient.invalidateQueries({ queryKey: ['staff-door-access', userId] })
      toast({ title: on ? 'Door access on. The devices of that branch get this person shortly.' : 'Door access off. This person is taken off the devices.' })
    },
    onError: (err) => toast({ title: describeRequestError(err, 'Door access could not be changed.'), variant: 'destructive' }),
  })
  if (!mayView) return null
  const staff = query.data?.data?.staff
  if (!staff || staff.length === 0) return null
  return (
    <section aria-label="Door access" className="space-y-2 rounded-md border p-3" data-testid="staff-door-access">
      <div>
        <p className="text-sm font-medium">Door access</p>
        <p className="text-xs text-muted-foreground">Let this person through the branch&apos;s access devices without a package.</p>
      </div>
      {staff.map((s) => (
        <div key={s.staffId} className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor={`door-${s.staffId}`}>{s.branchName ?? 'Branch'}{!s.active && ' (not active)'}</label>
          <Switch
            id={`door-${s.staffId}`}
            checked={s.deviceAccess}
            disabled={!holdsAtBranch(organization, s.branchId, 'devices.manage') || save.isPending}
            onCheckedChange={(on) => save.mutate({ staffId: s.staffId, on })}
          />
        </div>
      ))}
    </section>
  )
}
