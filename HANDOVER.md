# PawRadar — Current Handover

## Current milestone

PawRadar is a mobile-first Vue web application backed by an Express REST API and MongoDB Atlas. The web feature set is integrated; native packaging remains secondary. The immediate operational blocker is Atlas connectivity in the local environment, not an identified application-code defect.

## Stack

- Frontend: Vue 3.5, Composition API with `<script setup lang="ts">`, Vue Router, Axios, Vite, Vue I18n.
- Maps: Leaflet, marker clustering, and `leaflet.heat`.
- Device APIs: Capacitor core, camera, geolocation, Android, and iOS packages.
- Backend: Node.js, Express 4, Mongoose 8, JWT, bcryptjs, CORS, dotenv.
- Database: MongoDB Atlas database `petlostapp`; GeoJSON coordinates are always `[longitude, latitude]`.

## Durable storage (Stage 2, Phase 2)

- Added a provider adapter, private `MediaAsset` model, authenticated multipart upload and uploader-only pending preview, using Cloudinary, Multer, file-type and Sharp.
- Managed uploads default to disabled. All five forms now use multipart uploads and server-issued IDs, transactional attachment/replacement, cancellation, retries and permission-checked backend delivery. Legacy records/files remain unchanged and readable. Configuration is backend-only in `server/.env`.
- Actual JPEG/PNG/static WebP files are re-encoded to bounded WebP with metadata removed. Ownership, idempotency, quotas, concurrency and exact-object compensation are covered by isolated tests.
- Provider/DB failure leaves retryable pending images or auditable recovery state. Explicit owner cancellation and post-commit replacement deletion affect exact server-owned IDs only. No bulk cleanup worker, migration or arbitrary provider-ID deletion is enabled.
- One approved temporary Cloudinary image was uploaded, read back, and deleted; absence was confirmed. This probe did not connect to MongoDB or alter application records.
- Hidden `imageIds` references preserve legacy string fields; pet submissions add a partial owner/submission uniqueness index. Mocked API tests and real transaction tests are distinct; the latter require an isolated local replica set. Read-only Atlas checks use `server/scripts/verifyManagedImagesReadOnly.js` without production index initialization.
- Next storage phase (not started): dry-run legacy migration, resumable recovery/abandoned-upload reconciliation, rollback validation and separately approved live image-write verification. Keep seeds, migration and bulk cleanup disabled.

## Working product flows

- Account registration/login, profile editing, avatar and private real-name persistence.
- Persistent English, Traditional Chinese (Hong Kong), and Simplified Chinese preferences; light/dark themes.
- Radar feed and map with species, breed, district, status, radius, and ownership-aware filtering.
- Lost-pet reporting, public pet deep links, owner lifecycle actions, sightings, chronological trajectory, and community confirmation.
- QR flyer generation, printing, Web Share, phone, WhatsApp, and private in-app messaging.
- Explainable multi-factor Smart Match scoring through one backend candidate request.
- Rescue community feed with dedicated animal type, location, comments, saves, sharing, owner moderation, and rescue status.
- Notifications, proximity preferences, spatial hotspot analytics, heatmap display, saved content, and profile activity.

## Backend layout

- Startup and CORS: `server/index.js`.
- Atlas connection and database-name guard: `server/config/database.js`.
- Collection/index initialization: `server/config/collections.js`.
- JWT policy: `server/config/security.js`.
- Models: `User`, `Pet`, `Sighting`, `Stray`, `Message`, `Notification`, `StrayComment`, `SavedStray`.
- API documentation: `BACKEND_OVERVIEW.md`.

The server loads secrets only from `server/.env`. `JWT_SECRET` must be at least 32 characters and must not be a known placeholder. Database startup is pinned to `petlostapp` even when the URI omits a database name.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:frontend
npm.cmd --prefix server test
npm.cmd run build
```

When Atlas access is available:

```powershell
npm.cmd --prefix server start
npm.cmd run smoke:api
npm.cmd --prefix server run seed:verify
npm.cmd --prefix server run verify:bugfixes
npm.cmd --prefix server run verify:privacy
npm.cmd --prefix server run verify:sightings
npm.cmd --prefix server run verify:strays
npm.cmd --prefix server run verify:preferences
```

## Protected cleanup follow-up

Do not delete the nine withheld pet/user SVG assets until a read-only query of `petlostapp` confirms every collection/document/field reference. Do not modify `sample_mflix`. Obtain separate approval before deleting any withheld asset.

## Recommended next action

Restore Atlas Network Access, start the backend, run the smoke/live-verification commands, and perform the read-only asset-reference audit. Then address any verified runtime failure without changing production data.
