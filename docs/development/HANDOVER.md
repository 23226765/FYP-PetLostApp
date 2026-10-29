# PawRadar - Current Handover

Updated 29 October 2026. This is a current working-tree summary, not a fresh runtime verification or release sign-off. The [progress/evidence document](../PROGRESS.md) is the detailed source of current status; historical reports remain unchanged.

## Working state and next boundary

- Web workflows are integrated: report -> community sighting -> owner history/notification/contact -> reunion, plus rescue, messaging and moderation.
- The latest approved privacy/preferences, Hong Kong rescue-time and distance-display repairs are implemented and covered by scoped tests, but remain uncommitted. Preserve those application and test changes.
- New feature development remains paused. Documentation drafting is approved only for README, HANDOVER, feature status, backend overview, docs/PROGRESS and .gitignore. Do not infer permission for migration, live writes or deployment.
- Original audit findings 1-22 retain their numbering. The checklist records 21 scoped verified repairs and one partially addressed dependency finding. Additional findings and browser gaps are tracked separately; this is not a claim that all defects are closed.

## Architecture and entry points

| Responsibility | Source |
| --- | --- |
| Vue shell, routing and API | [App](../../src/App.vue), [router](../../src/router/index.ts), [typed API](../../src/services/api.ts) |
| Preferences/session | [preferences](../../src/composables/usePreferences.ts), [auth context](../../src/services/authSession.ts) |
| Startup/configuration | [server entry](../../server/index.js), [database](../../server/config/database.js), [HTTP security](../../server/config/httpSecurity.js), [collection initialization](../../server/config/collections.js) |
| Matching/spatial services | [match rules](../../server/services/matchEngine.js), [Map query](../../server/services/petMapQuery.js), [hotspots](../../server/services/hotspotAnalytics.js), [Area Insights](../../server/services/mapInsights.js) |
| Schemas/routes | [backend reference](../technical/BACKEND_OVERVIEW.md) |

Stack: Vue 3/TypeScript/Vite/Vue Router/Vue I18n/Leaflet; Express/Mongoose/JWT/bcryptjs; MongoDB Atlas `petlostapp`. Coordinates remain `[longitude, latitude]`. Root/server manifests and lockfiles, not old report prose, define dependency versions.

## Current behavior and limits

- Radar has animal/district controls and radius presets. Backend breed filtering remains; Radar's breed input was deliberately removed.
- Dedicated Map owns its viewport, paging and retained tab state independently of Radar. Public locations and membership use approximate cells; older reports disclose stored-location fallback.
- Hotspots aggregate eligible sightings and rescue reports. Map Area Insights counts distinct eligible Pet documents before pagination. Neither is a prediction of missing-pet risk.
- Smart Match is a single-request rules-based ranker. It does not analyze photographs or provide calibrated probabilities. Formal evaluation is pending.
- Contact privacy, sighting ownership and message participation are enforced server-side. Shelter review/Hide/Restore and report-specific evidence exist; administrators have no general conversation access.
- English, Traditional Chinese and Simplified Chinese plus light/dark themes are implemented. Latest visual changes have focused automated evidence, not fresh physical-device validation.
- Saved pets remain account-namespaced browser storage; rescue saves are server-backed. Background push, native packaging and advanced shelter exports are not completed capabilities.

## Managed and historical images

All five submission categories use authenticated multipart uploads and managed IDs. Actual raster validation/Sharp processing, metadata stripping, transactional attachment/replacement, protected delivery and retries exist. Storage is opt-in and requires local provider configuration.

Database-serialized quota reservations, heartbeat leases and bounded exact-ID reconciliation are implemented/tested. Reconciliation is dry-run by default; apply/deletion require separate controls and authorization. Process-local concurrency/rate limits remain a multi-instance deployment consideration. There is no background/bulk cleanup worker or completed historical migration.

Existing Base64, external and local references are preserved. Protected local delivery is a compatibility bridge; original bytes may retain metadata, and external/Base64 sources are not secured merely by that bridge. See [legacy-image delivery](../technical/LEGACY_IMAGE_DELIVERY.md) and [current storage details](../PROGRESS.md#managed-and-historical-images).

## Verification handover

Latest recorded Atlas read-only checks succeeded on 28 October after earlier interruptions; current connectivity has not been rechecked for documentation. Do not repeat the old blanket "Atlas blocked" diagnosis without a new sanitized failure.

- [27 October integration report](../../verification/APP_UI_BATCHES_2026-10-27.md): full frontend/backend and separate real local MongoDB results.
- [28 October Map evidence](../../verification/MAP_VIEWPORT_INDEPENDENCE_2026-10-28.md) and [Area Insights evidence](../../verification/AREA_INSIGHTS_2026-10-28.md): paging, privacy, scope and limitations.
- [29 October workflow repairs](../../verification/WORKFLOW_REPAIRS_2026-10-29.md): 290 distinct selected tests across scoped runs; no browser/database/provider run.
- [Audit checklist](AUDIT_FINDINGS_CHECKLIST.md): earlier provider, browser, concurrency and repair evidence with boundaries.

Use [README setup](../../README.md#local-setup) and the [command safety matrix](../PROGRESS.md#verification-and-command-safety). `verify:privacy`, `verify:sightings`, `verify:strays`, `verify:preferences` and other live workflow scripts must not be treated as read-only merely because their names begin with "verify". Normal startup can create indexes; use the guarded harness for approved strictly read-only Atlas checks.

## Remaining work and preservation

Priorities are evaluation/evidence, reconciliation of remaining browser observations, historical-image inventory/migration design, and deployment prerequisites. The official assessment brief/supervisor instructions are unavailable; ISA alignment is provisional. Real-device and stakeholder evaluation are not established.

Preserve records, uploads, provider assets, runtime environment files, original images and all existing work. Keep seed/migration/cleanup/reconciliation-apply disabled without separate approval. Never use `sample_mflix`. No history rewriting, credential rotation, commit, push or visibility change is authorized by documentation approval. Historical configuration privacy concerns require a separate decision before repository sharing.
