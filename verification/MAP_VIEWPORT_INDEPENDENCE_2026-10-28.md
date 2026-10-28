# Dedicated Map / Radar independence

## Cause and repair

`App.vue` passed the shared radius, species, district and GPS centre into `MapScreen`; its watcher reloaded Map after Radar changes. Map therefore inherited Radar's area instead of owning a viewport. Reactivation also reset loaded Map pages.

- Map now takes only `active`. Its centre, zoom, query bounds, results and pagination are local state.
- Initial overview fits the supported Hong Kong region: west 113.82, south 22.15, east 114.50, north 22.57. These are browsing bounds, never stored report locations.
- Map queries the visible viewport intersected with that explicitly labelled coverage. This keeps portrait overview views from accidentally querying the world. Outside Hong Kong it clears stale markers and explains the coverage, issuing no query.
- Pan/zoom changes debounce for 300 ms, abort obsolete queries and load the new area's first page. Search this area refreshes the current viewport. Load more retrieves another page of the same area. Tab switching retains Map camera/results/pages and Radar's selected radius/results.
- Radar's radius control has a separate `radarRadiusKm` ref and handler. Choosing it no longer changes account alert/rescue preferences. Those existing preference controls retain their own value/handler. Map does not receive either radius or Radar filters/GPS.

## API and privacy

`GET /api/pets/map?west=…&south=…&east=…&north=…&page=1&limit=100` is the Map contract. All four ordered bounds are required; mixing them with `lat/lng/radiusKm` is rejected. Existing radius-mode clients remain compatible.

Only public 750-metre cell centres determine viewport membership, totals and pagination. Exact-coordinate `$geoNear` remains an internal conservative candidate prefilter. Candidate radius is capped at 50 km; full Hong Kong bounds require about 46,045 metres. Unsupported/oversized query bounds fail validation; no silent distance clamp or source-record sampling. Existing 10-second deadline, no-disk-spill, 100-item page size and 10,000-page bound remain. At the reachable page limit Map tells the user to zoom in rather than claiming a complete download.

Viewport responses contain `bounds`, not a Radar radius. Lost/sighted, moderation/visibility, deliberate emergency-discovery blocking policy, own-post exclusion and minimal public DTO remain unchanged. No schema/index change or historical-location rewrite. Stored report locations and the documented historical fallback remain intact.

## Focused verification

| Check | Result / boundary |
| --- | --- |
| Frontend targeted set | 171 passed across MapScreen, MapView, App integration, viewport utility and API authentication-context files; mocked network/Leaflet, not browser verification. |
| Final strengthened App/Map tests | 35 passed; moved Map area survives Radar radius change and tab switches; Radar requests/results change while Map requests, camera, markers and pagination remain unchanged. |
| Backend focused unit/Express | Five passed; real routing/JWT with database mocked. Covers bounds validation, legacy-radius compatibility and public DTO/policy. |
| Actual disposable MongoDB | Six passed (five nested cases plus suite), zero skipped. 815 records paginate uniquely; 130 whole-response viewport edge/corner invariance comparisons across roles/pages; 90 existing radius invariance comparisons retained. Actual sighting transaction preserves original report point. |
| TypeScript / ESLint / build / syntax | Passed. Existing large main-chunk warning remains. |
| Read-only live Atlas | Updated router/controllers on temporary port 5001 connected to exactly petlostapp; health HTTP 200/state 1. Four overview reports paged uniquely; south viewport three, north viewport one. Recursive public response inspection passed. |
| Independent Radar API reads | Radii 1/5/10/15/20 km returned 1/4/4/5/5 Radar records. Repeating the unchanged Map overview query after those requests produced an identical response. Radar and Map retain their existing different eligibility contracts; equal counts are not assumed. |

Initial utility test exposed floating-point drift in repeated-world longitude normalization; stabilizing query bounds to nine decimal places fixed it without relaxing the assertion. No broader suites/browser review were run. The final App assertion was strengthened to start with a moved/zoomed Map rather than only its initial overview; targeted tests reran after that change.

## Live verification limits and teardown

The user's existing backend on port 5000 remains healthy but still has the earlier radius-only Map implementation in memory; its bounds request returns `MAP_QUERY_INVALID`. **Restart that backend once to load the updated viewport API.** The existing frontend and backend processes were left untouched. The updated service was verified separately using `verifyMapReadOnly.js` with port 5001, automatic collection/index creation disabled and HTTP writes rejected.

The sandboxed fresh connection failed with EACCES; an outside-sandbox attempt timed out. Sanitized DNS/TLS diagnostics then passed (three SRV servers, verified TLS) and a fresh connection succeeded. No claim is made that the earlier timeout proves an Atlas IP-list defect. The temporary port-5001 process was stopped and the port checked closed. Its final write-counter shutdown line was not captured from the inline PowerShell pipeline; do not claim a completed final command-monitor audit. Verification issued only GETs through the read-only guard and performed no live seeds, migrations, uploads or record changes.

Real fixtures used replica set `fyp_transactions_0a322d8ab2a64dde991551f1f782ee9f`, disposable database `fyp_transactions_map_e945f87fb5684581b2e4a064156e5345`. Exact fixture cleanup verified zero tracked pets/sightings/assets; owned replica set stopped and disposable storage removed. No Atlas records, provider assets, original images or runtime environment files changed.

Offset pagination is not a transactional snapshot during other users' concurrent writes. Map retains loaded pages between tab switches; use refresh/search/pan for current results. Human visual review was not performed or claimed.

## Files in this batch

`src/App.vue`, `src/views/MapScreen.vue`, `src/components/MapView.vue`, `src/services/api.ts`, `src/types/pet.ts`, new `src/utils/mapViewport.ts`, all three locale JSON files; their focused App/Map/API/utility tests; `server/services/petMapQuery.js`, its unit and real-Mongo tests; `server/scripts/verifyMapReadOnly.js` (optional verification port only); this report and `AUDIT_FINDINGS_CHECKLIST.md`. Earlier uncommitted work is preserved. No dependency, routing-configuration, schema, index or environment-file changes; no commit/push.
