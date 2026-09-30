import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProvisioningStatus } from '@/components/features/provisioning-status';
import type { TenantProvisioning } from '@/types';

// FLOW-02: the admin sees "Provisioning… (step n/6)" and Resume, exactly as the API reports.
const p = (over: Partial<TenantProvisioning> = {}): TenantProvisioning => ({
  state: 'LISTING_CREATED', step: 3, totalSteps: 6, inProgress: false, lockedUntil: null,
  lastError: null, canResume: true, ...over,
});

describe('ProvisioningStatus', () => {
  it('stopped run: shows the step, the last error and a Resume button that calls onResume', () => {
    const onResume = vi.fn();
    render(<ProvisioningStatus status="APPROVED" provisioning={p({ lastError: 'branch insert timed out' })} onResume={onResume} />);
    expect(screen.getByText(/stopped at step 3\/6 \(next: Create gym and main branch\)/)).toBeInTheDocument();
    expect(screen.getByText(/branch insert timed out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('run in progress: shows the step, no Resume button', () => {
    render(
      <ProvisioningStatus status="APPROVED" provisioning={p({ inProgress: true, canResume: false, lockedUntil: new Date().toISOString() })}
        onResume={() => {}} />
    );
    expect(screen.getByText(/Provisioning… \(step 3\/6 done/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
  });

  it('never started (approved before FLOW-02): offers Resume', () => {
    render(<ProvisioningStatus status="APPROVED" provisioning={p({ state: null, step: 0 })} onResume={() => {}} />);
    expect(screen.getByText(/provisioning has not run yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  it('the server says Resume is not allowed → no button', () => {
    render(<ProvisioningStatus status="APPROVED" provisioning={p({ canResume: false })} onResume={() => {}} />);
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
  });

  it('renders nothing for a tenant that is not APPROVED, or without provisioning data', () => {
    const { container, rerender } = render(<ProvisioningStatus status="ACTIVE" provisioning={p({ state: 'ACTIVE', step: 6 })} onResume={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ProvisioningStatus status="APPROVED" provisioning={undefined} onResume={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
