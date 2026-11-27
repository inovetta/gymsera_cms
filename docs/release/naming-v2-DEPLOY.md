# CMS deploy notes: `feat/naming-v2` (API contract v2)

## Order (all three together, one window)
1. **API first:** `gymsera_be` `feat/naming-v2-r2`, with its migrations, following the API's own deploy notes and
   `docs/runbooks/production-environments.md`. Check `GET /api/v1/health` shows the new commit.
2. **CMS and website right after**, in the same window. The CMS on `main` calls v1 routes (`/tenants`, `/host/listings`,
   `X-Tenant-Id`) that the v2 API no longer has; this CMS calls v2 routes the old API does not have.
3. Rollback: roll the API and both clients back together.

## Build
```
npm ci
npm run build          # next build
```
Run on the server in the site's own folder (or build elsewhere and copy `.next`, `public`, `node_modules`,
`package.json`, `server.js`, `web.config`, `next.config.*`). The site runs `server.js` under iisnode (`web.config`).

## Environment variables
- **Added:** none. **Removed:** none.
- Used as before (set per site, never copied between sites): `NEXT_PUBLIC_API_URL` (API origin only, no `/api/v1`),
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GYMSERA_APP_URL`,
  `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE`, `NODE_ENV`, `PORT`.
- `NEXT_PUBLIC_*` values are fixed at build time: build with the production values.

## IIS / hosting
- `web.config` and `server.js` are unchanged: nothing to change in IIS.
- After copying the build, touch `web.config` to restart the site (never `iisreset`).
- The CMS now sends the `X-Organization-Id` header. The v2 API allows it in CORS (`app.js` `allowedHeaders`); the API's
  `CORS_ORIGIN` must still list the CMS origin.

## After deploy
- Sign in as an admin: Organizations list loads; Review queue loads with both tabs.
- Open an organization: the Businesses tab lists its businesses; the first-business approval shows under the header
  for one waiting.
- Sign in as an owner: Businesses page lists businesses and branches.
- `https://<cms site>/iisnode/index.html` answers 404.
- Staff with several organizations choose theirs again once (the stored selection key changed).
