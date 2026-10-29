# Durable image storage — Phase 2 delivery report

Date: 6 October 2026 (Hong Kong). Scope: Phase 2 only. Implementation complete; live image-write and real transaction sign-off remain pending.

## Integrated flows

| Category | Frontend | Write contract |
|---|---|---|
| Avatar | SettingsScreen | Multipart purpose avatar, then PATCH auth/me with avatarImageId; explicit null removes; unrelated fields omit this property |
| Pet | PostPetScreen; PetDetail owner editor | Multipart purpose pet, then imageIds and stable submissionId; owner replacement/removal |
| Sighting | App sighting sheet; PetDetail reporter editor | Multipart purpose sighting, then imageIds and stable submissionId; reporter replacement/removal |
| Rescue | StrayRescueScreen; StrayDetailScreen owner editor | Multipart purpose stray, then imageIds and stable submissionId; replacement retains at least one photo |
| Chat | Chatscreen outgoing attachment/editor | Multipart purpose message, then imageIds and stable clientRequestId; removal cannot leave an empty image-only message |

All new avatar/photo/photos string write fields, including registration avatar injection, are rejected. The legacy local-upload creation endpoint returns 410. Legacy Base64, external URLs and local files are still readable and have not been rewritten or removed.

## Attachment, replacement and failure handling

- Reusable attachment service verifies uploader ownership, purpose, expiration, current destination, visibility and idempotency.
- MongoDB sessions/transactions atomically claim pending assets and save content references; concurrent unique-submission collisions recheck authorization in a fresh transaction.
- Failed attachment or replacement leaves pending assets retryable and preserves the original reference. It does not create a broken content reference.
- Old managed objects are retired only after acknowledged replacement commits; failed deletion leaves an exact-ID recovery ledger.
- Pending cancellation is owner-only, idempotent and retryable after provider failure. Attached images cannot be discarded.
- Upload retries retain identity after uncertain transport failures. Confirmed terminal reservations permit a bounded fresh attempt. Nothing automatically submits a content form.
- Controls provide upload progress, cancellation and explicit upload/save retries in en, zh-HK and zh-CN.
- Account changes clear upload state and privileged blobs; late responses cannot repopulate a switched account or reopened sighting form.

## Delivery and privacy

- Attached images are streamed through GET /api/uploads/managed/:id/content with bounded WebP bytes, private/no-store caching and no signed-URL redirect.
- Visible avatars, pet and rescue photos support guest discovery.
- Sighting photos are restricted to the relevant pet owner/reporter; no general administrator bypass is added.
- Chat photos require conversation membership and an unblocked relationship; administrators do not gain general conversation access.
- Hidden content, hidden parent pets, inactive rescue posts, stale references and retired assets are unavailable.
- ManagedImage fetches permitted backend blobs, retains native image attributes/fallback events, and revokes object URLs on source/auth changes and unmount. Existing Leaflet pet/rescue images are publicly deliverable under the same visibility checks; trajectory popups do not embed private photos.
- Notification thumbnails resolve current visible public content rather than stale/private managed attachment paths.
- Provider credentials, public IDs, secure URLs and signed URLs remain server-only. Recursive integration-response checks enforce private metadata exclusion.
- Legacy external/local URLs are not retroactively access-controlled by the new delivery endpoint. Migration is necessary before claiming complete legacy-image confidentiality.

## Automated verification

| Check | Result |
|---|---|
| Frontend component/composable regressions | 125 passed across 24 files |
| Backend unit and HTTP integration regressions | 216 passed; 1 skipped; 0 failed |
| Vue TypeScript checking | Passed |
| ESLint | Passed, zero warnings |
| Backend JavaScript syntax | 98 files passed; final media-access changes also checked |
| Production build | Passed; existing large-chunk advisory remains (main chunk approximately 724 kB) |
| Frontend startup | Vite started at http://127.0.0.1:5174; HTTP 200 and expected app entry; task server subsequently stopped |
| Diff whitespace check | Passed |
| Exact local-secret audit | No matches in tracked/new source/docs; no environment files tracked |
| JWT local configuration | Passed without printing its value |

New coverage includes all five categories, foreign uploader/purpose/destination rejection, repeated submissions, unique-index collision recovery, provider/database failure, rollback and replacement ordering, explicit removal, legacy compatibility, role matrices, blocking/moderation, recursive payload checks, cancellation/account switching, source cleanup, localized progress/retry controls, and unchanged avatar on unrelated edits.

Backend HTTP integration uses real Express/JWT/controllers/Mongoose schema validation but mocked database/provider implementations. Atomic rollback tests use isolated in-memory fixtures. These results are not represented as real MongoDB transaction verification.

## Deferred or unavailable verification

- Real MongoDB transaction test exists in server/tests/mediaTransactions.test.js but skipped: no MEDIA_TEST_MONGODB_URI and no local MongoDB/Docker replica set available. It only permits a credential-free loopback replica set, creates a uniquely named isolated test database, and removes exact fixture IDs.
- The read-only live harness failed at Atlas connection with MongooseServerSelectionError, including network-enabled retries. Live health, smoke, seeded read-only roles and image delivery could not run afterward.
- Production startup was intentionally not invoked against Atlas: it can create collections/indexes. The harness disables both and disallows controller mutations.
- No browser surface was returned by computer-use inventory. No actual browser visual/image-flow result is claimed. Component tests cover the controls, but visual contrast/wrapping still requires human judgment.
- Live image creation/attachment/replacement/removal is not authorized in this phase's verification and was not performed. Separate approval and working Atlas access are required.

## Database, configuration and index implications

- Optional hidden imageIds references were added to User, Pet, Sighting, Stray and Message; existing photo/avatar strings remain rendering-compatible.
- Pet adds optional hidden submissionId and a partial unique owner/submission index for repeat submissions. It must be reviewed/applied during approved startup/index verification.
- MediaAsset foundation/index declarations are retained, including non-TTL recovery/expiry indexing. No legacy indexes were removed.
- No application database records, seeded accounts, local upload files or environment files were changed by verification. No seed, migration, cleanup or provider-upload probe ran. sample_mflix was not accessed.
- Existing local configuration was read only: managed uploads are enabled; test seeding, image migration and bulk cleanup are disabled. No credentials are included here.
- Package manifests/lockfiles and dependency versions are unchanged. No commit or push was performed.

## Dependency audit

npm backend audit: seven affected package entries, four high and three moderate; no low/critical entries.

| Severity | Package | Installed version / reachability |
|---|---|---|
| High | nodemon | 3.1.14; development dependency, inherited watcher advisories |
| High | chokidar | 3.6.0; nodemon development tree |
| High | braces | 3.0.3; chokidar development tree |
| High | brace-expansion | 5.0.9; nodemon/minimatch development tree |
| Moderate | express | 4.22.2; runtime, inherited qs advisories |
| Moderate | body-parser | 1.20.6; Express runtime dependency |
| Moderate | qs | 6.15.3; Express/body-parser runtime dependency |

Cloudinary, Sharp, Multer and file-type are not named in this audit. The upload route still shares the affected Express HTTP/query parsing stack, so it is not claimed vulnerability-free; multipart file parsing itself uses Multer. The high watcher-chain entries are development-only in the installed backend tree. No unrelated upgrades or audit-fix command ran.

## Known limitations and remaining Phase 3

- Real transaction/live integration verification remains pending as above.
- Current forms select one cover/attachment; pet/rescue API caps allow up to six.
- Interrupted/expired/uncertain uploads and failed deferred deletion remain in the ledger until separately approved reconciliation. There is no bulk cleanup worker.
- In-process quota/concurrency enforcement still needs a distributed solution before multi-instance public deployment.
- Backend streaming/no-store delivery trades bandwidth/caching efficiency for access revocation safety.
- Phase 3 should implement dry-run/idempotent legacy migration pinned to petlostapp, resumable recovery and abandoned-upload reconciliation, verification before any original removal, rollback controls and approved live end-to-end tests. Phase 3 has not started.

## Git diff summary

This is git diff --stat for tracked modifications; untracked additions are listed separately in the status below. No files were deleted.

```text
BACKEND_OVERVIEW.md                                | 26 ++++---
 HANDOVER.md                                        |  9 +--
 README.md                                          | 25 ++++++-
 server/controllers/authController.js               | 72 ++++---------------
 server/controllers/chatController.js               | 38 ++++++----
 server/controllers/managedUploadController.js      | 53 +++++++++++---
 server/controllers/notificationController.js       | 10 +--
 server/controllers/petController.js                | 64 +++++++++++------
 server/controllers/strayController.js              | 28 ++++++--
 server/middleware/errorHandler.js                  |  3 +
 server/models/Message.js                           |  1 +
 server/models/Pet.js                               |  3 +
 server/models/Sighting.js                          |  1 +
 server/models/Stray.js                             |  1 +
 server/models/User.js                              |  1 +
 server/routes/uploads.js                           | 14 ++--
 server/services/imageErrors.js                     |  3 +
 server/services/imageLifecycle.js                  | 20 +++++-
 server/tests/imageAuthorization.test.js            |  2 +-
 server/tests/imageLifecycle.test.js                | 30 ++++++++
 server/tests/routes.test.js                        |  4 +-
 server/tests/strayCommunity.test.js                | 11 ++-
 src/App.vue                                        | 53 +++++++++-----
 src/components/AdoptionHistoryScreen.vue           |  5 +-
 src/components/ChatInboxScreen.vue                 |  3 +-
 src/components/Chatscreen.vue                      | 49 +++++++------
 src/components/NotificationsPanel.vue              |  3 +-
 src/components/PetCard.vue                         |  3 +-
 src/components/PetDetail.vue                       | 17 ++++-
 src/components/PostPetScreen.vue                   | 32 +++++++--
 src/components/PosterModal.vue                     |  3 +-
 src/components/ProfileScreen.vue                   |  3 +-
 src/components/SmartMatchScreen.vue                |  7 +-
 src/components/StrayRescueScreen.vue               | 31 +++++----
 src/components/__tests__/AppCreationAuth.test.ts   | 45 +++++++++++-
 .../__tests__/ChatscreenSharedStray.test.ts        | 19 ++++-
 src/components/__tests__/StrayRescueScreen.test.ts | 12 ++--
 src/components/profile/MyPetsTab.vue               |  3 +-
 src/components/profile/ProfileStrayCard.vue        |  3 +-
 src/i18n/index.ts                                  | 20 ++++++
 src/locales/en.json                                | 19 +++++
 src/locales/zh-CN-extra.json                       | 19 +++++
 src/locales/zh-HK-extra.json                       | 19 +++++
 src/services/api.ts                                | 38 +++++++---
 src/utils/__tests__/sightingSubmission.test.ts     |  2 +-
 src/utils/sightingSubmission.ts                    |  4 +-
 src/views/BlockedUsersScreen.vue                   |  3 +-
 src/views/ModerationScreen.vue                     |  3 +-
 src/views/SavedScreen.vue                          |  3 +-
 src/views/SettingsScreen.vue                       | 81 +++++++++-------------
 src/views/StrayDetailScreen.vue                    | 17 +++--
 src/views/__tests__/SettingsScreen.test.ts         | 46 ++++++++++++
 52 files changed, 695 insertions(+), 289 deletions(-)
```

## Final changed-file inventory / Git status

52 tracked files modified; 18 new files untracked, including this report. Nothing staged, committed or pushed.

```text
M BACKEND_OVERVIEW.md
 M HANDOVER.md
 M README.md
 M server/controllers/authController.js
 M server/controllers/chatController.js
 M server/controllers/managedUploadController.js
 M server/controllers/notificationController.js
 M server/controllers/petController.js
 M server/controllers/strayController.js
 M server/middleware/errorHandler.js
 M server/models/Message.js
 M server/models/Pet.js
 M server/models/Sighting.js
 M server/models/Stray.js
 M server/models/User.js
 M server/routes/uploads.js
 M server/services/imageErrors.js
 M server/services/imageLifecycle.js
 M server/tests/imageAuthorization.test.js
 M server/tests/imageLifecycle.test.js
 M server/tests/routes.test.js
 M server/tests/strayCommunity.test.js
 M src/App.vue
 M src/components/AdoptionHistoryScreen.vue
 M src/components/ChatInboxScreen.vue
 M src/components/Chatscreen.vue
 M src/components/NotificationsPanel.vue
 M src/components/PetCard.vue
 M src/components/PetDetail.vue
 M src/components/PostPetScreen.vue
 M src/components/PosterModal.vue
 M src/components/ProfileScreen.vue
 M src/components/SmartMatchScreen.vue
 M src/components/StrayRescueScreen.vue
 M src/components/__tests__/AppCreationAuth.test.ts
 M src/components/__tests__/ChatscreenSharedStray.test.ts
 M src/components/__tests__/StrayRescueScreen.test.ts
 M src/components/profile/MyPetsTab.vue
 M src/components/profile/ProfileStrayCard.vue
 M src/i18n/index.ts
 M src/locales/en.json
 M src/locales/zh-CN-extra.json
 M src/locales/zh-HK-extra.json
 M src/services/api.ts
 M src/utils/__tests__/sightingSubmission.test.ts
 M src/utils/sightingSubmission.ts
 M src/views/BlockedUsersScreen.vue
 M src/views/ModerationScreen.vue
 M src/views/SavedScreen.vue
 M src/views/SettingsScreen.vue
 M src/views/StrayDetailScreen.vue
 M src/views/__tests__/SettingsScreen.test.ts
?? server/scripts/verifyManagedImagesReadOnly.js
?? server/services/mediaAccess.js
?? server/services/mediaAttachments.js
?? server/tests/mediaAccess.test.js
?? server/tests/mediaAttachments.test.js
?? server/tests/mediaFlowsIntegration.test.js
?? server/tests/mediaTransactions.test.js
?? src/components/ContentImageEditor.vue
?? src/components/ImageUploadStatus.vue
?? src/components/ManagedImage.vue
?? src/components/__tests__/ContentImageEditor.test.ts
?? src/components/__tests__/ImageUploadStatus.test.ts
?? src/components/__tests__/ManagedImage.test.ts
?? src/components/__tests__/PostPetImages.test.ts
?? src/composables/__tests__/useImageUpload.test.ts
?? src/composables/useImageUpload.ts
?? src/utils/managedImages.ts
?? IMAGE_STORAGE_PHASE2_REPORT.md
```

## Optional visual spot-check

Use an isolated test environment for any upload/save actions; live writes still require separate approval.

1. Browse existing pet/rescue pages and check legacy photos and fallback placeholders.
2. Review upload progress, retry and image-editor layout at mobile and desktop widths.
3. Review button wrapping and image-placeholder contrast in both themes and all three locales.

