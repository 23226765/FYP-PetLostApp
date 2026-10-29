# PetLostApp — original 22-finding audit checklist

## Additional workflow repairs — 29 October 2026

These stable identifiers supplement, and do not renumber or change, the original 22 findings. They supersede only the corresponding older browser findings about privacy/theme rollback, rescue observation time and missing distance. Other historical browser findings and release/device limitations remain separate.

| Identifier | Finding and root cause | Current status and scoped evidence |
| --- | --- | --- |
| **BROW-PREF-01** | Contact-privacy success emitted a stale full User object; App reapplied old preferences and invalidated pending appearance saves. Settings also lacked local request/account guards for privacy and preference feedback. | **Fixed and verified (automated scope)**. Privacy-only, account-ID-checked state merge; no preference reapplication or unrelated feed/view reset. Settings guards success, failure and finally using session context, account epoch, request identity and lifetime. Settings/App regressions cover newer/pending appearance choices, failure rollback, old loads/writes, replacement busy flags, A→B→A, same-token invalidation, logout and unmount. |
| **BROW-TIME-01** | Rescue defaults/max values sliced UTC into `datetime-local`; submission parsed that wall time in the machine timezone; observed-time display also inherited machine timezone. | **Fixed and verified (automated scope)**. Explicit `Asia/Hong_Kong` IANA conversion for input and stored instants; seconds/milliseconds retained; invalid/future values fail before upload with localized feedback. Actual Node child processes in New York, UTC and Hong Kong prove identical conversions, including year/date boundaries. Component tests check submission ISO values and all-three-locale Hong Kong display. Existing caption editing leaves `observedAt` untouched. No historical records rewritten. |
| **BROW-DIST-01** | Pet detail/default cards rendered absent distances; finite-only checks elsewhere admitted negative distances and left misleading units/separators. | **Fixed and verified (automated scope)**. Shared non-coercing finite/nonnegative predicate across detail, feed/default cards, rescue feed, notification toast and existing pet-map popups. Zero remains valid; approximate labels remain explicit; no distance is derived from coordinates. Tests cover missing/null/NaN/infinite/negative/string values, zero and localized approximate wording. |

Reproduction preceded repairs: three existing component suites reported **8 failing new assertions and 29 passing tests**. The failures directly demonstrated appearance rollback, UTC input at a Hong Kong date boundary and six invalid-distance cases. This was an isolated mocked-API/jsdom run under `TZ=America/New_York`, not a live mutation.

Final evidence: **290 distinct relevant tests** across 13 selected frontend/utility/API-context files passed across the scoped runs and corrective affected-file reruns. Includes real Axios interceptors with mocked transport, mounted Vue components, pure helpers, and three actual Node timezone processes; no real database/provider/browser coverage is implied. TypeScript, ESLint, production build, diff and changed-file secret checks passed; existing large-bundle warning remains. See [the repair report](../../verification/WORKFLOW_REPAIRS_2026-10-29.md) for commands, fixture corrections, changed files and limits.

Focused `fyp_architect` review was read-only, using the runtime's exposed specialist role (Astra/high); it found no remaining concrete scoped privacy issue. Review did not execute tests or replace verification. No backend/schema/index/package/runtime-environment changes, database access, uploads, seeds, migration, cleanup, commit or push. Browser and actual-device verification remain unperformed for this batch.

## Dedicated Map viewport independence — 28 October 2026

Map no longer receives Radar radius/filters/GPS. It owns Hong Kong overview/viewport queries, camera, paging and cached tab state; Radar radius selections update Radar alone. Public-cell viewport membership preserves original-location fallback, privacy and visibility policies, with existing resource limits. Focused frontend 171 tests plus strengthened App/Map 35 tests, backend unit five and actual isolated Mongo six passed; 815-record pagination and 130 viewport/90 legacy-radius invariance comparisons are verified. Read-only Atlas viewport/paging/privacy checks passed through the updated temporary service. Existing backend process must be restarted to load the new bounds contract. No browser automation, live record/provider/environment changes or commit/push. [Evidence, changed files and limitations](../../verification/MAP_VIEWPORT_INDEPENDENCE_2026-10-28.md).

## Targeted Map marker follow-up — 28 October 2026

**MAP-HTTP-01 — confirmed stale backend route loading:** the old running process treated `/pets/map` as a pet ID and returned HTTP 400 despite healthy database connectivity. Current source route order was already correct. Fresh current router/controllers returned HTTP 200 via actual Vite and direct API with three default-area markers; no data seeding or permission change was required. Separate marker-failure, genuine-empty and background-tile messages now replace the misleading generic failure. Targeted frontend 142/backend three tests, typecheck, lint, changed backend syntax and build passed. Actual read-only Atlas/proxy checks passed after a temporary connectivity interruption; zero database writes. No browser automation. Temporary verification services stopped. [Detailed evidence and limitations](../../verification/MAP_MARKER_FIX_2026-10-28.md).

## Approved UI batches — 27 October 2026

Messaging repair/search, dedicated privacy-safe `/map`, compact Radar radius/animal controls and Rescue filters/photo-first feed are implemented. Original finding numbers and repair evidence below are preserved. Full details and changed paths: [approved UI batch report](../../verification/APP_UI_BATCHES_2026-10-27.md).

- Complete frontend: **438 passed**; complete backend: **299 passed, zero failed, seven opt-in skipped**. The seven actual isolated MongoDB suites ran separately: **46 passed, zero skipped**, including complete Map paging above 750 records, 90 whole-response privacy comparisons and report-origin preservation through an actual sighting transaction.
- TypeScript, lint, 134 backend syntax checks, production build, temporary frontend HTTP startup, diff and configured-secret/index checks passed. Final map authentication-refresh/share tests passed after the complete run. Existing main-bundle warning remains; no backend intermittent failure recurred in this run.
- Browser reviewing was **stopped at the user's request**. Partial messaging observations are preserved in [the browser report](../../verification/browser-integration-2026-10-27/ec93952ee69d464faf81a710d3316431/BATCH1_BROWSER.md). No new Map/filter browser coverage or exhaustive visual matrix is claimed. Native focus, visual fit and touch usability remain human-review items.
- Both browser ledgers confirm exact fixture cleanup; owned servers/local databases stopped. No Atlas/provider operations, existing-record changes, environment changes, migration, seed, commit or push. No schema/index/dependency/routing-configuration changes.
- Historical report origins remain unverifiable where old records lack provenance. The Map discloses its approximate stored-report fallback and never reconstructs positions from sightings or rewrites records. Radar Breed UI was intentionally replaced; API/backend/Smart Match breed support remains. Existing custom radius preferences were not normalized or overwritten.

## Cancellation follow-up completed — 27 October 2026

**BROW-UP-01: Fixed and verified.** Intentional abort in the initiating session is now normalized to `IMAGE_CANCELLED`; the lost-pet form suppresses only that cancellation result within its existing active-context guard. Genuine upload/posting errors retain their useful feedback. Draft/image/key retention, account guards and cleanup logic were not replaced. Application repair files: `src/composables/useImageUpload.ts` and `src/components/PostPetScreen.vue`; focused tests extend `PostPetImages.test.ts` and `useImageUpload.test.ts`.

### Verification results

| Check | Actual result / boundary |
| --- | --- |
| Focused cancellation/upload component tests | **42 passed** in two files, including 12 added regressions: all three locales, aborted transport rejection, draft/key retention, genuine failure feedback, same-token/round-trip invalidation and still-mounted obsolete success/failure. API promises are mocked in these tests. |
| Relevant API/authentication/status regressions | **159 passed** in four files; actual Axios interceptor and mounted component coverage with isolated/mock transport. Total targeted frontend result: **201 passed**. |
| Relevant backend image regressions | **64 passed** across lifecycle, authorization, attachment and HTTP flow suites. Model/provider mocks in those suites are not described as real MongoDB verification. |
| Vue TypeScript / ESLint / production build | **Passed** for the repair before the interruption; existing large-chunk warning remains. Application repair source is unchanged in the resumed verification. |
| Production browser cancellation | **Passed**, 26 October, run `0eb769b6fbbc4443aa906aef5ce27f41`: Cancel at 99% showed only the useful cancellation/retry alert; no generic posting error. Draft/photo/confirmed point retained; cached same-key retry plus explicit Post created one pet/attachment. |
| Production cross-tab invalidation | **Passed**, same run: tab B logout/login invalidated untouched tab A's upload form. Reporter login preceded old provider success by **27.705 seconds**; the old form did not reappear. Normal App intentionally unmounts its auth-scoped tree. |
| Retained actual component, old success | **Passed**, same run: harness-only host mounted the real report component once; actual component/session listeners cleared old fields/image on cross-tab change. After old provider success, mount count remained 1, new marker text remained and no old image/error/success returned. This host is not a production route. |
| Retained actual component, old failure | **Passed**, 27 October, fresh run `cf6c850fb751472aa0622c6f4472cff6`: reporter login completed at 12:20:47.090Z, new marker entered at 12:20:47.813Z, old provider failed at 12:21:15.349Z. At 12:21:33.848Z, the same component still had mount count 1, preserved the new marker and showed no stale image/error/success. No new content was submitted. |
| Read-only evidence assertions | **Passed**: `verify-followup.mjs` validates retry identity, unique attachment/content, upload chronology, uploader attribution, failure compensation and exact cleanup across both ledgers/recovery evidence. |

Browser reports: `verification/browser-integration-2026-10-26/0eb769b6fbbc4443aa906aef5ce27f41/BROWSER_RESULTS.md` and `verification/browser-integration-2026-10-27/cf6c850fb751472aa0622c6f4472cff6/BROWSER_RESULTS.md`. Screenshots are retained inline in supported browser-tool transcripts, with capture titles in those reports; no exported screenshot paths are invented. Previous completed journeys and all-five-category image results remain unchanged.

The first retained-failure attempt was interrupted before its final DOM observation. That missing assertion was not retrospectively marked passed; only that case was repeated in the fresh run. Actual component storage handlers abort HTTP transport, so browser evidence covers safe state while old provider work completes. Mocked delayed-promise regressions separately cover a late resolved/rejected completion reaching component code. No real Cloudinary or forced response delivery through an aborted request is claimed.

### Label status and cleanup

**Still open, unchanged:** the lost-pet form passes its own title/guidance to `SightingLocationPicker`, but its confirmation summary still uses `sightings.confirmedPoint` (`Confirmed sighting point` in English). The corresponding Chinese labels remain sighting-specific too. This wording issue is outside the approved cancellation repair; no label/translation changes were made.

Interrupted-run exact recovery on 27 October reopened only its identified local replica-set files and the exact `fyp_transactions_browser_0eb769b6fbbc4443aa906aef5ce27f41` database. IDs were checked against its ledger before deletion: **3 users, 1 pet, 4 media assets and 1 upload budget** removed; every collection verified empty; recovery replica stopped and its validated temporary directory removed. `recovery.json` preserves final asset states: one attached, two pending and the failed asset deleted. The original mock provider lived only in the stopped process; no retrospective provider lookup/deletion is claimed. Its original `cleanupComplete: false` ledger is retained as history, with separate successful recovery evidence.

Fresh-run normal teardown confirmed **3 users, 1 failed media asset and 1 upload budget** removed; all collections empty, zero mock objects, `cleanupComplete: true`, process exit 0 and replica shutdown. The frontend/API was independently unreachable afterward. Both created test tabs were closed after synthetic logout; unrelated tabs were untouched. No Atlas record, real provider asset, original image, runtime environment file, seed, migration or live cleanup was involved. No commit or push was issued by this work.

Final resumed checks: harness/recovery/evidence-script syntax and `git diff --check` passed; secret audit scanned **346 worktree files and 338 index files with zero findings**, excepting only the eight occurrences of precisely reviewed fictional test URI values. No tracked runtime environment file was found. No MongoDB test process remained, and the interrupted run's validated temporary directory was absent. The application repair and tests were already present in current HEAD when this resume began; this resume adds verification/recovery reports and scripts without further application/configuration/package changes.

## Completed targeted upload browser checks — 26 October 2026

This entry supersedes the earlier pending status for active-upload cancellation and controlled provider-failure/retry. All previously completed browser results, including happy-path uploads for all five image categories, remain preserved. Detailed new evidence: `verification/browser-integration-2026-10-26/73ce3fb9e2f84728beac5d9e1de6bfd5/BROWSER_RESULTS.md`, `ledger.json` and read-only `verify-ledger.mjs`.

### Actual browser results

| Scenario | Result and evidence |
| --- | --- |
| URL and isolation | Supported Windows controls confirmed the existing Example Domain tab and navigated that same tab to `http://127.0.0.1:4179/login`. The loaded document URL and independent HTTP 200 health matched. Database was `fyp_transactions_browser_73ce3fb9e2f84728beac5d9e1de6bfd5`, readyState 1. Windows screenshot capture subsequently timed out; a supported Chrome-extension connection independently confirmed the same app tab/URL and performed the UI checks with its own policy checks active. No URL check was bypassed. |
| Active cancellation | Passed. At 99% during a 30-second provider delay, Cancel preserved all entered form values, selected image and confirmed coordinates. No pet or attachment was created. The late provider result became an owner-bound pending reservation with expiry metadata, rather than silently submitting content. |
| Cancelled-upload retry | Passed. Retry upload returned HTTP 200 with the same key/asset, without another provider upload. A later explicit Post created one pet with one attached image; no automatic submission or duplicate object occurred. |
| Provider failure | Passed. A one-shot failure at the storage adapter returned HTTP 503 and useful localized feedback. The draft remained intact. The failed reservation was recorded as deleted with its failure code, and previous successful content was unchanged. |
| Failure retry | Passed. Retry upload followed by explicit Post created one additional pet and one attachment. A fresh upload key after a definitive terminal failure is intentional. The ledger contains exactly two successful content submissions, two unique content submission IDs and two distinct attached assets. No uncertain final-content-response retry was simulated. |
| Logout and replacement account | Passed for the same-tab navigation/unmount path. In the decisive attempt, owner upload started at 10:48:35.925Z, reporter login completed at 10:48:43.461Z, and old provider work finished at 10:49:05.930Z: 22.469 seconds after replacement login. Reporter profile showed zero owned reports. Before and after late completion, the reporter form had no old image, draft, success or error; only its own contact name was populated. Database snapshots retained the old assets under their original uploader and created no replacement-account content. Reporter was logged out afterward. |

The first account-switch attempt did not achieve the required ordering because a context interruption delayed replacement login until after provider completion. It is retained as logout/unmount evidence only. One focused repeat supplied the ordering above; no unsuccessful attempt was relabelled as passing.

### Defects and remaining limits

- New low-severity UX issue **BROW-UP-01**: intentional Cancel displays both the useful cancellation/retry message and a redundant generic posting-failure message. Reproduce by selecting an image in Report, submitting while the mock provider is delayed, then clicking Cancel at 99%. Data and retry behavior are correct; no fix was applied.
- Known email-placeholder i18n compilation errors and the camera PWA-element diagnostic recurred. Web file-selection fallback worked. These are existing observations from the earlier browser report, not new upload-data failures.
- Screenshots were captured inline in the supported browser-tool transcript. The report records capture titles; no exported screenshot files or invented screenshot links are claimed.
- This run used real UI, controllers, authentication, Sharp and local MongoDB; Cloudinary was an in-memory adapter. It does not verify actual provider deletion, browser-offline recovery, cross-tab switching, a still-mounted previous-account form or a successful obsolete HTTP response delivered after replacement. Navigation abort was part of the browser protection exercised.
- Abandoned provider work intentionally remains pending, unattached and recoverable until retry/expiry/reconciliation. Snapshots verified ownership and expiry metadata, not a 24-hour elapsed-time cleanup. Migration and application bulk cleanup stayed disabled. Exact test teardown is separate from application reconciliation.
- Content IDs were observed on the two successful final POSTs; identity before any content request is not exposed by the UI. Same upload identity across cancellation/retry and absence of duplicate content were directly measured. Existing isolated concurrency coverage is not presented as additional browser evidence.

### Teardown and verification

Read-only ledger assertions passed for identity reuse, failure compensation, unique content/attachments, actual replacement-login ordering and cleanup. Exact teardown removed **3 synthetic users, 2 pets, 5 media-asset records and 1 upload-budget record**; every application collection in the dedicated database was asserted empty. All **4 exact mock provider objects** were confirmed absent. Harness exited 0, its owned replica set stopped, and the isolated frontend/API became unreachable. `cleanupComplete: true` is recorded in the ledger.

Only verification harness instrumentation, evidence artifacts and this checklist changed. No application functionality, runtime environment file, existing Atlas record, real provider asset, original image, dependency or routing configuration changed. Syntax and diff checks passed; no seed, migration, live provider operation, commit or push occurred. Broad application suites were not rerun because application source did not change; their earlier results remain separately dated above/below.

Final secret audit: 335 worktree files and 309 index files scanned, zero findings; only exact reviewed fictional redaction-test fixture values were excepted. Git comparison confirmed no tracked application/configuration/package changes. Current Git scope is this modified checklist plus untracked verification harness/recovery scripts and evidence artifacts; no staged changes or deletions.

### 26 October URL-check retry

Supported `sky.get_window_state` successfully identified Chrome's active page at the MongoDB Cloud origin, rather than the stated example.com page. No Atlas controls were used. A fresh isolated harness started at `http://127.0.0.1:4179`; independent health returned HTTP 200, readyState 1, database `fyp_transactions_browser_bf65c2de12d54808b25ee2621c3ad2a1`.

Opening a dedicated test tab with Ctrl+T then caused Computer Use to stop because it could not confidently determine the current browser URL. No URL-policy check was bypassed, and no application navigation or upload submission followed. Active-upload cancellation and failure/retry remain pending. Previously completed browser results are unchanged. The harness was stopped immediately; exact cleanup evidence is in `verification/browser-integration-2026-10-26/bf65c2de12d54808b25ee2621c3ad2a1/ledger.json`. No application functionality, Atlas data, real provider objects or runtime environment files changed.

## Browser continuation — 26 October 2026

The completed 23 October browser results supersede the historical blocked-attempt notes below. Actual Chrome journeys and findings are recorded in `verification/browser-integration-2026-10-23/fda05496cacf470aad07dd8fca089c24/BROWSER_RESULTS.md`; the supplemental report under `369cb2508a6a4bb8b5aa63794b8c7b09` confirms pet and sighting image uploads. Together those runs cover successful browser upload/attachment/display for all five categories. Both ledgers record exact fixture teardown and `cleanupComplete: true`.

Confirmed browser findings remain open: privacy save resetting the selected theme; Hong Kong rescue observation time shifted eight hours; report phone unavailable when account phone is empty; reunited Radar cards retaining missing/Found it presentation; missing-distance text; untranslated moderation enums; broken empty chat-avatar fallbacks; and email-placeholder i18n compilation diagnostics. The reports preserve reproductions, evidence boundaries and suspected issues separately. No application fixes were applied during verification. Original audit numbering and narrowly scoped automated statuses below are retained; they do not resolve these additional browser findings.

On 26 October, the direct Computer Use runtime initialized and found Chrome. Its first window-state request then stopped automation: it could not determine the current browser URL confidently enough to enforce policy. No browser actions or submissions occurred in this new run. The new harness reached connected state in disposable local database `fyp_transactions_browser_72ce86397b914e568462370e741459dc`, with in-memory provider storage. It was stopped immediately; process exit 0 and `CLEANUP_VERIFIED` confirmed exact fixture deletion, mock-object absence and replica shutdown. Ledger: `verification/browser-integration-2026-10-26/72ce86397b914e568462370e741459dc/ledger.json`.

Remaining browser gaps include provider-failure/retry, cancellation during an active upload, simultaneous browser profiles, GPS denial and comprehensive keyboard/layout coverage. Verification-only harness controls were added for a single mock-provider failure and bounded upload delay; neither was exercised because browser automation stopped. Application source, environment files, Atlas data and real provider assets were unchanged. No commit or push.

## Browser-connected continuation — interrupted during preparation

Chrome connectivity was subsequently confirmed by the supported child browser tool: a blank `about:blank` tab opened successfully. This supersedes the earlier no-connected-surface inventory, but is not application verification.

The browser-capable specialist then hit a runtime usage limit while preparing `server/scripts/browserVerificationHarness.js`. The draft passed `node --check`, but was not started or runtime-validated: no run ledger or fixture image artifacts exist and no local mongod process was present at the interruption check. No browser application submissions occurred. All requested end-to-end journeys remain **untested** in this continuation; no application defect was confirmed.

The parent session has no browser-control tool. Resume after the browser-capable runtime is available, review and validate the draft's isolation/teardown first, confirm its disposable database through health, and only then begin browser submissions. No fixture teardown was required because this harness had not run. The draft does not change application functionality; existing environments, Atlas records and provider assets were untouched. No commit or push.

## Controlled browser verification attempt — 23 October 2026

**Browser execution blocked; independent verification passed.** Parent tool inventory exposes no browser-control or node_repl runtime. The Computer Use skill requires that runtime and was read before concluding it was unavailable. The focused architect child exposed a supported browser inventory tool and actually called `cua.getState()`: result `{"apps":[],"browsers":[]}`. No connected surface exists; no browser journey, screenshot, desktop/mobile viewport, native keyboard focus, dialog overlap or visual theme/language result is claimed.

Smallest setup: enable/connect a supported browser surface in the Codex session, then verify it appears in inventory. Opening or installing Chrome alone does not establish that connection. Once connected, use an isolated frontend/backend harness and disposable local database, not the normal Atlas-backed development server. No persistent browser fixture server was started during this blocked attempt.

| Independent check | Actual result / boundary |
| --- | --- |
| Normal `npm test` in server | 295 passed, 0 failed, 6 opt-in skips; one normal parallel run, no retry. Complete TAP diagnostics retained in `verification/browser-integration-2026-10-23/backend.tap`. Earlier intermittent failure did not recur and remains unexplained. |
| `npm run test:frontend -- --maxWorkers=1` | 403 passed across 37 jsdom files. Component/API mocks are not frontend-to-backend browser integration. |
| `npm --prefix server run test:transactions` | 42 passed, no skips; actual MongoDB 8.0.17, local replica set `fyp_transactions_dba6cd739b274661b072f50433387a8f`. Exact tracked fixture teardown confirmed in all suites, followed by owned replica-set shutdown. Provider mocked; no Atlas/provider operations. |
| TypeScript / ESLint | Both passed. Application functionality was not changed. |

Journey evidence and remaining gaps:

- Authentication/account switching: existing cancellation, API-attribution, preferences and saved-state regressions passed; actual browser cookie/storage scheduling and end-to-end login/logout remain pending.
- Pet reporting/location/sightings/reunion: component and real local transaction coverage passed. `PostPetImages` mocks API, GPS and Leaflet; it cannot establish actual map interaction or browser geolocation prompts.
- Rescue/comments/saves/management: mounted component tests plus local Mongo authorization, pagination, retry and edit-conflict tests passed. Full browser navigation and control usability remain pending.
- Messaging/unread/notifications: component notification navigation and unread tests passed, with real Mongo read-acknowledgment/concurrency coverage. `MessagingState` mocks API and visual children; no browser conversation sequence was exercised.
- Images: selection/retry/cancellation/blob-display component tests and real attachment/rollback database suites passed. Actual browser multipart transport, image rendering and adapter-backed end-to-end delivery remain pending.
- Privacy/moderation: existing HTTP/controller policy and component evidence tests passed, with mocked model/provider boundaries in those tests. This is not a live browser moderation/privacy journey.
- Themes/locales/accessibility: all-three-locale component tests and CSS-token contrast tests passed as part of the suite. `ThemeContrast` calculates token contrast, not rendered screenshots. Real mobile/desktop layout, focus order, dialog geometry, loading transitions and overlap checks remain unverified.

No new application defect was confirmed by this attempt. No application source, runtime configuration, environment file, existing record, upload or provider asset changed. Only this checklist and the diagnostic artifact were added/updated. No seeds, migrations, live cleanup, commit or push. New feature development remains paused. Browser sign-off is withheld.

Updated: 23 October 2026 (Hong Kong). New feature development remains paused.

Source: the user-supplied original audit attachment, `abcbef8d-3ff5-40cd-9e47-8efa4b448d04/Pasted text.txt`, whose baseline was commit `5ad3276`. Numbers, titles, severities and meanings below preserve that audit. This is a repair-status record, not a replacement audit or public-release sign-off.

Status vocabulary: **Fixed and verified**, **Implemented but verification pending**, **Partially addressed**, **Still open**. “Verified” identifies the specific automated/isolated evidence below; it does not claim a browser, physical-device, production-proxy or live-Atlas mutation test. Earlier approved verification is explicitly distinguished from this batch. Uncommitted implementation is included.

Summary: **21 fixed and verified; 1 partially addressed (#8); 0 still open; 0 implemented but verification pending.** The separate integration findings INT-01 and INT-02 below are also fixed with scoped automated evidence; they do not renumber the original audit. Remaining verification limits and intermittent test instability are recorded below.

## 1. High — Smart Match exposes precise distance indirectly

- Status: **Fixed and verified**. Originally a confirmed live privacy defect, not merely a suspected risk.
- Repair: unauthorized scores, totals, ranking and disclosed distance use public approximate coordinates rather than exact internal distance.
- Evidence: `server/tests/approvedBatchRegression.test.js` proves invariance when exact points move within one public cell, including scores, ordering and limit selection; `matchEngine.test.js` and location/contact regressions remain enabled.
- Scope: isolated controller/role tests; no new live triangulation run in this batch.

## 2. High — Sighting content permissions disagree with image permissions

- Status: **Fixed and verified**. Originally confirmed by code and live API responses.
- Repair: owner/reporter policy is shared by private sighting notes, photo references and delivery; unrelated authentication alone is insufficient.
- Evidence: `petController.test.js`, `sightingSubmission.test.js`, `mediaAccess.test.js`, `legacyImages.test.js` and `moderationEvidence.test.js` exercise permitted/denied access. The new report-scoped moderator exception does not change ordinary delivery.
- Scope: HTTP/controller/model mocks and real temporary filesystem reads, not live private-photo requests.

## 3. High — Legacy uploads bypass content permissions

- Status: **Fixed and verified**. Originally confirmed static-serving defect; the audit did not request private files.
- Repair: unrestricted static delivery is replaced by normalized, reference-resolved permission checks and private/no-store delivery. Shared references must all permit access; unknown references, traversal and symlink escapes fail closed.
- Evidence: `server/tests/legacyImages.test.js`, `src/utils/__tests__/protectedImages.test.ts`, `src/components/__tests__/ManagedImage.test.ts`; actual isolated filesystem access and authenticated blob-loading tests.
- Limitation: previously downloaded/cached copies cannot be recalled. Original files and stored URLs were not deleted or migrated.

## 4. High — A sighting removes the owner’s reunion action

- Status: **Fixed and verified**. Originally a confirmed lifecycle defect.
- Repair: owner reunion controls and handlers support both `lost` and `sighted` pets.
- Evidence: `src/components/__tests__/PetDetail.test.ts`, `ActivityReunion.test.ts`, and backend permitted-transition tests. Real transaction suites also cover both starting statuses.
- Scope: component and isolated database verification; no genuine owner record changed.

## 5. High — Concurrent sightings can undo “Reunited”

- Status: **Fixed and verified**. Originally reproduced with a controller fixture, not a live race.
- Repair: sighting creation and the permitted pet-status transition are one transaction, with or without images.
- Evidence: `server/tests/sightingTransactions.test.js` ran against a real local MongoDB replica set: commit, injected rollback, concurrent reunion, duplicate submission and retry, for lost/sighted pets with/without images.
- Scope: disposable `fyp_transactions_sighting_*` database only; provider mocked; no Atlas writes.

## 6. High — Session changes do not consistently invalidate existing state

- Status: **Fixed and verified** within the automated scope. It remained partially addressed while the integration-review attribution defect was being repaired; the completed regressions now cover that defect too.
- Repair: authentication generation guards reject obsolete login, request and preference completions; account changes invalidate privileged state and protected image blobs. The shared Axios boundary synchronously captures the initiating context for every API operation, before asynchronous interceptors. Image selections, retries, progress and disposal also retain their initiating context.
- Evidence: `AuthCancellation.test.ts`, `AppCreationAuth.test.ts`, `apiAuthContext.test.ts`, `usePreferences.test.ts`, `useImageUpload.test.ts`, `ManagedImage.test.ts`, `ModerationScreen.test.ts`. A compile-exhaustive matrix covers all 52 API exports, same-tick invalidation and delayed responses; integrated preference tests reject old success/error rollbacks. See the 23 October evidence below.
- Limitation: #21 now resolves browser-global saved-pet isolation within the local-storage design. Physical multi-browser verification remains pending.

## 7. High — Managed-image atomicity remains a release-verification blocker

- Status: **Fixed and verified** as the original verification gap, not a previously demonstrated transaction defect.
- Evidence: `mediaTransactions.test.js` now runs through `npm --prefix server run test:transactions` on a real local replica set, covering attachment/replacement, injected failure rollback, concurrent attachment and duplicate retry. The sighting transaction suite also runs rather than being left skipped.
- Earlier separately approved provider batch: `verifyManagedImagesE2E.js` exercised avatar, pet, sighting, rescue and chat using real Cloudinary and disposable local databases; the reported exact-object cleanup confirmed all 19 temporary objects across two attempts absent. This batch did not repeat provider uploads.
- Remaining gap: browser upload-to-display interaction and production-provider operational conditions are not established by API/database/provider tests alone.

## 8. High — Dependency advisories remain unresolved

- Status: **Partially addressed**. The original audit established advisories, not successful exploitation.
- Evidence: `DEPENDENCY_SECURITY_REVIEW.md`, both lockfiles and dependency-security regressions record the approved narrow patches. That batch's production-only audits returned zero affected entries for both trees.
- Remaining: server development watcher path `nodemon → chokidar → braces` (three high entries) and root native-tool path `@capacitor/cli → xcode → uuid` (three moderate entries). These are two advisory paths, not six independent exploits. Supported upstream/major-change review remains separate work.
- Audit counts are historical results from the dependency batch, not a fresh online audit performed by this upload repair batch. Existing Node-engine/optional-package installation warnings remain documented there.

## 9. Medium — A database outage is treated as an invalid login session

- Status: **Fixed and verified**. Originally reproduced with failing database middleware fixtures.
- Repair: invalid/expired authentication remains 401; temporary authentication-service/database failures return a service error and do not erase a valid session solely because restoration failed.
- Evidence: `approvedBatchRegression.test.js` real HTTP/JWT tests with mocked database failures; frontend API/session regressions distinguish stale identity from temporary infrastructure failure.
- Scope: no deliberate Atlas outage was induced.

## 10. Medium — Abandoned uploads can permanently exhaust the pending quota

- Status: **Fixed and verified**. Originally confirmed by quota-query inspection, without creating live uploads.
- Repair: expired reservations no longer consume active pending slots. Heartbeat leases protect uploads still running; legacy records retain conservative expiry behavior. All attempts still count toward the daily limit, and undeleted/uncertain objects still consume a separate stored-image budget. Per-user transactional reservation serialization prevents concurrent quota overshoot.
- Recovery: exact-ID reconciliation (1–25 IDs), dry-run by default; application requires an additional environment guard and deletion requires a separate explicit option. Grace periods, compare-and-set claims, reference checks, provider identity checks and post-delete lookups protect active/referenced objects. Ledger metadata is retained.
- Evidence: `imageLifecycle.test.js`, `imageAuthorization.test.js`, `mediaReconciliation.test.js`; real `mediaQuotaTransactions.test.js` covers expiry boundaries, concurrent slot claims, daily/storage limits, dry-run, failed recovery/cooldown and hidden references. Provider mocked.
- Final verification: the corrected authorization fixtures passed in the complete backend rerun (258 passed, zero failed), and the real local quota/recovery suite ran without skipping. Existing assertions were preserved; see the final verification record below.
- Follow-up verification in the #12–#15 batch: the actual `mediaRepository.refreshLease` predicate ran against real isolated MongoDB. An active matching uploading lease extends by the configured interval even when nominal reservation expiry is old; exact-boundary/expired leases, wrong tokens, wrong states, absent legacy leases and missing IDs do not extend. Rejected updates leave the complete document unchanged. This closes the previously recorded heartbeat-predicate coverage gap; provider behavior remains mocked.
- Limitation: no existing assets were reconciled or deleted. The finite storage safety cap can intentionally block a user with unresolved provider debt; it is not bypassed by expiry. No background/bulk cleanup is enabled.

## 11. Medium — Moderators cannot retrieve some image evidence

- Status: **Fixed and verified**. Originally confirmed policy mismatch; live managed evidence had not been verified.
- Repair: `GET /api/moderation/reports/:id/images/:index` revalidates current administrator role, report, target, owner and current image association on each request. Hidden reported targets can be inspected; only the reported message, never its conversation, is eligible. Ordinary delivery policies remain unchanged.
- Evidence: `moderationEvidence.test.js` real HTTP/JWT role matrix with mocked database/provider, plus real temporary legacy-file reads and raster processing; invalid/stale report and target references, repeated requests, shared private files, SVG/remote URL rejection. `ManagedImage.test.ts` and `ModerationScreen.test.ts` cover authenticated blobs, revocation, stale queues and all three locales/both themes.
- Final verification: included in the passing complete backend and frontend reruns. Shared `imageProcessing.test.js` independently verifies orientation correction and removal of EXIF/GPS/copyright metadata from a metadata-bearing JPEG. The report-scoped legacy-file test itself uses a clean PNG, not that EXIF-bearing fixture.
- Limitations: remote legacy evidence is limited to known image-CDN hosts and supported JPEG/PNG/WebP raster input; no general URL proxy. No live moderation records/provider objects changed, and no browser claim is made for the admin evidence gallery.

## 12. Medium — Rescue management controls exceed administrator permissions

- Status: **Fixed and verified**. The API exposes separate author-only `canEdit`/`canDelete` and author-or-shelter `canUpdateStatus`; legacy `canManage` now means author management only. Forced-public projections expose no management permissions.
- Repair: the detail screen gates caption/image editing, deletion and status controls separately and guards the corresponding handlers. Shelter administrators see only the status actions they can actually perform; backend author-only edit/delete/image checks remain intact.
- Evidence: `mediaFlowsIntegration.test.js` HTTP/JWT matrix covers author, unrelated users, shelter and guest (including 401/403 and image-edit denial). `rescueTransactions.test.js` uses real isolated MongoDB for role projections, permitted shelter status changes and denied shelter author mutations. `StrayDetailScreen.test.ts` proves shelter-only controls do not render author fields/image editor/delete actions.
- Limitations: browser visual/keyboard inspection remains pending. No general administrator edit/delete privilege was introduced.

## 13. Medium — Rescue mutation failures have incomplete feedback

- Status: **Fixed and verified**. Edit, deletion and rescue-status operations have separate busy/error states, shared management submission exclusion, visible progress/success feedback and retryable localized errors. Failed edits retain entered text; failed/cancelled deletion does not navigate away.
- Repair: handlers validate permissions and reject duplicate clicks, and route/account/auth-generation guards ignore obsolete completions. Caption controls remain disabled while management requests are pending. Comment deletion also has a submission guard and visible failure feedback.
- Evidence: `StrayDetailScreen.test.ts` exercises edit/status/delete failures, retained input and successful retry, repeated-click locks, cancelled deletion, successful deletion navigation, stale account failure suppression, and all three locales in both themes. Tests inject API failures; no live mutation/network outage was induced.
- Limitations: these are component/jsdom checks, not physical-device contrast/layout or browser interaction verification.

## 14. Medium — Comment retry identity is inconsistent

- Status: **Fixed and verified**. Comments retain their submission ID across uncertain retries of the same account/post/text; changed payloads receive a new ID. Chat likewise retains an unchanged request and rotates its ID after a payload/conversation change.
- Backend repair: `submissionIdentity.js` validates the actual atomic upsert winner (and duplicate-key recovery), not a preflight existence assumption. Comments bind author/key to destination and text; chat binds sender/key to pet, effective participant, text, shared-post reference and ordered image IDs. Identical replay returns 200/duplicate; creation returns 201; conflicting reuse returns localized stable `SUBMISSION_CONFLICT`/409 without exposing previous content. Hidden comment replay returns 404. Existing blocking and parent/conversation visibility checks still run.
- Managed chat repair: `commitContentImages` validates the complete replay payload before returning an existing attachment and carries the validator through a fresh-transaction duplicate-key retry. No unrelated asset is claimed/retired on conflict. Ordinary upserts timestamp inserts only, preserving existing content and timestamps even on conflicting/hidden replay.
- Evidence: HTTP integration and attachment-service regressions cover conflicting text/post/conversation/shared/image/no-image payloads, hidden replay, no conflicting-target notification, callback propagation and unchanged attachment state. Real isolated `rescueTransactions.test.js` proves one row under identical concurrent comment/message requests and rejection of different concurrent comment payloads, changed destination/text/shared posts, and edited-comment replay without reverting the edit. Frontend tests cover lost-response retry identity and changed-text ID rotation for comments and chat.
- Compatibility: the existing author/submission and sender/request unique indexes are unchanged; no migration. Replaying an original creation after its comment was edited conservatively returns conflict rather than returning or overwriting different content. Persistence of retry IDs across page reloads is not provided. Provider operations remain mocked, and no live messages/comments were created.

## 15. Medium — Blocked comments remain in previews and counts

- Status: **Fixed and verified**. One shared hidden-content/mutual-block predicate drives comment lists, aggregate previews and aggregate counts, with explicit ObjectId casting for aggregation. Stable timestamp/ID sorting preserves consistent order.
- Repair: the API client retains pagination metadata, and detail counts come from the server total after loading/addition/deletion, never the length of one loaded page. Load-more merges by comment ID and sorts chronologically. A per-comment-request epoch prevents an older page/error/finalizer from overwriting a newer block or mutation refresh; account/route guards remain. Status/caption responses merge only their changed fields so they cannot overwrite newer counts or image state from another operation.
- Evidence: real isolated MongoDB aggregation/query tests compare visible previews, totals and paginated rows for guests/authenticated users, hidden comments and reverse-direction blocks with more than one page of fixtures. Component tests prove totals of 123/122 are preserved with one/two loaded rows, overlapping-page IDs do not duplicate, and late pagination success/failure cannot restore blocked/deleted state or stale totals/errors.
- Limitations: a browser/client must refetch to learn about later moderation/block changes; this does not add real-time push synchronization. Existing legacy indexes remain unchanged.

## 16. Medium — Message unread indicators and notification destinations are misleading

- Status: **Fixed and verified** in isolated automated tests, including real local MongoDB operations. Originally confirmed timestamp-only inbox logic could count outgoing messages, and message-notification taps lacked the correct conversation context.
- Repair: optional internal `Message.readBy` and authenticated/rate-limited `PATCH /api/chat/:petId/read` acknowledge only explicit incoming message IDs in the authorized owner/participant conversation. Server unread counts consider all incoming unseen messages, even if the latest message is outgoing. GET remains read-only; opening the inbox does not prematurely clear unread state. Active/focused thread rendering drives acknowledgments. Successful acknowledgments derive the matching notification as read, including notifications created later; marking a notification read never marks a message seen.
- Navigation/privacy: message references determine authorized `{ petId, participantId, messageId }` context. Ordinary administrators gain no conversation access. Missing, conflicting, hidden, inactive or blocked targets are omitted or shown as unavailable. A shared rescue post never takes precedence over the conversation destination. Fresh authorized inbox resolution precedes navigation; stale account/target continuations cannot reopen the wrong thread. Permission failures clear transcript/header/attachment state. Thread generations and feed revisions protect A→B→A changes and poll/send races.
- Evidence: `messageReadNotifications.test.js`, `creationAuthorization.test.js`, `MessagingState.test.ts`, `NotificationPresentation.test.ts`, `AppCreationAuth.test.ts` and real-Axios-adapter `apiAuthContext.test.ts` exercise incoming/outgoing/read identity, guest/owner/reporter/unrelated/shelter-admin boundaries, legacy references, selected conversation, read failures, hidden/blocking cases and account switching. Four same-tick Axios dispatch reproductions failed before request-start pinning and passed afterward, without live transport. `rescueTransactions.test.js` verifies real concurrent `$addToSet` acknowledgments, one reader entry, outgoing/other-thread exclusion and unseen later arrivals against a disposable local replica set.
- Compatibility/limits: missing historical `readBy` is conservatively unread until an authorized conversation is opened; old local timestamp keys are no longer authoritative. No bulk backfill or new index. Conversations lacking a safe participant and message notifications without resolvable references cannot be guessed. Conversation-open read semantics cover loaded bubbles, not per-bubble viewport tracking. Other devices learn changes on polling; no push feature was added. Actual browser/device and live Atlas verification were not performed.

## 17. Medium — Some generated text and dates ignore the selected language

- Status: **Fixed and verified** for the audited generated-notification/chat-date/validation paths through automated coverage in English, Traditional Chinese and Simplified Chinese.
- Repair: notification reads reconstruct safe, stable `event.code`/`params` and `createdAt` from current permitted references. Frontend presentation translates system templates and known district/species labels rather than rendering stored English title/body/time. Actual message/comment text and pet/user names remain authored content. Legacy records receive presentation metadata on read without rewriting MongoDB. Unresolvable legacy references fail safely; missing dates display a localized unknown state rather than fabricated time.
- Dates/errors: chat groups actual calendar dates (Today, Yesterday, or localized historical date); clock times use the selected app locale, not browser language. Registration/profile/report/sighting/comment/chat validation supplies relevant stable codes, field names and bounded constraints. Central Mongoose validation exposes known fields/limits only, not rejected values or private driver messages. Auth/network failures use localized presentation while preserving authentication versus temporary-service semantics.
- Evidence: `NotificationPresentation.test.ts` checks reactive switching across all three locales, localized modern/legacy system text, unchanged names/authored text, and useful validation limits; `MessagingState.test.ts` checks historical day groups and clock formatting in all three locales. Backend notification/privacy tests verify district-only presentation and actual authorized authored text; `errorHandling.test.js` verifies codes/limits and non-disclosure of rejected values. Existing locale/theme and privacy/image regressions remain enabled.
- Limits: this does not translate user-generated content or rewrite persisted English compatibility fields. Browser-native form-validation wording follows the browser; application error states are localized. Browser visual layout, screen-reader pronunciation and physical-device time-zone behavior remain unverified.

## 18. Medium — Lost-pet coordinates can contradict the entered location

- Status: **Fixed and verified** within automated component/controller coverage. Originally a confirmed source defect; no genuine report was created to reproduce it.
- Repair: `PostPetScreen.vue` reuses the explicit location picker and submits only a confirmed last-seen point. GPS is optional and still requires confirmation. The initial Hong Kong map viewport is display-only, never a submitted fallback. Backend validation rejects nonnumeric, nonfinite, malformed and out-of-range pairs without coercion, preserving `[longitude, latitude]`.
- Evidence: `PostPetImages.test.ts` covers no confirmation, GPS denial/unavailability/timeout, offline map/manual entry, form retention, exact submitted coordinates, retries and stale upload completions; `SightingLocationPicker.test.ts` covers click/drag confirmation, invalidation, partial typing, disabled interaction and late GPS results; `petController.test.js` asserts invalid pairs are rejected before persistence and valid coordinates remain in order.
- Boundary: geolocation, Leaflet and API writes are mocked in these tests. Actual browser/physical-device location and visual behavior were not verified; historical records are unchanged.

## 19. Medium — Hotspot totals silently truncate larger datasets

- Status: **Fixed and verified** for the confirmed source-truncation defect through actual isolated MongoDB aggregation, not only mocked pipelines. Live Atlas volume/performance was not measured.
- Repair: eligible sightings and active/legacy rescue posts are grouped into the existing public grid in MongoDB; both sources are merged before applying a deterministic 1,500-cell display limit. Summary report/source/cell totals include every eligible record, never a nearest-750 sample. Explicit returned-cell/returned-report counts and a truncation flag distinguish displayed coverage. Radar displays the limit notice in all three languages when needed.
- Evidence: `server/tests/hotspotMongo.test.js` verifies 860 sightings + 865 rescue reports, a formerly omitted distant cell, and 3,210 mixed-source reports across 1,600 cells, with complete totals and exactly 1,500 returned cells. It checks visibility/inactive exclusions, legacy data, inclusive time/radius boundaries, signed grid math, integer per-record weights and deterministic ordering. Existing controller/public-projection/privacy tests also pass. See the dated verification section below.
- Limits: radius/time validation and the 750-metre privacy grid remain unchanged. A 10-second deadline and disabled disk spill may reject oversized/slow queries rather than silently sample them; no partial result is represented as complete. Existing blocking policy preserves public emergency discovery, not personalized analytics. No records, schema or indexes were migrated.

## 20. Medium — Long passwords are silently truncated by bcrypt

- Status: **Fixed and verified** for the approved new-password validation repair, with the retained login compatibility limitation below. The original real-bcrypt truncation reproduction was a confirmed defect, not a suspected risk.
- Repair: registration and the existing development seed password gate share authoritative UTF-8 validation before hashing: at least the existing six JavaScript characters and at most 72 UTF-8 bytes. Registration sends `PASSWORD_TOO_LONG`, `field: password`, and `params.maxBytes: 72`. The registration UI counts bytes, preserves input, and displays guidance and server errors in English, Traditional Chinese and Simplified Chinese. No change/reset flow exists or was added. No schema hash-length constraint, password transformation, algorithm change or rehash was introduced.
- Evidence: `server/tests/passwordPolicy.test.js` runs real bcrypt hashing/comparison and real loopback Express auth routes with mocked User persistence. `AuthPasswordPolicy.test.ts`, `passwordPolicy.test.ts` and existing session/cancellation regressions cover boundaries, Unicode, localized errors, retries and stale completions. See the dated verification section below.
- Compatibility limitation: login deliberately retains raw bcrypt comparison without the new maximum. An existing hash cannot identify the original password length or distinguish suffixes after byte 72. Such suffixes still compare equally, including suffixes appended to a newly created password of exactly 72 bytes. Selectively eliminating this ambiguity requires additional scheme/version metadata or a different approved password strategy; silently rejecting historical long inputs would risk lockout. No existing account/hash was changed.

## 21. Low — Saved-pet state and failures are inconsistent

- Status: **Fixed and verified** for local saved-pet account isolation and retrieval through component/session/API-interceptor tests. The original global-key and false-empty behavior were confirmed defects, not merely suspected risks. Actual browser/device verification remains unavailable.
- Repair: validated IDs only in separate v2 guest/confirmed-user namespaces. Unverified sessions expose no namespace; logout/switch/storage invalidation synchronously clear view data and invalidate requests. Verified identity is activated only after guarded login/profile success. Same-token cancellation can retain the confirmed principal, but external changes always discard that binding, including rapid A→B→A transitions. Queued/stale storage payloads cannot select an account or override current stored IDs.
- Retrieval: distinguish empty, unavailable and retryable failures; retain every saved ID, preserve successful branches, bound pet requests to four workers and 20 IDs per page, and retain server rescue pagination/total including unavailable pages. Profile unsave refreshes page one after offset changes; stale unsave completions cannot alter another account.
- Evidence: new `useSavedPets.test.ts`, `SavedScreen.test.ts`, `SavedRescuePostsTab.test.ts`; extended `AppCreationAuth.test.ts`, `apiAuthContext.test.ts`, and `ProfileScreen.test.ts`. Real Axios interception is exercised with an isolated transport; component APIs are mocked, not live Atlas writes. See the dated batch evidence and all-22 summary below.
- Legacy policy: leave browser-global `pawradar_saved_pets` untouched and unread. Its ownership cannot be determined; nothing is automatically assigned to guest or the next logged-in user. Account-backed/cross-device pet saves remain outside this repair.

## 22. Low — Plain-HTTP mobile development can fail during image initialization

- Status: **Fixed and verified** for the confirmed initialization defect through automated capability tests; **not reproduced or verified on a phone**.
- Repair: `secureRequestId.ts` uses 128 cryptographically generated bits from `getRandomValues`, without depending on `randomUUID` or weak randomness. Upload, pet-report and chat identities are allocated lazily inside guarded action paths, never during setup/reset/finish/disposal. Missing or throwing secure randomness yields a localized, recoverable error, preserving input. Uncertain retries retain identity; successful chat cleanup needs no new ID. Camera conversion is checked again before dispatch after an account switch.
- Evidence: `useImageUpload.test.ts` covers absent `randomUUID`, absent/throwing secure RNG, safe lifecycle methods, retries and stale camera/upload responses across all existing purpose regressions. `PostPetImages.test.ts` checks retained form data and capability errors in English, Traditional Chinese and Simplified Chinese. `ChatscreenSharedStray.test.ts` checks safe mount, retained draft, stable retry IDs and successful cleanup after randomness becomes unavailable.
- Boundary: frontend capability/HTTP mocks, not actual LAN-browser/device or real-provider verification. GPS may still require HTTPS/browser permission; manual point selection remains available. A browser without secure randomness must use a supported browser/secure origin before submitting; there is deliberately no weak fallback.

## Verification boundaries

- Earlier #10–15 repair batches: frontend unit/component suites, backend unit/HTTP/authorization suites, real local MongoDB transaction suites, TypeScript, ESLint, backend syntax and production build. Their exact totals and boundaries are recorded below. The #18/#22 batch has its own verification section; it did not rerun real database/provider operations.
- Earlier isolated provider operations are mocked. Real local database fixtures use uniquely named disposable databases, exact tracked fixture removal and owned replica-set shutdown. Atlas, `petlostapp`, `sample_mflix`, runtime environment files and existing images/records are untouched by the current batch.
- Reconciliation was tested only with isolated fixtures; no live reconciliation command, migration, seed or bulk cleanup ran. Normal application startup can provision the newly declared budget collection/indexes; no live schema/index deployment was performed here.
- Browser visual layout, physical mobile/macOS behavior and production reverse-proxy behavior require separate evidence. Passing automated tests is not a blanket public-release sign-off.

## Historical final #10/#11 verification — 17 October 2026

This completes the pending automated rerun after the authorization fixture corrections. No new repair batch was started; finding #20 and every other open item above retain their status. Only this checklist was edited during this final-verification pass; application code, tests and routing configuration were not changed.

| Check | Final result | Evidence type / boundary |
|---|---|---|
| Complete backend suite, `node --test server/tests/*.test.js` | 258 passed, 0 failed, 3 skipped (261 entries) | Unit and HTTP/JWT integration; database/provider largely mocked. Three guarded real-database suites are intentionally opt-in here. |
| `npm --prefix server run test:transactions` | 19 passed, 0 failed, 0 skipped across all three real-database suites | Actual MongoDB 8.0.17 loopback-only WiredTiger replica set; Cloudinary mocked. Includes quota/recovery, image attachment/replacement/rollback and sighting/status concurrency. |
| `npm run test:frontend` | 166 passed in 29 files | Unit/component/jsdom tests, including moderation gallery locale/theme permutations and account-switch invalidation; not browser visual evidence. |
| `npm run typecheck` | Passed | Vue TypeScript checking. |
| `npm run lint` | Passed | ESLint, zero warnings. |
| Backend `node --check` | 121 JavaScript files passed | All backend source/script/test JS; dependencies and upload files excluded. |
| `npm run build` | Passed | Existing >500 kB main-chunk warning remains (approximately 734 kB before gzip). No unrelated bundle changes. |
| Secret audit | Passed after exact synthetic-fixture review | Scanned 291 working files and 273 Git-index blobs against local credential values and credential patterns, without printing values. The two existing `.test`-domain URI fixtures in `database.test.js` and `errorHandling.test.js` test redaction; no unresolved matches and no tracked runtime environment files. |
| `git diff --check` | Passed | No whitespace errors. |
| Browser verification | Pending | Earlier Computer Use stopped because Chrome's current URL could not be established safely. No browser/visual pass is claimed or retried by this final automated pass. |
| Live Atlas / Cloudinary | Not run in this pass | Not needed for the isolated regression rerun; no live records, provider objects or indexes changed. |

### Fixture-assertion review

- `imageAuthorization.test.js`: the correction adds `reserve` and `refreshLease` adapters to its injected repository. Existing HTTP status, ownership/role, safe-metadata, unauthorized-preview, multipart validation and pre-provider denial assertions are unchanged. Its mock does not establish real quota locking; the separately executed MongoDB suite supplies that evidence.
- `imageLifecycle.test.js`: reservation still calls the patched `create` mock, so injected reservation failures and duplicate-key errors remain exercised. Quota rejection and no-provider-operation assertions remain; expiry and heartbeat tests add coverage rather than remove checks.
- `mediaFlowsIntegration.test.js`: session-aware query/count, array-create and budget-upsert adapters support the new repository interface. Chat retry assertions are stronger: initial 201/nonduplicate, retry 200/duplicate, same message ID, one message and one notification, while conversation/blocking denial checks remain.
- A real read-only specialist delegation was created and completed using the explicit `gpt-6-astra` / `high` fallback. It found no weakened assertions or confirmed final-verification blocker. Model/effort are the requested tool parameters, not independently exposed serving-model metadata; named-agent automatic loading remains unverified. The specialist ran no tests/services and edited no files.

### Remaining boundaries and safety

- At this earlier pass, heartbeat scheduling/token consistency was unit-tested but the exact MongoDB refresh predicate still lacked a real-database exercise. The subsequent #12–#15 batch below closes that specific gap with the focused real-MongoDB test requested by the user.
- The isolated run used replica set `fyp_transactions_58a87856a9e848ea9afaf00e530d1d98` and dedicated `fyp_transactions_quota_*`, `fyp_transactions_media_*` and `fyp_transactions_sighting_*` databases. The quota database was `fyp_transactions_quota_3d40f2547ba645b9899c0ccff953fb36`; the sighting database was `fyp_transactions_sighting_f94a03f9abf0403d834ffe76b7a54e4c`. Exact owned fixtures were removed and zero remaining tracked fixtures confirmed; the owned replica set and disposable storage were stopped/removed by the harness.
- No Atlas connection, `petlostapp`/`sample_mflix` access, real provider operation, live cleanup, seed, migration or application startup occurred. Existing records, provider assets, original uploads and runtime environment files were preserved. The production build regenerated ignored `dist/` output only.
- Schema/index deployment remains future operational work: the repair adds the private `mediauploadbudgets` collection with a unique user index and two MediaAsset lease indexes. Normal enabled-upload startup provisions these; this verification did not. Existing records need no migration, and legacy indexes were not removed.
- `.codex/config.toml`, `.codex/agents/fyp_architect.toml` and `AGENTS.md` belong to the separate routing-configuration task, not the application repair. They were left unchanged. Existing repair/dependency work remains uncommitted; nothing was committed or pushed.

## #12–#15 repair and #10 heartbeat follow-up — 17 October 2026

Only this repair batch was implemented; new features and #16–#22 remain paused. Requested explicit-model specialist delegation (`gpt-6-astra`, `high`) reviewed retry/security semantics read-only, then final readiness. It identified the overlapping comment-fetch race; the fix and two regression tests were added and source-reviewed. No unresolved blocker remained in that bounded review. This records requested tool settings and actual agent completion, not independent serving-model metadata or automatic named-agent loading.

| Verification | Result | Boundary |
|---|---|---|
| Complete backend regression suite | 262 passed, 0 failed, 4 opt-in skipped (266 entries) | Unit and HTTP/JWT integration; regular suite does not connect to Atlas or an application database. |
| Real local replica-set suites | 25 passed, 0 failed, 0 skipped | All four suites ran: upload quotas/heartbeat, media transactions, sighting transactions and rescue/comment/message queries/races. Cloudinary mocked. |
| Frontend regressions | 177 passed in 29 files | Includes operation errors/locks, retry identity, permission-specific controls, authoritative totals, stale refresh/status races and locale/theme permutations. |
| Vue TypeScript / ESLint | Passed / passed | Zero lint warnings. |
| Backend syntax | 123 JavaScript files passed | Excludes dependency and upload directories. |
| Production build | Passed | Existing >500 kB main-chunk warning; approximately 739 kB before gzip. |
| Frontend startup | HTTP 200 for `/`, `/strays/verification-only` and the transformed detail component | Temporary loopback Vite server closed cleanly; HTTP startup checks are not browser interaction evidence. |
| Secret / whitespace checks | Passed | Working-tree and Git-index scans found no unresolved local-secret or credential-pattern matches; exact fictional redaction-test URIs were reviewed. No tracked runtime environment files; `git diff --check` passed. |

The final isolated run used replica set `fyp_transactions_4ead5346e80e4a2781961d5841a38b2f`, quota database `fyp_transactions_quota_0dd2b33b719942ab87c74da1e8dc91d1` and rescue database `fyp_transactions_rescue_b2bac338a7d8490988ce98770fc6462b`, plus dedicated media/sighting databases. Exact owned fixtures were removed and absence asserted; the owned replica set and disposable storage stopped/removed cleanly. An initial new rescue fixture omitted required `reporterName`; that fixture was corrected without weakening assertions, and the full local run then passed. The metadata-bearing image-processing regressions continue to run, but real provider uploads and browser evidence were not repeated.

No application schema/index migration was required for #12–#15; existing unique keys and legacy indexes are retained. No Atlas/application-record/provider-asset/original-image/environment changes, live cleanup, seed, migration, commit or push. Routing configuration is not application repair work and remains unchanged. Browser visual/keyboard/physical-device verification remains pending; mocked HTTP authorization is distinguished from actual local MongoDB query/concurrency verification above.

Changed files in this batch:

- Backend behavior: `server/controllers/strayController.js`, `server/controllers/chatController.js`, `server/middleware/errorHandler.js`, `server/services/mediaAttachments.js`, new `server/services/submissionIdentity.js`.
- Backend verification: `server/scripts/testTransactions.js`, `server/tests/helpers/localTransactions.js`, `server/tests/mediaQuotaTransactions.test.js`, `server/tests/mediaAttachments.test.js`, `server/tests/mediaFlowsIntegration.test.js`, new `server/tests/rescueTransactions.test.js`.
- Frontend behavior/contracts: `src/views/StrayDetailScreen.vue`, `src/components/Chatscreen.vue`, `src/services/api.ts`, `src/types/stray.ts`, `src/i18n/index.ts`, all three `src/locales/{en,zh-HK,zh-CN}.json` files.
- Frontend verification: `src/views/__tests__/StrayDetailScreen.test.ts`, `src/components/__tests__/ChatscreenSharedStray.test.ts`, `src/components/__tests__/ProfileScreen.test.ts`, `src/components/__tests__/StrayRescueScreen.test.ts` (the latter two update typed permission fixtures).
- Tracking: `AUDIT_FINDINGS_CHECKLIST.md`. No routing-configuration files changed.

## #18/#22 repair verification — 19 October 2026

Only the approved accurate last-seen location and mobile image-initialization repairs were implemented. No other finding or new feature was started. A real read-only specialist agent was created and completed with the explicitly requested `gpt-6-astra` / `high` fallback; named configuration loading remains unverified. It confirmed the original defects and identified two intermediate picker problems (partial coordinate typing and draggable markers while disabled); both received focused fixes and regression tests. The specialist edited no files or external data.

| Verification | Final result | Evidence / boundary |
|---|---|---|
| Frontend, `npm run test:frontend -- --maxWorkers=1` | 197 passed in 29 files; 0 failed | jsdom/component tests, mocked Leaflet/geolocation/API/provider requests. Includes existing privacy/image/session regressions and all three new localized capability messages. |
| Backend, `node --test --test-concurrency=1 tests/*.test.js` in `server/` | 263 passed, 0 failed, 4 opt-in skipped (267 entries) | Controller/model and real loopback HTTP/JWT tests with mocked persistence/provider operations. Existing real-database transaction suites were not invoked in this batch. |
| Vue TypeScript / ESLint | Passed / passed | Final application/test sources; zero lint warnings. |
| Backend syntax | 123 JavaScript modules passed | Parsed with Node's `vm.SourceTextModule`, without executing server modules; dependencies/uploads excluded. |
| Production build | Passed | Existing >500 kB main-chunk warning remains (approximately 743 kB before gzip). |
| Frontend startup | HTTP 200 for `/report` and transformed PostPet/picker/secure-ID modules | Owned loopback Vite server stopped cleanly. This is not browser interaction evidence. |
| Tracked-secret / whitespace audit | Passed | Working tree and Git index scanned against local secrets and credential/JWT patterns; exact fictional redaction-test URIs reviewed. No tracked runtime environment file; `git diff --check` passed. |
| Browser / device / live database / real provider | Not performed | No visual, physical-phone, GPS-hardware, real database-transaction or provider-delivery pass is claimed for this batch. |

Initial parallel runs encountered Vitest worker-start timeouts and the existing provider-harness child-process timeout. Final serial runs passed without changing timeouts or weakening assertions. A frontend run overlapped the final stale-camera guard edit and failed the new regression; the complete final rerun above passed after the source stopped changing. The former PostPet GPS-paused auth test now pauses an actual image upload, preserving its account-switch/unmount assertions after submission no longer requests GPS.

There are no schema/index changes, migrations or historical-coordinate rewrites. No application backend/Atlas connection, `petlostapp` or `sample_mflix` access, live upload, seed, migration, reconciliation or cleanup command ran. No database records or provider assets changed. Baseline checksums confirm existing environment files, original images/uploads, manifests/lockfiles and routing instructions/configuration are unchanged. The build regenerated ignored `dist/` output only; no commit or push occurred.

Changed files:

- Backend: `server/controllers/petController.js`, `server/tests/petController.test.js`.
- Frontend: `src/components/PostPetScreen.vue`, `src/components/SightingLocationPicker.vue`, `src/components/Chatscreen.vue`, `src/composables/useImageUpload.ts`, new `src/utils/secureRequestId.ts`.
- Localization: `src/i18n/index.ts`, `src/locales/en.json`, `src/locales/zh-HK.json`, `src/locales/zh-CN.json` (four shared keys per locale).
- Regressions: `src/components/__tests__/PostPetImages.test.ts`, `src/components/__tests__/SightingLocationPicker.test.ts`, `src/components/__tests__/ChatscreenSharedStray.test.ts`, `src/composables/__tests__/useImageUpload.test.ts`.
- Tracking: this checklist. No routing-configuration changes.

## #16/#17 repair verification — 19 October 2026

Only the approved messaging/unread/notification-destination and generated-language/date/validation repairs were implemented. Prior uncommitted #18/#22 work was retained. A real specialist agent (`/root/fyp_architect_message_read`) was created and completed using explicitly requested `gpt-6-astra` / `high` parameters and manually supplied specialist instructions. Named configuration loading and independent serving-model metadata remain unverified. Backend implementation ownership was bounded; follow-up security/session reviews were read-only. The reviews identified poll/send overwrite, A→B→A lifecycle and authorization-error cache issues; fixes and targeted regressions were integrated.

| Verification | Final result | Evidence / boundary |
|---|---|---|
| Complete frontend, `npm run test:frontend -- --maxWorkers=1` | 228 passed in 31 files; 0 failed | jsdom/component tests plus real Axios interceptors with an isolated adapter. Covers prior privacy/image regressions, all three languages, unread/read failure, historical grouping, notification navigation, account changes and stale asynchronous responses. No real browser transport or provider uploads. |
| Complete backend, `npm --prefix server test` | 280 passed, 0 failed, 4 opt-in skipped (284 entries) | Standard parallel run passed; controller/model mocks and real loopback HTTP/JWT boundaries. Includes guest acknowledgment rejection and owner/reporter/unrelated/shelter-admin policy fixtures. |
| `npm --prefix server run test:transactions` | 26 passed, 0 failed, 0 skipped across all four suites | Actual MongoDB 8.0.17 loopback-only replica set. New simultaneous acknowledgment test proves one reader entry, excluded outgoing/other-thread IDs, and a later unseen message remaining unread. Existing media/sighting/quota/rescue transactions still pass. Cloudinary mocked. |
| Vue TypeScript / ESLint | Passed / passed | Final source; zero lint warnings. |
| Backend syntax | 124 JavaScript modules passed | Node `vm.SourceTextModule` parsing without executing application startup; dependencies/uploads excluded. |
| Production build | Passed | Existing main-chunk size warning remains, approximately 755 kB before gzip. |
| Frontend startup | HTTP 200 for `/` and changed chat/inbox/notification/presentation modules | Owned loopback Vite server stopped cleanly. No browser interaction pass implied. |
| Secret / whitespace checks | Passed | Working tree and Git index compared against local secrets and credential/JWT patterns; exact fictional redaction-test URIs reviewed. No tracked runtime environment file. `git diff --check` passed. |
| Browser / physical device / live Atlas / real provider | Not performed | Browser inventory returned no apps or browser surfaces. No screenshots, visual accessibility, actual device, live account or real-provider verification is claimed. |

### Schema, compatibility and safety

- `Message.readBy` is optional, internal and language-independent. Existing conversation indexes suffice; no new indexes, collection, migration, bulk rewrite or historical date/read-state backfill. Reader arrays are omitted from ordinary message and notification DTOs; they are not public read receipts.
- Read acknowledgment is an authenticated, mutation-rate-limited PATCH for up to 500 explicit IDs, with current visible parent, conversation ownership and bilateral blocking checks. Atomic `$addToSet` is idempotent; no timestamp watermark can accidentally include an unseen concurrent arrival. Acknowledgment is never a GET side effect or automatic form submission.
- Missing legacy read state means incoming unread until opened; outgoing-only conversations remain read. Unresolvable legacy message/participant references cannot safely produce a conversation destination and are omitted, not deleted. Existing local timestamp markers remain untouched but are no longer authoritative. Seen-message notifications are derived as read; notification mark-read does not acknowledge a message.
- Structured presentation is reconstructed on read, so valid existing notification records need no rewrite. All five notification types and text/photo/shared-message variants use localized templates. There are 34 new repair keys per supported locale (102 translations); names and actual authored text remain unchanged. Known validation fields and bounded constraints provide useful localized detail without returning rejected values or raw private error messages.
- Messaging request wrappers capture the initiating authentication context before Axios queues its interceptor. Four isolated-adapter tests first reproduced unintended same-tick dispatch under a replacement account; the fixed wrappers reject before transport, preserve `AUTH_CONTEXT_CHANGED`, and retain existing post-dispatch response guards. This request-start pinning is scoped to messaging, not a new universal audit of unrelated write wrappers.
- Read semantics are conversation-open/loaded messages in a focused visible page, not per-bubble viewport tracking. Other tabs/devices synchronize through existing polling; no push mechanism was added. Legacy notifications missing dates use a localized unknown state. Browser-native validation wording follows the browser. Visual/mobile/time-zone/keyboard/screen-reader checks remain separate from automated coverage.

The isolated run used replica set `fyp_transactions_571a3faaeabb4565ab3dd9cfd03c61fb` and dedicated quota/media/sighting/rescue databases; the new acknowledgment test ran in `fyp_transactions_rescue_12cf43ff3c4c4765863c0ae6dd7bf296`. Exact owned fixture removal and absence were asserted, then the owned replica set/disposable storage stopped/removed. This was test-harness fixture teardown, not a live cleanup command. No Atlas, `petlostapp`, `sample_mflix`, real provider, live upload, seed, migration, reconciliation or application cleanup access occurred. Existing application records, provider assets, images/uploads and runtime environment files were untouched. Baseline checksums also confirm manifests/lockfiles, routing configuration and instructions are unchanged. No commit or push.

### Previous serial rerun and remaining test instability

The prior #18/#22 backend failure was the existing `managedImagesHarness.test.js` safety test: its `spawnSync` child had a 15,000 ms deadline and returned `status: null`, not the expected refusal exit code `1`, after approximately 15.2 seconds. It was not a failed coordinate/privacy assertion. The same test passed in the serial full rerun. Heavy Windows child-process/import startup under parallel load is a plausible explanation, but sandbox versus resource/startup cost was not conclusively isolated; the timeout risk therefore remains recorded rather than claimed fixed.

This batch's two fresh standard parallel full backend runs passed (279 and, after the final validation test, 280 passes). No timeout was increased, advisory suppressed or safety assertion weakened. Frontend runs use one worker following the previously observed worker-start timeout. A new fixture initially attempted to spy on jsdom's absent `scrollTo`; the fixture assumption was removed and the application now safely falls back to `scrollTop`. Intermediate same-tick dispatch tests intentionally failed before the repair; the final complete run was performed after application/test source changes stopped and passed 228/228. There are no unresolved assertion failures, but cold/overloaded child-process timing remains an environmental test risk.

### Files changed in this batch

- Backend behavior/contracts: `server/controllers/authController.js`, `server/controllers/chatController.js`, `server/controllers/notificationController.js`, `server/controllers/petController.js`, `server/controllers/strayController.js`, `server/middleware/errorHandler.js`, `server/models/Message.js`, `server/routes/chat.js`.
- Backend verification: `server/tests/creationAuthorization.test.js`, `server/tests/errorHandling.test.js`, `server/tests/rescueTransactions.test.js`, new `server/tests/messageReadNotifications.test.js`.
- Frontend behavior/contracts: `src/App.vue`, `src/components/AuthScreen.vue`, `src/components/ChatInboxScreen.vue`, `src/components/Chatscreen.vue`, `src/components/NotificationsPanel.vue`, `src/services/api.ts`, `src/types/notification.ts`.
- Localization: `src/i18n/index.ts`, `src/i18n/formatters.ts`, new `src/i18n/notifications.ts`, `src/locales/en.json`, `src/locales/zh-HK.json`, `src/locales/zh-CN.json`.
- Frontend verification: `src/components/__tests__/AppCreationAuth.test.ts`, `src/services/__tests__/apiAuthContext.test.ts`, new `src/components/__tests__/MessagingState.test.ts`, new `src/components/__tests__/NotificationPresentation.test.ts`.
- Tracking: this checklist. In total, 26 existing files changed relative to this batch's starting snapshot and four files were added. Earlier #18/#22-only files remain preserved; there are no deletions or routing-configuration changes.

## #20 password-byte policy verification — 20 October 2026

### Supported limit, scope and compatibility decision

- Installed `bcryptjs`: **3.0.3**, unchanged. Its [official security guidance](https://github.com/dcodeIO/bcrypt.js#security-considerations) specifies a 72-byte UTF-8 input limit and explains that the library does not enforce it automatically. The installed implementation and `bcrypt.truncates` agree with the new boundary tests.
- The only existing password-setting paths found by repository-wide bcrypt/password-flow searches were registration (`authController.js`) and test-user creation (`seedTestData.js`). Both now call the same side-effect-free `validateNewPassword` service. Seed validation happens before connection; the seed entry point was neither imported nor executed. There are no password-change/reset routes. Profile updates still whitelist profile fields and cannot set passwords. Stored hashes remain opaque and unchanged.
- The server uses `Buffer.byteLength(password, 'utf8')`; the UI uses `TextEncoder`, with a matching code-point counter for older webviews. Tests include lone surrogates, surrogate pairs, whitespace and decomposed Unicode. Neither layer truncates, trims, normalizes or otherwise changes password text. No character-based `maxlength` was added.
- The explicit-model fallback specialist (`gpt-6-astra`, high reasoning; standalone specialist instructions manually supplied, named loading not claimed) completed a read-only compatibility review and a final implementation review. Both recommended preserving raw login comparison; the final review found no substantive defect. The parent performed the executed verification below.
- This patch prevents silent truncation when setting new passwords. It cannot infer or repair historical input lengths from bcrypt hashes. Login continues to accept historical inputs over 72 bytes and retains bcrypt's ignored-suffix behavior, even for a new exact-72-byte password. Existing hashes/accounts are preserved; no forced reset, migration, algorithm change or new password-management feature is included.

### Automated checks in this batch

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Focused password backend suite | **16 passed** | Actual bcrypt 3.0.3 at 71/72/73 bytes for ASCII/CJK/emoji, a split-multibyte boundary, accepted raw Unicode/whitespace, rejection before lookup/hash/persistence, historical logins, ignored-suffix ambiguity, and real Express HTTP routes. User persistence is mocked, not a live database registration. Seed guard wiring is checked statically without executing the entry point. |
| Focused frontend password/session suites | **25 passed** in 3 files | Mounted Vue components, mocked auth API, registration-only limits, all three locales, unchanged payloads, retry/form preservation, absent TextEncoder fallback, and late auth completion after cancellation/account switching. |
| Complete frontend | **248 passed**, 33 files | `npm run test:frontend -- --maxWorkers=1`; includes existing privacy, image and session regressions. jsdom is not physical-device/browser verification. |
| Complete backend | **296 passed**, 0 failed, **4 opt-in skipped** (300 test entries) | `npm --prefix server test`; standard parallel run passed without fixture/assertion weakening or a serial rerun. The skipped tests are explicitly opt-in, not reported as passed here. |
| Real isolated MongoDB regressions | **26 passed**, 0 skipped | `npm --prefix server run test:transactions`: actual MongoDB 8.0.17 single-node WiredTiger replica set on loopback; fresh `fyp_transactions_*` databases, provider mocked. Exact synthetic fixture teardown and replica-set/storage shutdown completed. These existing transaction tests do not turn the mocked registration tests into real persisted-account verification. |
| Vue TypeScript / ESLint | **Passed** | `npm run typecheck`; `npm run lint`, zero lint warnings. |
| Backend syntax | **126 modules parsed** | Parse-only VM syntax check; no application startup or seed execution. |
| Production build | **Passed** | Existing main-chunk size warning remains (~757 kB minified); no unrelated optimization undertaken. |
| Frontend startup | **Passed** | Temporary loopback Vite server returned HTTP 200 for `/`, `AuthScreen.vue` and the password policy module, then stopped. This is a server/transform check, not browser verification. |
| Diff / secret checks | **Passed** | `git diff --check`; all 303 nonignored worktree files and 298 index files checked against local credential values and generic secret patterns. Eight occurrences of precisely reviewed fictional URI fixtures (worktree/index) are not actual secrets; no findings or tracked runtime environment files. |

### Preservation and limitations

No live Atlas connection or writes, real provider operations, account/password resets, seeds, migration, live cleanup, image changes or environment changes were performed. The only database writes were the existing isolated local transaction fixtures, with exact harness teardown. `sample_mflix` was not accessed. No model, index, runtime dependency, package manifest, lockfile, routing configuration or permission change was required. The development seed script change is validation code only; seeded records and passwords were not changed.

Actual browser/phone visual appearance, autofill behavior and live persisted-account registration/login were not verified in this batch. Existing frontend tests cover state transitions and all locales but cannot certify visual contrast or mobile keyboard behavior. The prior cold/overloaded Windows child-start timeout remains a known environmental risk; it did not recur in this full backend run. Follow-up work remains limited to the still-open/partial findings above, not new features.

### Changed files and Git state

- Modified: this checklist; `server/controllers/authController.js`; `server/scripts/seedTestData.js` (validation only); `src/components/AuthScreen.vue`; `src/i18n/index.ts`; `src/locales/en.json`, `zh-HK.json`, `zh-CN.json`.
- Added: `server/services/passwordPolicy.js`; `server/tests/passwordPolicy.test.js`; `src/utils/passwordPolicy.ts`; `src/utils/__tests__/passwordPolicy.test.ts`; `src/components/__tests__/AuthPasswordPolicy.test.ts`.
- Git state: eight modified and five untracked files, no deletions, no staged changes, no commit/push. File-hash comparison against the clean starting snapshot confirms the environment, uploads/public assets, routing instructions/configuration, manifests and lockfiles were preserved.

## #19 complete hotspot totals verification — 20 October 2026

### Implementation and API contract

- Removed the nearest-750 raw-record limit. Each source begins with indexed `$geoNear`, including the existing visibility, time and active-rescue constraints; sightings additionally require an existing, non-hidden parent pet. Each source groups into the existing 750-metre Web Mercator grid before `$unionWith`; matching cells merge globally before the sole display limit. There is no sampling.
- `summary.total`, `sightings`, `strays` and `cellCount` describe the complete eligible aggregation. `returnedCellCount`, `returnedTotal`, `cellsTruncated` and `maxCells` distinguish the returned subset. At most **1,500 globally ranked cells** are returned (count descending, then integer grid X/Y ascending). This retains the previous maximum possible payload of two 750-record source samples without retaining their bias. A translated Radar notice discloses reduced map coverage; complete report totals remain displayed.
- Public cells still contain only approximate centre coordinates, location precision, counts and saturating intensity. No source IDs, individual timestamps, contact fields, notes, distances or internal weights leave the API. All roles use the same snapped search centre and public projection. Personal blocking continues to restrict contact/social interactions rather than removing public emergency discovery; the analytics route had no personalized blocked-author exclusion, and no such policy was added or removed.
- Shared grid constants and centre conversion preserve existing projection arithmetic and six-decimal rounding. Mongo uses the same operation order for recency and nonnegative cent rounding as the existing JS rules. Per-record integer hundredths are summed before calculating aggregate saturation. Sparse-cell tests compare the internal per-record units, not merely already-saturated output.
- Existing coordinate validation, 1–50 km radius and 1–365 day clamping remain unchanged. Queries have a **10,000 ms** deadline and **no disk spill**. Resource/timeout failures propagate as errors, never partially complete totals. MongoDB's [union](https://www.mongodb.com/docs/manual/reference/operator/aggregation/unionwith/) and [facet](https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/) semantics were checked against official documentation. This read aggregation is not run inside a transaction.
- The explicitly selected Astra/high specialist completed bounded read-only design and implementation reviews. One suggested arithmetic-fidelity adjustment was applied and covered by a fresh real-Mongo rerun. No other repair was undertaken.

### Verification performed

| Check | Result | Scope |
| --- | --- | --- |
| Focused analytics/privacy unit and controller tests | **15 passed** | Existing weighting/projection rules, public role matrix (guest/owner/reporter/unrelated/admin), source selection, input bounds, resource options, no raw limits, public response whitelist and error propagation. Model aggregation is mocked in these controller tests. |
| Real isolated MongoDB suite | **32 passed**, 0 failed/skipped, across five suites | MongoDB **8.0.17**, loopback-only single-node replica set. Includes the five new actual geospatial subtests below, plus existing image/quota/rescue/sighting transactions. Cloudinary mocked. |
| New real geospatial case: over 750/source | **Passed** | **860 eligible sightings + 865 eligible rescue posts = 1,725** reports in two cells; distant cell contains **115** reports previously omitted. Hidden sightings/parents, missing parents, hidden/inactive rescues, old/out-of-radius records are excluded. Missing moderation/active values remain eligible. Single-source queries also match complete counts. |
| New real geospatial case: capped output | **Passed** | **3,210 reports in 1,600 cells**; exactly **1,500** cells representing **3,010** reports returned, while full totals remain **3,210/1,600**. The global mixed-source winner is selected only after merging. Ties and repeated queries match the JS reference ordering. |
| New real boundaries and weight cases | **Passed** | Inclusive time cutoff and one millisecond outside it; Mongo-measured radius just below/at/above its actual metre boundary; future timestamps retained consistently with existing rules. **144 separate sparse cells** check exact integer weights and public intensity across ages, confirmations, urgency/status and legacy fallbacks. Zero, positive/negative longitude and latitude cell boundaries and polar clamps match the existing JS projection. |
| Real-controller database privacy check | **Passed** | Controller uses the real isolated collections; strict top-level/summary/cell whitelists and private-field/ID sentinels checked recursively. No actual live account or Atlas role test. |
| Focused Radar/map frontend | **9 passed**, two files | All three localized coverage notices, complete summary versus displayed cells, no notice when complete, clearing old totals/cells after failure and existing heat rendering. Mounted jsdom components; API/Leaflet mocked. |
| Complete frontend | **252 passed**, 34 files | Includes previous password, image, session, localization and privacy regressions. |
| Complete backend | **295 passed**, 0 failed, **5 opt-in skipped** (300 test entries) | Standard parallel run passed. Previously separate mocked hotspot cases were consolidated; their inactive/hidden and source assertions are also exercised by actual isolated aggregation. The new geospatial suite is skipped without the isolated URI, but was explicitly run successfully by the local runner above. |
| TypeScript / ESLint / backend syntax | **Passed** | Vue type checking, lint with zero warnings, and **127 backend modules** parsed without execution. |
| Production build / frontend startup | **Passed** | Existing ~757 kB main-chunk warning remains. Temporary loopback Vite server served root and Radar transform with HTTP 200, then stopped. |
| Diff / tracked-secret audit | **Passed** | No whitespace errors or secret findings. Runtime environment files remain untracked; precisely reviewed fictional credential URI fixtures are not actual secrets. |

### Database safety, limitations and Git scope

The geospatial fixture database in the final real-Mongo run was `fyp_transactions_analytics_d2febd7992884603895975a6524da849` on replica set `fyp_transactions_16bb83e5e72f4c8fa79f28a3e5062a37`. Only dedicated `fyp_transactions_*` databases were used. Every inserted synthetic document was recorded by exact ID; exact fixture teardown was verified, and the owned replica set/disposable storage were stopped and removed by the existing harness. No application cleanup, seed, migration, Atlas access, provider operation or existing-record write occurred. `sample_mflix` was not accessed.

No schema/index or dependency changes are required; existing `2dsphere` location indexes and parent `_id` lookups are reused. Declared/redundant legacy indexes were not removed. Runtime environment, provider assets, original images, lockfiles and routing configuration remain unchanged. Prior uncommitted #20 work is preserved, including its password validation, tests and localization.

The ten-second/memory limits deliberately reject extreme workloads; maximum-radius/high-volume production performance was not measured on Atlas. Totals describe the database reads for the request, not a guaranteed transaction snapshot across concurrent writes. The 750-metre singleton-cell privacy policy is unchanged, not a newly added anonymity guarantee. No browser surface was available (inventory returned no apps/browsers); visual layout/contrast on actual devices is unverified. All three locale notices and theme-token inheritance were checked through component tests/code, not claimed browser screenshots.

Changed for #19: `server/controllers/analyticsController.js`; `server/services/hotspotAnalytics.js`; `server/services/locationPrivacy.js`; `server/scripts/testTransactions.js`; `server/tests/helpers/localTransactions.js`; `server/tests/hotspotAnalytics.test.js`; new `server/tests/hotspotMongo.test.js`; `src/components/RadarScreen.vue`; new `src/components/__tests__/RadarHotspots.test.ts`; `src/types/analytics.ts`; three locale files; and this checklist. No deletions, commits or pushes. The overall worktree also contains the preserved #20 changes; these are not attributed to this batch.

## #21 local saved-state repair verification — 20 October 2026

### Identity, storage and legacy policy

- Lost-pet bookmarks remain local; no backend schema, endpoint, index or account-synchronization feature was added. Only validated, deduplicated ID arrays are written to `pawradar_saved_pets:v2:guest` or `pawradar_saved_pets:v2:user:<stable-account-ID>`. No cached pet documents, precise coordinates, contact information, image data or credentials are stored with saves.
- An existing token without a verified current user is a **pending** state: no saved namespace or save action is available. Only App's successful context-checked profile restore or login activates the server-confirmed stable ID, after existing auth clearing. No ID is inferred from JWT decoding, route props or storage-event payloads.
- Auth invalidation synchronously changes the saved revision and clears displayed pet/rescue objects. A memory-only, previously verified exact-token identity can rehydrate the same account after generation-only invalidation such as cancelling authentication; logout/token replacement drops that identity. External invalidation explicitly discards it before notifying consumers, including rapid external A→B→A changes whose queued events arrive after the final token write.
- Storage events cannot activate accounts. Other namespaces/sessionStorage are ignored; current storage is reread rather than trusting stale `newValue`. IDs and requests from earlier namespaces/revisions are rejected. Unmount aborts/invalidate requests and clears view references.
- **Unattributable legacy saves:** `pawradar_saved_pets` remains untouched and unread. It may contain several previous users' or guests' saves; ownership cannot be safely reconstructed. Do not automatically copy it into a guest namespace or assign it to the next login. Any future recovery/import needs a separately approved, explicit attribution process, not an automatic migration.
- Malformed/unavailable browser storage shows localized persistence feedback. An explicit bookmark action can keep validated IDs in scoped memory if storage is blocked/full, but this may last only for the current visit; no silent durable-persistence guarantee is made. Merely reading malformed contents does not rewrite them.

### Retrieval, pagination and API safety

- SavedScreen resolves pet/rescue branches independently. A network/5xx failure is retryable, preserves IDs and successful cards, and cannot masquerade as an empty list. Confirmed 404/410 pet results use generic unavailable feedback and keep their IDs; hidden-content reasons are not displayed. A mismatched response ID is treated as a failed retrieval, not another saved post.
- Pet pages contain at most **20 IDs**, with at most **four requests in flight**. Failed first-page IDs do not hide later-page controls. Retry reuses failed IDs without duplicating successful entries or advancing the saved-ID cursor incorrectly.
- Rescue results use the existing paged API, retaining its actual saved-record total and `hasMore`, including pages with no visible records. Unavailable counts are recorded once per accepted page; later-page failure retries the same page and retains successful earlier pages. The old first-50 wrapper is no longer used by SavedScreen.
- The profile saved-rescue tab now exposes unavailable counts and paging even with zero visible posts; account/auth changes clear state even while inactive. Unsave is request/context guarded. A successful unsave shifts offset pagination, so page one must refresh successfully before appending later pages; a refresh failure preserves remaining cards and exposes retry.
- Saved-related API wrappers capture the existing auth context synchronously **before** Axios queues the request. A queued save/unsave cannot be issued with a replacement account's token, and a late old 401 cannot log out the new account. The existing messaging context helper was renamed generically without changing its behavior.
- All new interface copy uses the three existing locales and semantic theme tokens. No backend contact/location/moderation policy was changed.

### Verification

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Focused saved/profile/App/session/API regressions | **79 passed** in six files | jsdom mounted Vue components and actual Axios interceptors with an isolated transport. Includes guest/A/B/logout transitions, verified restore/login activation, same-token cancellation (including profile refresh), rapid cross-tab transitions, stale storage/requests/401s, malformed/blocked storage, partial failures, retries, unmount, and profile unsave refresh failure. No live HTTP mutation. |
| Complete frontend | **291 passed**, 37 files, 0 failed | Final complete rerun after the final locale wording and verified same-token profile-refresh changes; previous image/privacy/session/localization regressions remain passing. |
| Complete backend | **295 passed**, 0 failed, **5 opt-in skipped** (300 entries) | Standard parallel rerun; no backend application code changed. Existing isolated role/privacy/hidden-content regressions remain passing. |
| Real isolated MongoDB regressions | **32 passed**, 0 failed/skipped | Existing loopback MongoDB 8.0.17 harness, including transactions and new #19 geospatial suite. Cloudinary mocked; exact synthetic teardown and replica-set shutdown confirmed. This does not turn mocked saved-component API calls into live browser/Atlas verification. |
| Vue TypeScript / ESLint / backend syntax | **Passed** | `npm run typecheck`, `npm run lint`; **127** backend modules parsed, none executed by syntax checking. |
| Production build / startup | **Passed** | Existing main-chunk size warning remains (~764 kB). Temporary loopback Vite served `/saved`, SavedScreen and the saved composable with HTTP 200, then stopped. |
| Diff / tracked-secret audit | **Passed** | `git diff --check`; local-credential and generic-secret scanning of worktree/index, with only precisely reviewed fictional URI fixtures excepted. No tracked runtime environment files or secret findings. |

Meaningful pagination fixtures include **45 pet IDs** (first 20 failing, later pages reachable, retry yielding all 45), and **61 rescue saves**, whose first page has **20 unavailable records** and later pages are retrievable beyond 50. Server totals remain 61, not the 41 visible posts. All-three-locale tests keep user-generated pet/post content unchanged and never expose a hidden reason. The existing ProfileScreen unsave fixture was updated to model the real server's post-removal page-one response; its original assertion that the selected row disappears was retained, with an added refresh-call assertion.

The explicitly selected Astra/high specialist completed bounded read-only design and final reviews. Review recommendations for external identity invalidation and offset/failure paging were implemented and covered by focused tests; no remaining blocker was identified. No review claimed test execution or browser proof.

### Safety, limitations and changed files

No Atlas connection, application-record write, provider operation, environment edit, image change, seed, migration or live cleanup occurred. The only database changes were the existing harness's exact disposable local fixtures, followed by verified exact fixture teardown. The real-run replica set was `fyp_transactions_850e81ebfe9f4e6c9503bad5a6d08df6`; application database names were never selected. No schema/index/dependency/lockfile/routing-configuration change was needed. Prior #19/#20 work remains preserved; no commits or pushes.

Browser inventory returned no apps/browsers. Native browser refresh/autofill, actual cross-window event timing and light/dark/mobile visual appearance were not exercised on a physical browser/device. The automated rehydration, synthetic StorageEvent and session tests cover the corresponding state logic, not native-browser scheduling. Local storage remains browser/origin-local, readable by same-origin scripts and subject to browser clearing; account namespacing is not encryption or cross-device synchronization. Concurrent writes retain last-write-wins localStorage semantics; no transactional merge or synchronization service was added. Offset pagination can still reflect concurrent remote changes; successful removals force page-one refresh, and server pagination is not presented as a transactional snapshot.

Changed for #21:
- Application: `src/App.vue`; `src/composables/useSavedPets.ts`; `src/views/SavedScreen.vue`; `src/components/profile/SavedRescuePostsTab.vue`; `src/services/api.ts`; `src/services/authSession.ts`.
- Localization: `src/locales/en.json`, `zh-HK.json`, `zh-CN.json`.
- Extended tests: `src/components/__tests__/AppCreationAuth.test.ts`; `ProfileScreen.test.ts`; `src/services/__tests__/apiAuthContext.test.ts`.
- New tests: `src/composables/__tests__/useSavedPets.test.ts`; `src/views/__tests__/SavedScreen.test.ts`; `src/components/__tests__/SavedRescuePostsTab.test.ts`.
- Tracking: this checklist. This batch modifies **13 existing files** and adds **three test files**; no deletion. Overall Git status also includes preserved #19/#20 work, not attributed to this batch.

### All 22 findings — current scoped status

The status below applies to each original audited defect/verification gap and its evidence above. It does not certify a bug-free application, fresh dependency audit, production deployment or every browser/device path. **21 fixed and verified; one partially addressed (#8); none still open or implemented-but-pending.** All earlier documented boundaries remain, including #20's legacy bcrypt compatibility ambiguity and physical-device/production verification gaps.

| # | Original finding | Status |
| --- | --- | --- |
| 1 | High — Smart Match exposes precise distance indirectly | Fixed and verified |
| 2 | High — Sighting content permissions disagree with image permissions | Fixed and verified |
| 3 | High — Legacy uploads bypass content permissions | Fixed and verified |
| 4 | High — A sighting removes the owner’s reunion action | Fixed and verified |
| 5 | High — Concurrent sightings can undo “Reunited” | Fixed and verified |
| 6 | High — Session changes do not consistently invalidate existing state | Fixed and verified |
| 7 | High — Managed-image atomicity remains a release-verification blocker | Fixed and verified |
| 8 | High — Dependency advisories remain unresolved | Partially addressed |
| 9 | Medium — A database outage is treated as an invalid login session | Fixed and verified |
| 10 | Medium — Abandoned uploads can permanently exhaust the pending quota | Fixed and verified |
| 11 | Medium — Moderators cannot retrieve some image evidence | Fixed and verified |
| 12 | Medium — Rescue management controls exceed administrator permissions | Fixed and verified |
| 13 | Medium — Rescue mutation failures have incomplete feedback | Fixed and verified |
| 14 | Medium — Comment retry identity is inconsistent | Fixed and verified |
| 15 | Medium — Blocked comments remain in previews and counts | Fixed and verified |
| 16 | Medium — Message unread indicators and notification destinations are misleading | Fixed and verified |
| 17 | Medium — Some generated text and dates ignore the selected language | Fixed and verified |
| 18 | Medium — Lost-pet coordinates can contradict the entered location | Fixed and verified |
| 19 | Medium — Hotspot totals silently truncate larger datasets | Fixed and verified |
| 20 | Medium — Long passwords are silently truncated by bcrypt | Fixed and verified |
| 21 | Low — Saved-pet state and failures are inconsistent | Fixed and verified |
| 22 | Low — Plain-HTTP mobile development can fail during image initialization | Fixed and verified |

Finding #8 remains partially addressed: the previously documented development/native-tool advisory paths require separate supported-upstream/major-change review. They were not upgraded or re-audited in this integration repair.

## Integration-review repair batch — 23 October 2026

### INT-01. High — Hotspot query membership leaks exact-location information

- Status: **Fixed and verified** through actual isolated MongoDB geospatial aggregation. This was a confirmed integration defect, separate from #19's already-repaired source-count truncation.
- Repair: indexed exact-coordinate searching is now only a conservative candidate prefilter. Final radius membership uses each deterministic public grid centre after source grouping and before merged totals, weights, ordering and output truncation. Moving a source within its cell cannot change those public fields. Display rounding remains separate from the deterministic unrounded centre used for membership.
- Bounds: candidate padding includes the cell half-diagonal and a conservative polar-clamp allowance where necessary; antimeridian query longitude is normalized. Hidden/missing-parent sightings, hidden/inactive rescues and time exclusions remain applied. The 1,500-cell output cap, complete summary counts, 10-second deadline and no-disk-spill restriction remain intact. No source sampling was introduced.
- Evidence: `hotspotMongo.test.js` moves mixed-source fixtures between opposite corners of their original cells and compares complete results across multiple origins and radius boundaries, including polar clamps and the antimeridian. Actual controller payloads for guest/user/administrator are compared with fixed time and recursively checked for prohibited fields. Existing 1,725-report and 3,210-report/1,600-cell cases remain; the latter also proves unchanged full summaries and deterministic truncated output after in-cell movement. Mocked privacy/role tests supplement, but do not replace, this real database evidence.
- Limitation: public cells remain 750-metre approximations, not a minimum-population anonymity guarantee. Extreme polar candidate searches are intentionally conservative and may hit existing resource limits; maximum-volume Atlas performance was not measured. Cross-collection reads are not a transaction snapshot under concurrent writes.

### INT-02. Medium — Rescue image edits can commit after eligibility changes

- Status: **Fixed and verified** through actual HTTP routes/controllers and isolated MongoDB transactions, with provider operations mocked. This is a confirmed destination-eligibility defect, not a claim that #7's earlier atomic attachment tests were invalid.
- Repair: the transaction rechecks ownership, visibility and `active != false`. Even an identical image edit writes the destination, so a concurrent deactivation/hide/ownership change causes a real write conflict and transaction retry against current eligibility. The corresponding text-only edit uses an atomic owner/active/visible conditional update rather than a stale document save.
- Evidence: new `rescueEditTransactions.test.js` pauses actual reads/saves, then deactivates through the actual DELETE route or changes isolated fixture visibility/ownership. It covers preflight and in-transaction races, identical image edits and text-only edits. Rejected edits return 404/403, preserve description and every image reference, leave complete asset documents unchanged and do not retire provider objects. Snapshot cases assert a real retry rechecked eligibility. Guest/unrelated/admin edit denial and successful owner replacement retain existing policy.
- Limitation: provider deletion is a spy in this batch; no new Cloudinary, browser or live-account verification is implied.

### #6 attribution and stale-state evidence

- All 52 API exports are included in a TypeScript-exhaustive invocation matrix. Same-tick switch, logout, same-token invalidation, A-to-B-to-A and storage-event cases must reject before transport. Delayed old-account 200/401/503 responses cannot invalidate the new account. Optional-auth public reads are pinned too; they cannot accidentally gain the replacement account's privilege.
- Real Axios interceptors run against an isolated mock transport. Integrated preference tests prove old success/failure responses cannot replace the new account's preferences, status or persisted selection. Upload progress/final completion, terminal retry recovery and selected/cached image IDs are context guarded, including switches before a storage event is delivered. Existing retry IDs, cancellation and all five image purposes remain covered.
- Logical cancellation cannot recall a request already accepted by the server; such requests retain their original credentials and their stale frontend completions are rejected. Native browser cross-tab scheduling and physical devices remain unverified.

### Final automated verification

| Check | Result and boundary |
| --- | --- |
| Complete frontend | **403 passed**, 37 files; jsdom/components, actual Axios interceptors with mocked transport, no browser claim. |
| Complete backend | Final standard parallel diagnostic run: **295 passed, 0 failed, 6 opt-in skipped** (301 entries). See instability note below. |
| Real local database suites | **42 passed, 0 failed/skipped**, six suites: image, quota, sighting, rescue, hotspot and actual-route rescue-edit transactions. Actual MongoDB commits/conflicts/rollbacks; provider mocked. |
| Vue TypeScript / ESLint | **Passed**; zero lint warnings. |
| Backend syntax | **128 JavaScript files parsed successfully**, without executing application modules. |
| Production build | **Passed**; existing main-chunk warning remains (approximately 764 kB). |
| Frontend startup | Temporary loopback Vite served `/radar`, the API module and upload composable with HTTP 200, then stopped. No browser rendering claim. |
| Diff / secret audit | **Passed**: `git diff --check`; 309 worktree files and 308 index files checked for local configured credentials and generic secret patterns, with precisely reviewed fictional redaction-test URI exceptions only. No secret findings or tracked runtime environment files. |

**Intermittent test limitation:** one overlapping full-backend run reported 294 passed, one failed and six skipped. The failing diagnostic was lost to output truncation; its exact identity/cause cannot be established from that output. Inspection identified the existing provider-harness child-process test's 15-second timeout as a plausible contention sensitivity, not a proven cause. That test passed independently (about 1.3 seconds), and one diagnostic full parallel rerun after competing checks finished passed in about 5.7 seconds. No timeout, assertion or application code was relaxed to make it pass. The non-reproduced earlier failure remains recorded rather than being described as fully diagnosed.

The explicit-model Astra/high specialist completed focused read-only reviews of privacy, session attribution and transactional eligibility, with no remaining blocking issue identified. Named configuration auto-loading is not claimed; specialist instructions were manually supplied with explicit model/reasoning selection. Review did not substitute for the tests above.

### Safety and scope

Final isolated replica set: `fyp_transactions_0f65e24a3aa5492699c94a9129849318`; analytics database: `fyp_transactions_analytics_fba1f68a7c7c4d249e383be58ce78f00`; new route-race database: `fyp_transactions_rescue_505c5b284b124c61b491ef849c6a04eb`. The harness confirmed exact synthetic fixture removal and shutdown of its owned replica set. No Atlas/application database, existing record, provider object, original image or runtime environment file was changed. No live uploads, seeds, migration or live cleanup ran; `sample_mflix` was not accessed.

No schema, index, package, lockfile or routing-configuration changes. Existing indexes are reused; legacy index maintenance remains separate. Hash comparison across the resumed final verification confirmed all 14 existing preservation targets unchanged (runtime environment files, package files, routing instructions and original public/upload files). Browser/device checks and fresh live-provider/Atlas checks were not performed. Earlier dependency advisories and historical bcrypt compatibility limits remain unchanged.

Changed application files: `server/controllers/analyticsController.js`, `server/controllers/strayController.js`, `server/services/hotspotAnalytics.js`, `server/services/mediaAttachments.js`, `src/services/api.ts`, `src/composables/useImageUpload.ts`.

Changed verification files: `server/scripts/testTransactions.js`, `server/tests/hotspotMongo.test.js`, `server/tests/mediaAttachments.test.js`, `src/services/__tests__/apiAuthContext.test.ts`, `src/composables/__tests__/useImageUpload.test.ts`; new `server/tests/rescueEditTransactions.test.js`. This checklist is the only documentation change. No deletion, commit or push.
