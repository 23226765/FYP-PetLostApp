# PawRadar Backend Overview

Documentation snapshot: 29 October 2026. This reference describes the current working tree, including approved uncommitted workflow repairs. It is not a new runtime verification. See [progress and evidence](../PROGRESS.md) for dated results and [feature status](../development/FYP_FEATURE_GAP.md) for limitations.

## Runtime and database

- Runtime: Node.js with ES modules.
- HTTP API: Express 4 with Helmet 8 security headers on `PORT` (default `5000`).
- ODM: Mongoose 8.
- Authentication: bearer JWT plus bcryptjs password hashing.
- Database: MongoDB Atlas, always selected as lowercase `petlostapp` through `dbName` in `server/config/database.js`.
- Secrets: `MONGODB_URI` and `JWT_SECRET` are loaded only from `server/.env`. That file is Git-ignored.
- Startup safety: the server validates the JWT secret, connects, confirms the selected database name, pings Atlas, creates the known collections/indexes, and only then listens.
- Images: legacy URL/Base64 strings remain compatible; local files require established owning references and permission-checked delivery. New avatar/pet/sighting/rescue/chat writes use uploaded `MediaAsset` IDs, never image bytes or arbitrary URLs. Managed uploads remain opt-in; provider metadata is private.

`JWT_SECRET` must contain at least 32 characters and cannot be a known development placeholder. Validation errors never echo the supplied value.

HTTP hardening is configured in `server/config/httpSecurity.js`. API responses
are non-cacheable, CORS uses exact origins, development does not emit HSTS, and
production requires an explicit `CORS_ORIGINS` value. `TRUST_PROXY` defaults to
`false`; use only the deployed reverse proxy's explicit address/CIDR or a
controlled hop count. Blanket proxy trust is rejected at startup.

The server manifest declares Express `^4.22.3`; exact installed versions belong to the lockfile. Normal startup initializes known collections/indexes and is not a strictly read-only database operation. The guarded [read-only harness](../../server/scripts/verifyManagedImagesReadOnly.js) disables that initialization. Successful read-only Atlas checks were recorded on 28 October; availability was not rechecked for this documentation update.

## Collections and schemas

Every model uses Mongoose timestamps. Development fixtures can carry the hidden, immutable `seedBatch` marker.

| Model / collection | Core fields | Important rules and indexes |
|---|---|---|
| `User` / `users` | `name`, private `realName`, `email`, hidden `password`, `phone`, `avatar`, `role`, alert settings, privacy, language/theme preferences | Unique email; `alertLocation` `2dsphere`; preferences allow `en`, `zh-HK`, `zh-CN` and `light`, `dark` |
| `Pet` / `pets` | `name`, `species`, `breed`, `district`, `photo(s)`, details, reward, owner contact snapshot, status, location, last seen, `reportedBy`, moderation audit fields | `location` `2dsphere`; species/status, district/breed/status, owner/date indexes; hidden records are excluded from ordinary reads |
| `Sighting` / `sightings` | `pet`, `reportedBy`, location/name, note, photo, reporter contact, confirmations, `sightedAt`, `submissionId`, moderation audit fields | `location` `2dsphere`; pet/time and reporter/date indexes; hidden sightings and sightings for hidden pets are excluded |
| `Stray` / `strays` | `species`, specific `animalType`, description, up to six photos, condition, district, location, rescue status, reporter, observed/status dates, moderation audit fields | `location` `2dsphere`; district/status/date and owner/date indexes; inactive or hidden records are excluded |
| `Message` / `messages` | `pet`, owner/finder role, `sentBy`, participant, text/photo, shared stray, client request ID | Conversation/date indexes; per-sender request idempotency |
| `Notification` / `notifications` | recipient, related pet/sighting/stray/comment/message, type, title/body/photo, read state | Recipient/date and related-entity indexes; types: proximity, sighting, message, reunited, comment |
| `StrayComment` / `straycomments` | stray, author, text, submission ID, moderation audit fields | Stray/date index; per-author request idempotency; hidden comments do not affect public rows or counts |
| `SavedStray` / `savedstrays` | user, stray | Unique user/stray pair and user/date index |
| `ContentReport` / `contentreports` | reporter, generic target type/ID, private target owner, reason/details, moderation status, private moderator note, reviewer and review timestamp | One report per reporter/target; status/date and target lookup indexes; only `shelter_admin` receives the safe moderation projection |
| `UserBlock` / `userblocks` | blocker, blocked | Unique directed user pair plus reverse relationship index; block lists expose only public user summaries |
| `MediaAsset` / `mediaassets` (opt-in) | provider, private public ID/asset ID/secure URL, width, height, format, bytes, uploader, purpose, checksum, idempotency key, expiry, attachment and recovery states | Unique provider/public ID and uploader/idempotency key; owner/date, state/expiry and attachment indexes. No TTL deletion. Initialization requires `IMAGE_UPLOADS_ENABLED=true`; content `imageIds` references attach transactionally |
| `MediaUploadBudget` / `mediauploadbudgets` (opt-in) | user reference and revision, timestamps | Unique user; private per-user transaction serialization lock. Authoritative daily/active/stored counts remain in MediaAsset, not a second quota ledger |

### GeoJSON invariant

Location-bearing documents use a GeoJSON point:

```json
{
  "type": "Point",
  "coordinates": [114.1694, 22.3193]
}
```

Coordinates are always `[longitude, latitude]`. Longitude is validated from -180 to 180 and latitude from -90 to 90.

## Authentication notation

- **Public**: no token required.
- **Optional**: public access works; a valid bearer token activates ownership/privacy behavior and excludes the current user's own Radar posts where applicable.
- **Required**: `Authorization: Bearer <token>` is mandatory.
- **Shelter admin**: a valid token is mandatory and the current user role must be `shelter_admin`.

## API routes

### System and authentication

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| GET | `/api/health` | Public | — | API/database state, actual and expected database name |
| POST | `/api/auth/register` | Public | name, email, password; optional phone | User and JWT |
| POST | `/api/auth/login` | Public | email, password | User and JWT; rate-limited by email and IP |
| GET | `/api/auth/me` | Required | — | Current safe user profile, privacy, preferences |
| PATCH | `/api/auth/me` | Required | name/displayName, realName, email, phone, optional `avatarImageId` (null removes) | Updated safe current-user profile; omitted avatar ID leaves image unchanged |
| GET | `/api/auth/me/privacy` | Required | — | Contact visibility preference |
| PATCH | `/api/auth/me/privacy` | Required | `contactVisibility` | Updated privacy preference |
| GET | `/api/auth/me/preferences` | Required | — | Language and theme |
| PATCH | `/api/auth/me/preferences` | Required | allowed `language` and/or `theme` only | Updated preferences |

### Pets and sightings

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| GET | `/api/pets` | Optional | species, status, breed, district, page, limit | Paginated listings; authenticated users' own posts excluded |
| GET | `/api/pets/map` | Optional | west/south/east/north bounds, page/limit; guarded legacy radius mode | Approximate lost/sighted markers, full eligible totals and viewport-wide Area Insights; independent of Radar radius |
| GET | `/api/pets/mine` | Required | page, limit | Current user's pet reports |
| GET | `/api/pets/nearby` | Optional | `lat`, `lng`, radiusKm; optional filters/page/limit | Distance-sorted, paginated nearby listings with the same ownership exclusion |
| POST | `/api/pets/smart-match` | Optional | species, breed, coordinates `[lng,lat]`, limit | Ranked candidates and explainable score breakdown |
| POST | `/api/pets/report` | Required | pet fields, location/coordinates, `imageIds`, `submissionId` | Idempotent owner-linked pet report with transactional image attachment |
| GET | `/api/pets/sightings/mine` | Required | — | Sightings submitted by the current user |
| GET | `/api/pets/:id/sightings` | Optional | pet ID | Privacy-filtered, chronological sighting history |
| POST | `/api/pets/:id/sightings/:sightingId/confirm` | Required | pet and sighting IDs | Confirmation state for the sighting |
| GET | `/api/pets/:id` | Optional | pet ID | Public pet details with privacy-aware contact fields |
| POST | `/api/pets/:id/sighting` | Required | location/name, note, `imageIds`, reporter details, sightedAt, submissionId | One idempotent sighting and owner notification when supported |
| PATCH | `/api/pets/:id/status` | Required owner | `{ "status": "lost|sighted|reunited" }` | Updated pet status |

### Rescue community

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| GET | `/api/strays` | Optional | species, condition, rescueStatus, district, page, limit | Paginated active rescue posts |
| GET | `/api/strays/mine` | Required | page, limit | Current user's rescue posts |
| GET | `/api/strays/nearby` | Optional | `lat`, `lng`, radiusKm, limit and filters | Nearby rescue posts with distances |
| GET | `/api/strays/saved` | Required | page, limit | Current user's saved rescue posts |
| POST | `/api/strays/report` | Required | species/animalType, description, `imageIds`, condition, district, location, observedAt, submissionId | Idempotent rescue post; at least one owned uploaded image |
| GET | `/api/strays/:id/comments` | Optional | page, limit | Paginated comments |
| POST | `/api/strays/:id/comments` | Required | text, optional submissionId | Created comment and relevant notification |
| PATCH | `/api/strays/:id/comments/:commentId` | Required author | text | Updated own comment |
| DELETE | `/api/strays/:id/comments/:commentId` | Required author | — | Deletes own comment |
| PUT | `/api/strays/:id/saved` | Required | — | Idempotently saves a post |
| DELETE | `/api/strays/:id/saved` | Required | — | Removes current user's saved link |
| GET | `/api/strays/:id` | Optional | stray ID | Rescue post with privacy-aware author/contact data |
| PATCH | `/api/strays/:id` | Required owner | allowed editable post fields | Updated rescue post |
| DELETE | `/api/strays/:id` | Required owner | — | Soft-removes the post from active queries |
| PATCH | `/api/strays/:id/status` | Required owner/admin | rescue status | Updated rescue lifecycle state |

### Messaging, notifications, analytics, and uploads

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| GET | `/api/chat/inbox` | Required | — | Conversations visible to the current user |
| GET | `/api/chat/:petId` | Required participant | optional participant query for owners | Authorized message thread |
| POST | `/api/chat/:petId` | Required participant | text/imageIds/sharedStrayId/clientRequestId; participant where required | Idempotently created message and notification |
| PATCH | `/api/chat/:petId/read` | Required participant | participant where required; `messageIds` for incoming messages | Idempotent read acknowledgment of authorized incoming messages and related notification state |
| GET | `/api/notifications` | Required | — | Current user's notifications |
| PUT | `/api/notifications/preferences` | Required | enabled, radiusKm, coordinates `[lng,lat]` | Updated alert settings |
| PATCH | `/api/notifications/read-all` | Required | — | Marks all current-user notifications read |
| PATCH | `/api/notifications/:id/read` | Required | notification ID | Marks one owned notification read |
| POST | `/api/matches/candidates` | Optional | species, breed, coordinates `[lng,lat]`, limit | Same explainable Smart Match engine as pet route |
| GET | `/api/analytics/hotspots` | Public | lat, lng, radiusKm, days, source | Aggregated visible sighting and active/visible rescue heat cells |
| POST | `/api/uploads/image` | Required | Legacy route | 410 `IMAGE_IDS_REQUIRED`; no local file write |
| GET / HEAD | `/uploads/*` | Optional; all owning references must permit access | Existing normalized local image path | Protected legacy raster delivery, private/no-store; unknown/hidden/private-for-viewer references return 404 |
| GET / HEAD | `/api/uploads/legacy/*` | Optional; same policy | Existing normalized local image path | Authenticated frontend blob-delivery alias; no token in URL |
| POST | `/api/uploads/managed` | Required; opt-in | multipart `image`, `purpose`, `idempotencyKey` | Idempotent pending media ID, backend preview path and safe dimensions/format/byte count; actual raster validation and Sharp re-encoding |
| GET | `/api/uploads/managed/:id/preview` | Required uploader; opt-in | pending media ID | Authenticated backend-streamed WebP; expired, foreign or non-pending assets return 404 |
| GET | `/api/uploads/managed/:id/content` | Optional; target-dependent | attached media ID | Permission-checked WebP; visible avatars/pets/rescues support guests, sightings/chat are private |
| DELETE | `/api/uploads/managed/:id` | Required uploader | pending media ID | Idempotent exact-owned-object cancellation; attached images cannot be discarded |
| PATCH | `/api/uploads/managed/content/:type/:id` | Required owner | `imageIds` | Transactional replacement/removal with required rescue/message-content constraints |

Managed uploads use Cloudinary authenticated delivery and keep credentials, provider IDs
and signed URLs server-side. Configuration is validated before enabled startup; no
credentials are printed. [Current storage configuration/limits](../PROGRESS.md#managed-and-historical-images) distinguish integrated managed writes from readable legacy records. Input is authenticated multipart; new arbitrary URL/Base64 write fields are rejected.

Database attachment/replacement uses MongoDB transactions; provider operations are outside that transaction and use exact-object compensation/recovery state. Failed attachment keeps retryable pending uploads; old references survive failed replacement. Post-commit retirement deletes only exact detached server-owned objects. This is not a distributed MongoDB/Cloudinary transaction.

Transactional quota reservation and heartbeat leases are implemented. Bounded [exact-ID reconciliation](../../server/scripts/reconcileManagedImages.js) exists with dry-run default, an apply environment guard and a separate deletion option. Dry-run can involve database/provider reads and is not permission to run it against existing assets. No background/bulk cleanup or completed historical migration exists. Process-local concurrency and HTTP rate limiters remain separate deployment limitations.

Optional hidden `imageIds` references preserve old records. Pet submissions declare a partial owner/submission uniqueness index; existing redundant legacy indexes are deferred maintenance, not removed by this documentation task. The guarded read-only harness never creates indexes.

Legacy delivery preserves files and database URLs, rejects traversal and filesystem aliases, and requires the intersection of every owning reference's permissions. It does not give administrators access to private conversations. Previously cached/downloaded copies cannot be recalled. See `LEGACY_IMAGE_DELIVERY.md` for compatibility limits and verification details.

### Trust and safety

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| POST | `/api/safety/reports` | Required | target type/ID, reason, optional details | Private idempotent content report with no moderation metadata exposed |
| GET | `/api/safety/blocks` | Required | — | Current user's blocked-account summaries |
| PUT | `/api/safety/blocks/:userId` | Required | target user ID | Idempotently blocks the target account |
| DELETE | `/api/safety/blocks/:userId` | Required | target user ID | Removes only the current user's block |
| GET | `/api/moderation/reports` | Shelter admin | status, targetType, page, limit | Paginated private queue with safe account summaries and coordinate-free target previews |
| GET | `/api/moderation/reports/:id/images/:index` | Shelter admin; report-scoped | Existing report ID and image index | Revalidated reported-content evidence, including eligible hidden targets; private/no-store, never general conversation access |
| PATCH | `/api/moderation/reports/:id` | Shelter admin | status and optional private note | Audited review decision; does not delete or alter target content |
| PATCH | `/api/moderation/content/:targetType/:targetId/visibility` | Shelter admin | `moderationStatus`, internal reason | Independently hides or restores a supported target with moderator audit data |

Blocking is enforced bidirectionally for messaging and rescue-post comments. Blocked
interaction notifications and conversations are omitted, and contact fields are
suppressed. Emergency pet/rescue posts and safety-critical sighting submission remain
available. Shelter administrators can record reviewed, dismissed, or actioned report
outcomes independently from an explicit hide/restore action. Hidden records remain stored
for audit, while ordinary routes return them as unavailable. Moderation endpoints never
expose contact details or precise coordinates in ordinary queue/decision projections. The separate image-evidence route checks role, report, target and association on every request. Only the reported message is eligible; no general administrator conversation privilege is added. [Evidence policy implementation](../../server/services/moderationEvidence.js).

### Analytics and matching semantics

`/api/analytics/hotspots` aggregates **sightings and rescue reports**, not Pet documents. Hidden parents/content and inactive rescues are excluded; public-cell membership determines eligible cells/counts with explicit output truncation metadata. [Controller](../../server/controllers/analyticsController.js), [aggregation](../../server/services/hotspotAnalytics.js).

Map Area Insights instead counts distinct currently eligible Pet documents across the committed viewport before pagination. Its district/animal/seven-day metrics and historical-data limits are defined in the [Area Insights report](../../verification/AREA_INSIGHTS_2026-10-28.md).

Both match endpoints use the same [rules-based engine](../../server/services/matchEngine.js): species, breed text, spatial decay and recency, not photo analysis. Privacy projection applies to derived scores/rankings as well as coordinates. [Exact rules and evaluation gap](../PROGRESS.md#smart-match-behavior-and-evaluation-gap).

## Local startup

1. Copy `server/.env.example` to `server/.env`.
2. Set `MONGODB_URI` to the private Atlas URI and generate a non-placeholder JWT secret of at least 32 characters.
3. Never place either secret in the root frontend environment or a `VITE_` variable.

```powershell
npm.cmd install
npm.cmd --prefix server install
npm.cmd --prefix server start
npm.cmd run dev
```

Default API: `http://localhost:5000`. The current [Vite configuration](../../vite.config.ts) binds `http://localhost:3000` with `strictPort: true` and proxies `/api` and protected `/uploads`. It does not silently choose 5173.

## Read-only HTTP checks

```powershell
curl.exe http://localhost:5000/api/health
curl.exe "http://localhost:5000/api/pets?status=lost&limit=5"
npm.cmd run smoke:api
```

`/api/health` should report `status: "ok"`, `db: "connected"`, and both database fields as `petlostapp`.

For strictly read-only Atlas verification use `node server/scripts/verifyManagedImagesReadOnly.js`, which avoids normal collection/index initialization. No connectivity/provider checks were executed while drafting this reference.

## Explicitly authorized seed and mutating verification

The `fyp-demo-v1` seed is guarded and idempotent. It never targets `sample_mflix`. Set `ALLOW_TEST_SEED=true` and `SEED_USER_PASSWORD` only in local `server/.env` before using it.

```powershell
npm.cmd --prefix server run seed:test
npm.cmd --prefix server run seed:verify
npm.cmd --prefix server run seed:clean
```

Cleanup removes only documents carrying the approved seed-batch marker and requires the same explicit safety flag. Do not run seed or cleanup commands against genuine data without reviewing the configured target first.

`verify:privacy`, `verify:sightings`, `verify:strays`, `verify:preferences` and other workflow-verification scripts may mutate data or create/remove fixtures. They are not interchangeable with smoke/read-only checks. Real local transaction suites write disposable databases; real-provider suites upload/delete scoped provider objects. See the [command safety matrix](../PROGRESS.md#verification-and-command-safety) before invoking any command. This documentation approval authorizes none of those operations.
