import { describe, it, expect, vi, afterEach } from 'vitest';
import apiClient from '@/lib/api/client';
import { adminApi } from '@/lib/api/admin';

// FLOW-02: approve / resume sends an Idempotency-Key so a repeated click replays the first answer.
describe('adminApi.approveTenant', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POSTs to the approve endpoint with the Idempotency-Key header and the photo check (R-84)', async () => {
    const body = { success: true, data: { tenant: { id: 't1' }, provisioning: { step: 6 } } };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: body } as never);
    const res = await adminApi.approveTenant('t1', 'key-123', { photosChecked: true });
    expect(post).toHaveBeenCalledWith('/admin/tenants/t1/approve', { photosChecked: true }, { headers: { 'Idempotency-Key': 'key-123' } });
    expect(res).toEqual(body);
  });
});
