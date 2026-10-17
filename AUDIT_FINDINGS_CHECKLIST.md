# PetLostApp — original 22-finding audit checklist

Updated: 17 October 2026 (Hong Kong). New feature development remains paused.

Source: the user-supplied original audit attachment, `abcbef8d-3ff5-40cd-9e47-8efa4b448d04/Pasted text.txt`, whose baseline was commit `5ad3276`. Numbers, titles, severities and meanings below preserve that audit. This is a repair-status record, not a replacement audit or public-release sign-off.

Status vocabulary: **Fixed and verified**, **Implemented but verification pending**, **Partially addressed**, **Still open**. “Verified” identifies the specific automated/isolated evidence below; it does not claim a browser, physical-device, production-proxy or live-Atlas mutation test. Earlier approved verification is explicitly distinguished from this batch. Uncommitted implementation is included.

Summary: **10 fixed and verified; 2 partially addressed; 10 still open; 0 implemented but verification pending.**

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

- Status: **Fixed and verified** for the original cancellation, cross-tab authentication and preference-race reproductions.
- Repair: authentication generation guards reject obsolete login, request and preference completions; account changes invalidate privileged state and protected image blobs.
- Evidence: `AuthCancellation.test.ts`, `AppCreationAuth.test.ts`, `apiAuthContext.test.ts`, `usePreferences.test.ts`, `ManagedImage.test.ts`, `ModerationScreen.test.ts`, including late old-admin queue responses and role/account changes.
- Limitation: this does not resolve browser-global saved-pet state (#21); no claim of complete physical multi-browser verification.

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
- Limitation: no existing assets were reconciled or deleted. The finite storage safety cap can intentionally block a user with unresolved provider debt; it is not bypassed by expiry. No background/bulk cleanup is enabled.

## 11. Medium — Moderators cannot retrieve some image evidence

- Status: **Fixed and verified**. Originally confirmed policy mismatch; live managed evidence had not been verified.
- Repair: `GET /api/moderation/reports/:id/images/:index` revalidates current administrator role, report, target, owner and current image association on each request. Hidden reported targets can be inspected; only the reported message, never its conversation, is eligible. Ordinary delivery policies remain unchanged.
- Evidence: `moderationEvidence.test.js` real HTTP/JWT role matrix with mocked database/provider, plus real temporary legacy-file reads and raster processing; invalid/stale report and target references, repeated requests, shared private files, SVG/remote URL rejection. `ManagedImage.test.ts` and `ModerationScreen.test.ts` cover authenticated blobs, revocation, stale queues and all three locales/both themes.
- Final verification: included in the passing complete backend and frontend reruns. Shared `imageProcessing.test.js` independently verifies orientation correction and removal of EXIF/GPS/copyright metadata from a metadata-bearing JPEG. The report-scoped legacy-file test itself uses a clean PNG, not that EXIF-bearing fixture.
- Limitations: remote legacy evidence is limited to known image-CDN hosts and supported JPEG/PNG/WebP raster input; no general URL proxy. No live moderation records/provider objects changed, and no browser claim is made for the admin evidence gallery.

## 12. Medium — Rescue management controls exceed administrator permissions

- Status: **Still open**. Confirmed code mismatch remains: `strayController.js` includes shelter administrators in `canManage`, while `StrayDetailScreen.vue` uses it for author-only editing/removal controls.
- Evidence: current source inspection; this batch does not broaden administrator permissions.
- Smallest next repair: separate author-edit/image/delete permission from permitted shelter rescue-status actions.

## 13. Medium — Rescue mutation failures have incomplete feedback

- Status: **Still open**. Confirmed handler/error-state deficiency; `StrayDetailScreen.vue` still has mutation handlers without operation-specific catches/locks.
- Evidence: source inspection; no new live network-failure mutation was run.
- Smallest next repair: bounded busy/error handling per operation; retain input after failure and avoid duplicate clicks.

## 14. Medium — Comment retry identity is inconsistent

- Status: **Partially addressed**. The analogous chat destination/idempotency race was repaired and tested during the earlier managed-image verification batch (`chatController.js`, `mediaFlowsIntegration.test.js`). The original comment defect remains.
- Evidence: `StrayDetailScreen.vue` still generates a fresh comment ID on each attempt; the comment controller's duplicate lookup needs destination validation.
- Smallest next repair: retain the comment ID for an uncertain retry and reject reuse against a different rescue post. Do not conflate the chat fix with the comment fix.

## 15. Medium — Blocked comments remain in previews and counts

- Status: **Still open**. Detail comment listing has block filtering, but feed preview/count context still needs the identical visibility/block policy. Detail mutations still assign the total from `comments.value.length`.
- Evidence: current `strayController.js` context aggregation and `StrayDetailScreen.vue` mutation handlers; existing comment-list tests do not establish correct feed totals.
- Smallest next repair: shared count/preview/list filtering and preserve server pagination totals.

## 16. Medium — Message unread indicators and notification destinations are misleading

- Status: **Still open**. Confirmed code defect: timestamp-only inbox unread logic can count outgoing messages; notification taps lack the correct conversation destination.
- Evidence: `ChatInboxScreen.vue` and `NotificationsPanel.vue`; no new live message sent.
- Smallest next repair: incoming/read-state semantics and authorized conversation context, with component/API regressions.

## 17. Medium — Some generated text and dates ignore the selected language

- Status: **Still open**. Existing localization is extensive and this batch adds translated recovery/evidence labels, but the original English notification metadata, browser-locale chat time/“Today” label and incomplete stable validation codes remain.
- Evidence: `notificationController.js`, `Chatscreen.vue`; locale/component regressions establish existing supported behavior, not full removal of these defects.
- Smallest next repair: localize generated metadata and date grouping centrally; do not translate user-written content.

## 18. Medium — Lost-pet coordinates can contradict the entered location

- Status: **Still open**. Confirmed source behavior: `PostPetScreen.vue` submits current GPS or a fixed fallback, which may disagree with the entered place.
- Evidence: current coordinate resolution/submission inspection; no genuine report created.
- Smallest next repair: explicit last-seen location selection and validation; never silently fabricate coordinates.

## 19. Medium — Hotspot totals silently truncate larger datasets

- Status: **Still open**. Confirmed capped aggregation; live high-volume impact remains unmeasured.
- Evidence: `analyticsController.js` still applies `MAX_POINTS_PER_SOURCE = 750` before cell aggregation. The earlier inactive/hidden-content filtering repairs do not fix truncation.
- Smallest next repair: aggregate before limiting output or explicitly disclose sampled/capped totals, with >750-record isolated tests.

## 20. Medium — Long passwords are silently truncated by bcrypt

- Status: **Still open**. Original isolated bcrypt reproduction confirmed equivalent authentication after the first 72 bytes; registration still lacks the corresponding maximum-byte policy.
- Evidence: auth validation/schema inspection; no password resets or seeded-account changes performed.
- Smallest next repair: explicit UTF-8 byte limit with a considered compatibility policy for existing accounts.

## 21. Low — Saved-pet state and failures are inconsistent

- Status: **Still open**. Confirmed current source: browser-global `pawradar_saved_pets` remains shared between accounts; failed saved-pet fetches can be discarded as if unavailable/empty.
- Evidence: `useSavedPets.ts`, `SavedScreen.vue`. Authentication-generation improvements (#6) do not partition this persisted key.
- Smallest next repair: account-scoped state and distinct empty/unavailable/network-error results; account-backed saving remains separate approved product work.

## 22. Low — Plain-HTTP mobile development can fail during image initialization

- Status: **Still open**. Confirmed code risk, **not reproduced on a phone**.
- Evidence: `useImageUpload.ts` still calls `crypto.randomUUID()` directly; insecure LAN origins may not provide it.
- Smallest next repair: guard availability and provide/document an appropriate secure development origin. No unsupported claim of a physical-device failure or fix.

## Verification boundaries

- This repair batch: frontend unit/component suites, backend unit/HTTP/authorization suites, real local MongoDB transaction suites, TypeScript, ESLint, backend syntax and production build. Test totals/results belong in the completion report; regular backend tests intentionally skip opt-in real suites, which are run separately.
- Provider operations in this batch are mocked. Real local database fixtures use uniquely named disposable databases, exact tracked fixture removal and owned replica-set shutdown. Atlas, `petlostapp`, `sample_mflix`, runtime environment files and existing images/records are untouched.
- Reconciliation was tested only with isolated fixtures; no live reconciliation command, migration, seed or bulk cleanup ran. Normal application startup can provision the newly declared budget collection/indexes; no live schema/index deployment was performed here.
- Browser visual layout, physical mobile/macOS behavior and production reverse-proxy behavior require separate evidence. Passing automated tests is not a blanket public-release sign-off.

## Final #10/#11 verification — 17 October 2026

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

- Heartbeat scheduling/token consistency is unit-tested, but `mediaRepository.refreshLease`'s exact MongoDB token/expiry update predicate does not have a separate real-database exercise. This is a precise coverage gap, not a demonstrated failure. The real suite separately verifies active-lease accounting and expiry boundaries.
- The isolated run used replica set `fyp_transactions_58a87856a9e848ea9afaf00e530d1d98` and dedicated `fyp_transactions_quota_*`, `fyp_transactions_media_*` and `fyp_transactions_sighting_*` databases. The quota database was `fyp_transactions_quota_3d40f2547ba645b9899c0ccff953fb36`; the sighting database was `fyp_transactions_sighting_f94a03f9abf0403d834ffe76b7a54e4c`. Exact owned fixtures were removed and zero remaining tracked fixtures confirmed; the owned replica set and disposable storage were stopped/removed by the harness.
- No Atlas connection, `petlostapp`/`sample_mflix` access, real provider operation, live cleanup, seed, migration or application startup occurred. Existing records, provider assets, original uploads and runtime environment files were preserved. The production build regenerated ignored `dist/` output only.
- Schema/index deployment remains future operational work: the repair adds the private `mediauploadbudgets` collection with a unique user index and two MediaAsset lease indexes. Normal enabled-upload startup provisions these; this verification did not. Existing records need no migration, and legacy indexes were not removed.
- `.codex/config.toml`, `.codex/agents/fyp_architect.toml` and `AGENTS.md` belong to the separate routing-configuration task, not the application repair. They were left unchanged. Existing repair/dependency work remains uncommitted; nothing was committed or pushed.
