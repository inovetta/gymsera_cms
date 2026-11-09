import '@testing-library/jest-dom';

// R-99 (P11d): the API offers payouts only when PAYOUTS_ENABLED is "true" (off by default). The
// existing suites test the payout screens themselves, so every test starts with payouts on; the
// switch's own tests (tests/components/p11d-payouts-flag.test.tsx) set it per test. A spy, so each
// test's own vi.restoreAllMocks() leaves nothing behind; it is set again before the next test.
import { beforeEach, vi } from 'vitest'
import { appConfigApi } from '@/lib/api/app-config'

beforeEach(() => {
  vi.spyOn(appConfigApi, 'get').mockResolvedValue({
    success: true,
    message: 'ok',
    data: { minAppVersion: { ios: null, android: null }, storeUrls: { ios: null, android: null }, features: { payouts: true } },
  } as never)
})
