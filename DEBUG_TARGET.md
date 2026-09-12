# DEBUG_TARGET — Stabilization Audit

## Current Milestone Status
1. Auth & Session Persistence — Completed.
2. Leaflet Map + Live GPS + 2dsphere — Completed.
3. Sighting Reports & History Timeline — Completed.
4. Smart Match Engine — Completed.
5. Capacitor Native Wrappers — Partial (Android done; iOS not generated — requires macOS).

## Root Cause Analysis
- **"Network Error"** = two stacked problems:
  1. Both dev servers had been stopped after an environment reset → Axios could not reach `http://localhost:5000/api` (connection refused → Axios "Network Error").
  2. Once the backend was up, `GET /api/pets` (also `/pets/mine`, `/pets/sightings/mine`) returned **500** because Cosmos DB rejects `.sort({ createdAt: -1 })` ("order-by item is excluded"); these three queries lacked the JS-sort fallback the other controllers already had.
- Minor: unused `pnpm.overrides` in `package.json`; Android scaffolded test references `com.getcapacitor.app` instead of `com.pawradar.app`.

## Target Files to Fix
- `server/controllers/petController.js` (order-by fallback — edited, uncommitted)
- `src/App.vue`, `src/style.css` (nav redesign — edited, uncommitted)
- `package.json` (drop `pnpm.overrides.hono`)
- `android/app/src/androidTest/.../ExampleInstrumentedTest.java` (appId mismatch)

## Fix Checklist
- [x] Restart backend + frontend; confirm `/api/pets` → 200.
- [x] `npx vue-tsc --noEmit` clean; `npm run build` clean.
- [ ] Commit pending changes (`git add -A && git commit`).
- [ ] Remove unused `pnpm.overrides` from `package.json`.
- [ ] Fix Android test `appId` (or delete the sample test).
- [ ] Generate iOS on a Mac (`npx cap add ios && npx cap sync`).