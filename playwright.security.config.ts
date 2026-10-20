import { defineConfig, devices } from '@playwright/test';

// SEC-14 / SEC-18: runs against the PRODUCTION build (`npm run build` first), because the CSP differs in
// `next dev` (unsafe-eval) and prerendering is what the nonce must survive.
const PORT = Number(process.env.SECURITY_E2E_PORT || 3012);

export default defineConfig({
  testDir: './e2e',
  testMatch: /security-headers\.spec\.ts/,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
