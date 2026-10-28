# Approved messaging, Map and compact-feed batches

## Delivered

- Messaging: image/editor rendering requires a non-empty photo. The send control has an inline paper-plane icon, localized sending label and disabled/busy states. Inbox search filters existing authorized conversations by public display name, with case/Unicode normalization, clear and no-results states. Unread totals use the complete inbox. No user directory or new inbox pagination.
- Map: public `/map` and sixth navigation item reuse Leaflet, protected images and clusters. `GET /api/pets/map` returns minimal approximate lost/sighted markers, complete eligible totals and explicit paging (100 per page). Search this area queries the viewed area; marker details use the authorized existing route. Pan/zoom survives detail navigation. Loading/error/retry/empty/paging states are explicit; account changes clear and reload markers.
- Radar: Animal type and District selects replace chips and Breed input. Radius opens a labelled native modal with exactly 1, 5, 10, 15 and 20 km. Existing custom account radii remain until a preset is selected. Backend/API/Smart Match breed filtering remains; Radar deliberately no longer offers a Breed field.
- Rescue: compact filter button opens staged animal/status/district controls. Apply batches changes; dismissal keeps applied filters; Reset clears them. List/Map, filters and scroll containers persist between tabs. Cards show author, proportional photos, action row, caption and permitted comment preview/count. Multiple existing photos scroll horizontally. Existing detail management remains authorized; Share opens the existing in-app share sheet.
- All new interface keys have English, Traditional Chinese and Simplified Chinese values. Existing semantic themes, accessible labels, focus styling and 480px shell remain.

## Privacy and original-location limitation

All roles receive 750-metre public grid coordinates from the Map endpoint. Origins are snapped too. Exact `$geoNear` is only a conservative internal prefilter; public-cell centres determine membership, totals, stable ordering and pagination. DTOs omit distance/contact/owner/exact geometry/sighting positions. Existing deliberate emergency-discovery blocking policy remains; contact/social restrictions apply to details. Hidden/reunited posts and the authenticated user's own posts are excluded.

Current sighting writes leave `Pet.location` unchanged; actual transaction coverage proves this. Historical origins cannot be reconstructed safely. The UI explicitly describes the **stored report location**, discloses the legacy limitation and never substitutes a subsequent sighting or fabricates a report point. Default Hong Kong viewport coordinates are only for browsing, never stored as a report location. No historical records were rewritten.

No schema/index migration, dependency change, runtime environment edit, Atlas write, real provider operation, seed, migration, commit or push. Existing indexes and resource controls are reused.

## Verification

| Check | Result and boundary |
| --- | --- |
| Complete frontend | 438 passed, 39 files; jsdom/components and mocked transport, not browser verification. |
| Complete backend | 299 passed, zero failed, seven opt-in database suites skipped. Full diagnostic log: ignored `verification/browser-integration-2026-10-27/backend-final.log`. No repeated complete rerun to obtain green. |
| Real disposable MongoDB | 46 passed, zero skipped, seven suites including Map. Actual local geospatial aggregation and transactions; provider mocked. Exact fixtures/owned replica-set storage removed. |
| Real Map regression | 815 eligible records, full counts/paging; 90 complete-response invariance comparisons (three origins × three boundary radii × five roles × two pages), including movement of 805 records within their public cell; actual sighting/retry preserves stored report point. |
| Focused backend | Map/analytics/privacy 18 passed; existing pet/moderation/blocking 34 passed; earlier messaging/image integration 27 passed. These overlap the full suite. |
| Focused frontend | Search/attachments/send; paging/marker routes/stale accounts/viewport; native modal/radius presets; staged filters/reset and card hierarchy. Final map-auth refresh/share checks: 20 passed after complete frontend run. |
| TypeScript / ESLint | Passed; zero warnings. |
| Backend syntax | 134 JavaScript files parsed. |
| Production build | Passed; existing main-chunk warning, approximately 777 kB. |
| Startup | Owned temporary Vite returned HTTP 200 for `/map`, MapScreen and FilterSheet modules, then stopped. HTTP only. |
| Secret / diff | Configured local secrets/private-key patterns absent from 312 worktree text files and 346 tracked-index files; zero tracked runtime environment files. Diff check passed. Final documentation additions checked again before handoff. |

Initial test-authoring mistakes were corrected without weakening assertions: anonymous stub naming, missing test-router `pet-detail`, and VTU `get().exists()` typing. The ordinary backend run passed without the historical intermittent failure recurring; its earlier unidentified cause remains recorded.

## Browser evidence and limitations

Only partial Batch 1 browser work predates the user stop instruction; see `browser-integration-2026-10-27/ec93952ee69d464faf81a710d3316431/BATCH1_BROWSER.md`. Both disposable browser runs have completed cleanup ledgers. Earlier completed image-category evidence remains unchanged. No new browser pass for Map/filters, no full visual theme/locale/viewport matrix. Actual visual fit, native dialog focus and touch usability require human judgment.

Focused specialist review found no blocking Map privacy/session issue. Its active-map account-change empty-state concern was fixed with targeted coverage. Existing historical bcrypt/dependency limitations remain outside this batch. No fresh Atlas/provider verification.

## Changed paths

- Backend: `server/controllers/chatController.js`, `petController.js`; `server/routes/pets.js`; `server/services/hotspotAnalytics.js`; new `petMapQuery.js`.
- Backend verification: `server/scripts/browserVerificationHarness.js` (isolated second-origin CORS), `testTransactions.js`; `server/tests/helpers/localTransactions.js`, `messageReadNotifications.test.js`; new `petMapQuery.test.js`, `petMapMongo.test.js`.
- Frontend: `src/App.vue`; components `AppIcon.vue`, `ChatInboxScreen.vue`, `Chatscreen.vue`, `MapView.vue`, `RadarScreen.vue`, `StrayRescueScreen.vue`; new `FilterSheet.vue`, `src/views/MapScreen.vue`; `src/views/StrayDetailScreen.vue`; `src/router/index.ts`, `src/services/api.ts`, `src/types/pet.ts`; all three locale files.
- Tests: AppCreationAuth, MapView, MessagingState, StrayRescueScreen, StrayDetailScreen, apiAuthContext; new CompactFilters and MapScreen tests.
- Documentation/evidence: this report, `AUDIT_FINDINGS_CHECKLIST.md`, two ledger/fixture directories under `verification/browser-integration-2026-10-27/`.

Routing configuration, manifests/lockfiles, original images and existing application records unchanged. All changes remain uncommitted.
