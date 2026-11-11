'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { gymApi } from '@/lib/api/gym'
import { useDebounce } from '@/hooks/use-debounce'

/**
 * Find one member of this gym by name, e-mail or phone (`/gyms/members?q=`), for matching a device
 * user (Phase 4 import). The server checks again that the member belongs to the gym.
 */
export function MemberPicker({ id, value, onChange }: { id: string; value: string; onChange: (memberId: string, name: string) => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 400)
  const members = useQuery({
    queryKey: ['device-member-search', debounced],
    queryFn: () => gymApi.getMembers({ q: debounced, limit: 10 }),
    enabled: debounced.trim().length >= 2,
  })
  const list = members.data?.data?.members
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Find the member</Label>
      <Input id={id} placeholder="Name, email or phone" value={search} onChange={(e) => { setSearch(e.target.value); onChange('', '') }} />
      {members.isError && <p role="alert" className="text-sm text-destructive">Members could not be searched. Try again.</p>}
      {list && (
        <ul className="max-h-48 space-y-1 overflow-auto" role="listbox" aria-label="Members">
          {list.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={value === m.id}
                className={`w-full rounded px-2 py-1 text-left text-sm ${value === m.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => onChange(m.id, m.fullName)}
              >
                {m.fullName}{m.email ? ` · ${m.email}` : ''}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="text-sm text-muted-foreground">No member found.</li>}
        </ul>
      )}
    </div>
  )
}
