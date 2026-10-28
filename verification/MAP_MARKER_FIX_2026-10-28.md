# Map marker failure — targeted diagnosis and repair

## Confirmed cause

The initially running backend had not loaded the new `/api/pets/map` route. Its process started at 20:31 on 27 October; the route file was updated at 21:17. Both direct API and Vite-proxied requests returned **HTTP 400, `{"error":"Invalid pet id"}`**. The old router interpreted `map` as `/:id`.

At that time `/api/health` returned HTTP 200, `petlostapp`, ready state 1. Tiles load independently from OpenStreetMap, explaining why the background worked while marker data failed. No index/query/privacy workaround was necessary: current source already registers `/map` before `/:id`.

Request trace: `MapScreen.load` → `getMapPets` → Axios `/api/pets/map` → Vite proxy `localhost:5000` → current pets router → `listMapPets`. Current development API configuration resolves to same-origin `/api`. Axios returns the response body directly; the component expects `markers` and `pagination`, matching the live payload.

Exact initial request: `/api/pets/map?lat=22.2825&lng=114.1897&radiusKm=3&page=1&limit=100`.

## Smallest repair

- Reload the backend process so it uses the already-correct static route. Do not change paths, weaken authorization or substitute another database.
- Marker failures now explicitly say **“Could not load report markers. Please try again.”** Useful localized network detail is retained.
- Successful zero-result responses say **“No eligible reports in this area.”**
- Leaflet tile failures have a separate localized warning. Failed tiles are tracked individually; the warning clears when they recover or unload. Tile errors do not discard report markers, and tile listeners are removed on unmount.
- All three languages updated. No visibility, grid projection, guest access, pagination or historical-location fallback changes.

## Actual HTTP/database verification

On resuming, neither original service remained running. Verification used actual Vite on `127.0.0.1:3000` and a guarded backend on port 5000 importing the current application router/controllers/security. `verifyMapReadOnly.js` disables automatic collection/index creation and rejects write HTTP methods. No database/provider mocks were used for these HTTP reads.

Initial fresh Atlas attempts failed with `MongooseServerSelectionError`; no credentials/error objects were printed. After the user confirmed active cluster/network access, sanitized diagnostics showed three DNS SRV records, successful host resolution, certificate-verified TLS, and actual MongoDB connection to `petlostapp`, ready state 1. This proves subsequent connectivity; the exact earlier transient network cause is not established and is not attributed solely to the IP list.

| Read-only check | Result |
| --- | --- |
| Health direct and through Vite | HTTP 200, petlostapp, connected, ready state 1 |
| Exact original request, direct and proxied | HTTP 200, three markers, total three |
| Same origin, 20 km | HTTP 200, four markers, total four |
| Limit one, pages one/two | HTTP 200; distinct items, stable total three, hasMore true |
| Public empty area | HTTP 200; zero markers, total zero |
| Missing coordinates / limit 101 | HTTP 400 with `MAP_QUERY_INVALID`, proving static route handling |
| Recursive response audit | No contact/owner/internal-distance/moderation/provider-secret fields; every marker location labelled approximate |
| Actual frontend route/API module | HTTP 200; getMapPets wrapper and direct body parsing present |
| Caching | `private, no-store, max-age=0` |
| Database writes | Guarded backend shutdown recorded zero write/index commands |

The temporary read-only backend and Vite were stopped afterward. It is intentionally not left running as a restricted replacement for the normal application. Normal development restart: `npm --prefix server start`, and separately `npm run dev`.

## Targeted automated checks

- 142 frontend tests passed in MapScreen, MapView and API request-context files. New cases cover the exact HTTP-400 error shape, error versus empty, independent tile errors/recovery, retained markers, listener disposal and all three locales. Axios transport and Leaflet are mocked here; these do not replace the real HTTP evidence above.
- Three backend route/DTO/query tests passed, including guest and role checks and an explicit `/map` validation-versus-`/:id` regression. Database operations in these unit tests are mocked.
- TypeScript, ESLint, production build and changed backend syntax checks passed. Existing main-bundle warning remains.
- No full suites, browser automation, seeds, fixtures inserted into Atlas, migrations, uploads, provider operations or record changes. Runtime environment files unchanged. No commit/push.
- Specialist follow-up review was attempted but unavailable due to its usage limit; no specialist approval is claimed. No new security/privacy architecture was introduced.

## Files touched in this follow-up

`src/views/MapScreen.vue`, `src/components/MapView.vue`, the three locale JSON files, `src/views/__tests__/MapScreen.test.ts`, `src/components/__tests__/MapView.test.ts`, `server/tests/petMapQuery.test.js`, new `server/scripts/verifyMapReadOnly.js`, `AUDIT_FINDINGS_CHECKLIST.md` and this report. Earlier uncommitted UI work remains preserved. Configured-secret/index scan passed across 316 worktree text files and 346 tracked-index files; zero secret findings or tracked runtime environment files. `git diff --check` passed. Nothing was committed or pushed.
