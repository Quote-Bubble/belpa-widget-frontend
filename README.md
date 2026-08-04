# belpa-widget-frontend

The frontend of Belpa: an embeddable, address-first roof-quote flow for UK
roofing websites. A homeowner types an address, traces their roof on satellite
imagery, and gets an indicative price range. Completed leads are submitted to
the backend for webhook delivery.

All Google Solar / Geocoding calls and lead delivery go through the separate
`belpa-api-backend` service over HTTP; this app holds no server-side keys. The
pricing model, roof geometry and flow logic in `lib/` and `config/rates.ts`
run in the browser and are canonical here.

## Run

Copy `.env.example` to `.env.local`, add the public Maps key, then:

```bash
npm install
npm run dev   # http://localhost:3000
```

Run `belpa-api-backend` alongside it on port 3001 (its default), which matches
`NEXT_PUBLIC_BELPA_API_URL` in `.env.example`.

## Routes

- `/` - development host for the compact, embeddable quote bubble.
- `/quote` - full-page version of the quote flow.
- `/dev` - measurement workbench for development and data investigation
  (404s in production unless `ENABLE_DEV_LAB=true`).

## Tests

```bash
npm test
```

Vitest covers the quote flow, pricing, geometry and access logic. The
`scripts/drive-*.js` files are Playwright drivers for walking the UI flows
manually.

## Where this code came from

Split out of `belpa-bubble-frontend-backend` (kept as a backup). The only
functional change from the original is that API calls go through
`lib/api.ts` (`NEXT_PUBLIC_BELPA_API_URL`) instead of same-origin routes.
`lib/types.ts`, `lib/roof-geometry.ts` and `lib/roof-lines.ts` also exist as
copies in `belpa-api-backend` for its verification script; this repo is canonical.
