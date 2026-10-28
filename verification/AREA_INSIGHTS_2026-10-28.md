# Area Insights — definitions and focused verification

## Delivered

A compact `AreaInsightsCard` appears below the dedicated Map. It uses semantic theme tokens, all three locales, native keyboard-accessible tie disclosure and locale-aware numbers/dates. The Map shell scrolls when its card and controls exceed available height, keeping content accessible above the fixed navigation.

Statistics are returned in the same viewport API response as markers. Loading hides old statistics; failures or missing statistics show unavailable, never invented zero counts. A successful empty aggregation shows no eligible recorded reports. Account/area changes clear old insights; obsolete responses cannot restore them. Loading another page updates statistics from the whole matching dataset, never from loaded cards. Radar settings do not supply or change the Map query.

## Exact metric definitions

| Metric | Definition |
| --- | --- |
| Denominator | Distinct Pet documents (`_id`) that currently qualify for this viewer's committed Map query: visible lost/sighted reports, public-cell centre inside queried bounds and existing Map ownership/filter rules. It excludes reunited/hidden/out-of-area reports. It does not count sightings, rescues, comments, hotspot weights or distinct real-world animals. |
| Leading district | The largest count among canonical Hong Kong district buckets plus one explicit unknown bucket. Every tied known district is returned deterministically. `unknownIsTop` includes unknown ties; when unknown wins alone the UI says district information is insufficient, without inventing a known winner. Unknown is a data-quality group, not an actual district. |
| Animal breakdown | Exact stored enum values Dog, Cat and Other. Missing/invalid historical values are counted separately as unclassified. The four categories reconcile to the full denominator. |
| Past seven days | The subset of currently eligible reports with BSON Date `createdAt` inclusively between `serverNow − 168 hours` and `serverNow`. One server clock is captured per request; clients cannot choose the cutoff. `lastSeen`, sighting times and `updatedAt` are not used. |
| Date-quality counts | Missing/non-Date `createdAt` values count as unknown date; future BSON dates count separately. Both are excluded from the seven-day metric but remain in total/district/animal counts. |
| Reference times | `windowStart/windowEnd` describe the aggregate's rolling time window, not individual report timestamps. UI displays the window end in the selected locale. |
| Sparse-data notice | Shown for one to four matching reports. It is a display reminder, not a statistical confidence threshold; it does not suppress or alter counts. |

## Aggregation and privacy

The existing indexed candidate prefilter and public 750-metre cell membership stages run unchanged. The final `$facet` now includes statistics and whitelisted district counts alongside paginated markers and totals. There is no source-record limit before aggregation, no additional per-report requests, and no joins/unwinds that multiply reports. Each eligible Pet document contributes once.

Individual `createdAt` fields stay internal. The explicit public marker serializer still omits them, private coordinates, contacts and moderation/provider metadata. Noncanonical legacy district values become an unknown bucket; they are not echoed through metrics or marker district fields. Legacy radius-mode responses do not gain insights or change shape. No models, schemas, indexes, dependencies, environment files or stored records were altered.

The existing emergency-discovery blocking policy remains intact: blocked social/contact interactions do not automatically remove eligible public discovery reports. The existing Map policy, not a new separate statistics policy, controls eligibility.

## Historical and interpretation limits

- Districts are stored report labels, not a new reverse-geocoding result. Canonical but geographically inconsistent labels are not corrected; missing, malformed or unsupported labels are unknown.
- Imported/seeded creation times may reflect import time. Missing dates and legacy date strings are not guessed or converted. Existing accounts/reports are not rewritten.
- A document counts as one report, even if another document describes the same animal. Current demo/imported reports count if they meet normal Map eligibility; no hidden sampling or source exclusions were added.
- Original-location provenance and the existing stored-location fallback are unchanged. Approximate membership describes Map coverage, not an animal's current position or precise whereabouts.
- Counts reflect reports recorded in PawRadar, not actual missing-pet risk, animal population, causality, trends or predictions. Sparse datasets are explicitly labelled limited.
- Each response's markers and statistics use one aggregate. Separate pagination responses are not a shared database snapshot under concurrent changes. No minimum-population anonymity threshold is claimed or added.

## Verification

| Check | Result |
| --- | --- |
| Focused frontend | 45 passed across AreaInsightsCard, MapScreen and App integration. Tests include three languages, count/date labels, ties including unknown, unknown leader, sparse/empty/loading/failure states, server totals beyond page length, stale responses, account changes and Radar independence. These use jsdom/mocked transport, not browser automation. |
| Focused backend | Eight unit/Express tests passed across mapInsights and petMapQuery; database calls mocked in route tests. |
| Actual local MongoDB | Seven passed (six nested checks plus parent), zero skipped. Includes 815-report complete pagination with equal insights across pages, precise cutoff/now/future/invalid-date cases, unknown district/species handling, role/hidden/reunited/outside exclusions and successful empty metrics. |
| Location privacy regression | All 130 complete viewport-response comparisons, now including insights under a fixed server clock, remained invariant when exact points moved within their public cell. Existing 90 radius-response comparisons and the original-location sighting transaction passed. |
| TypeScript / ESLint / build | Passed. Existing large-bundle warning remains (about 786 kB main chunk). |
| Syntax | Changed backend modules/tests parsed successfully. |

The stale-response test initially tried clicking Search while its initial request correctly disabled the control. The fixture was corrected to advance the real 300 ms debounce instead; stale-count and marker assertions were preserved. Real privacy comparisons use a fixed test clock so aggregate reference times do not create meaningless differences; no application clocks were overridden. Node's experimental MockTimers warning is test-only.

Isolated replica set: `fyp_transactions_50ecc1890df54f93bbe22ae48accd4f4`; database: `fyp_transactions_map_c7605dc7c48c4a12963dd0e695287ce7`. Tests confirmed exact fixture removal (zero tracked pets, sightings and assets), stopped their owned replica set and removed disposable storage. No Atlas or provider access, live cleanup, seed or migration command was run.

Focused specialist review was read-only and covered the common eligibility stream, unknown buckets, date semantics and aggregate privacy. Implementation stayed with the routine developer. No browser/device or new live Atlas verification is claimed; visual fit remains a human-review item. A backend process without automatic reload must be restarted to serve the new insights facet; an older response safely shows unavailable statistics.

## Changed files and Git state

- Backend: `server/controllers/petController.js`, `server/services/petMapQuery.js`, new `server/services/mapInsights.js`.
- Backend tests: `server/tests/petMapMongo.test.js`, new `server/tests/mapInsights.test.js`.
- Frontend: `src/views/MapScreen.vue`, `src/types/pet.ts`, new `src/components/AreaInsightsCard.vue`, all three locale files.
- Frontend tests: AppCreationAuth, MapScreen, new AreaInsightsCard tests.
- Documentation: this report.

Changes remain uncommitted; nothing pushed. Existing data, images, provider assets, runtime environment and routing configuration were preserved. No paid service or package was introduced.
