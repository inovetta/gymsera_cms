import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/features/status-badge'
import { getStatusColor } from '@/lib/utils'

// AUTH-07 (Prompt 1I): the backend now reports PENDING_DELETION (inside the 30-day undo window)
// and DELETED tenants/users. The CMS only DISPLAYS them (owner decision R-28 point 7): a readable
// label and a colour, never the raw enum or "Unknown".
describe('account deletion statuses in the CMS', () => {
  it('labels PENDING_DELETION and DELETED readably', () => {
    const { rerender } = render(<StatusBadge status="PENDING_DELETION" />)
    expect(screen.getByText('Pending Deletion')).toBeInTheDocument()
    rerender(<StatusBadge status="DELETED" />)
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })

  it('gives them a warning / secondary colour, not the silent default', () => {
    expect(getStatusColor('PENDING_DELETION')).toBe('warning')
    expect(getStatusColor('DELETED')).toBe('secondary')
  })
})
