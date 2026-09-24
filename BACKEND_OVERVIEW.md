# PawRadar Backend Overview

## Runtime and database

- Runtime: Node.js with ES modules.
- HTTP API: Express 4 on `PORT` (default `5000`).
- ODM: Mongoose 8.
- Authentication: bearer JWT plus bcryptjs password hashing.
- Database: MongoDB Atlas, always selected as lowercase `petlostapp` through `dbName` in `server/config/database.js`.
- Secrets: `MONGODB_URI` and `JWT_SECRET` are loaded only from `server/.env`. That file is Git-ignored.
- Startup safety: the server validates the JWT secret, connects, confirms the selected database name, pings Atlas, creates the known collections/indexes, and only then listens.
- Images: MongoDB stores URL/data metadata strings; the server does not store binary image documents.

`JWT_SECRET` must contain at least 32 characters and cannot be a known development placeholder. Validation errors never echo the supplied value.

## Collections and schemas

Every model uses Mongoose timestamps. Development fixtures can carry the hidden, immutable `seedBatch` marker.

| Model / collection | Core fields | Important rules and indexes |
|---|---|---|
| `User` / `users` | `name`, private `realName`, `email`, hidden `password`, `phone`, `avatar`, `role`, alert settings, privacy, language/theme preferences | Unique email; `alertLocation` `2dsphere`; preferences allow `en`, `zh-HK`, `zh-CN` and `light`, `dark` |
| `Pet` / `pets` | `name`, `species`, `breed`, `district`, `photo(s)`, details, reward, owner contact snapshot, status, location, last seen, `reportedBy` | `location` `2dsphere`; species/status, district/breed/status, owner/date indexes; status is `lost`, `sighted`, or `reunited` |
| `Sighting` / `sightings` | `pet`, `reportedBy`, location/name, note, photo, reporter contact, confirmations, `sightedAt`, `submissionId` | `location` `2dsphere`; pet/time and reporter/date indexes; sparse unique submission ID prevents retry duplication |
| `Stray` / `strays` | `species`, specific `animalType`, description, up to six photos, condition, district, location, rescue status, reporter, observed/status dates | `location` `2dsphere`; district/status/date and owner/date indexes; per-owner submission idempotency |
| `Message` / `messages` | `pet`, owner/finder role, `sentBy`, participant, text/photo, shared stray, client request ID | Conversation/date indexes; per-sender request idempotency |
| `Notification` / `notifications` | recipient, related pet/sighting/stray/comment/message, type, title/body/photo, read state | Recipient/date and related-entity indexes; types: proximity, sighting, message, reunited, comment |
| `StrayComment` / `straycomments` | stray, author, text, submission ID | Stray/date index; per-author request idempotency |
| `SavedStray` / `savedstrays` | user, stray | Unique user/stray pair and user/date index |

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

## API routes

### System and authentication

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| GET | `/api/health` | Public | — | API/database state, actual and expected database name |
| POST | `/api/auth/register` | Public | name, email, password; optional phone | User and JWT |
| POST | `/api/auth/login` | Public | email, password | User and JWT; rate-limited by email and IP |
| GET | `/api/auth/me` | Required | — | Current safe user profile, privacy, preferences |
| PATCH | `/api/auth/me` | Required | name/displayName, realName, email, phone, avatar | Updated safe current-user profile |
| GET | `/api/auth/me/privacy` | Required | — | Contact visibility preference |
| PATCH | `/api/auth/me/privacy` | Required | `contactVisibility` | Updated privacy preference |
| GET | `/api/auth/me/preferences` | Required | — | Language and theme |
| PATCH | `/api/auth/me/preferences` | Required | allowed `language` and/or `theme` only | Updated preferences |

### Pets and sightings

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| GET | `/api/pets` | Optional | species, status, breed, district, page, limit | Paginated listings; authenticated users' own posts excluded |
| GET | `/api/pets/mine` | Required | page, limit | Current user's pet reports |
| GET | `/api/pets/nearby` | Optional | `lat`, `lng`, radiusKm; optional filters/page/limit | Distance-sorted, paginated nearby listings with the same ownership exclusion |
| POST | `/api/pets/smart-match` | Optional | species, breed, coordinates `[lng,lat]`, limit | Ranked candidates and explainable score breakdown |
| POST | `/api/pets/report` | Optional | pet fields plus location/coordinates | Created pet report; attaches authenticated reporter when present |
| GET | `/api/pets/sightings/mine` | Required | — | Sightings submitted by the current user |
| GET | `/api/pets/:id/sightings` | Optional | pet ID | Privacy-filtered, chronological sighting history |
| POST | `/api/pets/:id/sightings/:sightingId/confirm` | Required | pet and sighting IDs | Confirmation state for the sighting |
| GET | `/api/pets/:id` | Optional | pet ID | Public pet details with privacy-aware contact fields |
| POST | `/api/pets/:id/sighting` | Optional | location/name, note/photo, reporter details, sightedAt, submissionId | One idempotent sighting and owner notification when supported |
| PATCH | `/api/pets/:id/status` | Required owner | `{ "status": "lost|sighted|reunited" }` | Updated pet status |

### Rescue community

| Method | Path | Auth | Main input | Result |
|---|---|---:|---|---|
| GET | `/api/strays` | Optional | species, condition, rescueStatus, district, page, limit | Paginated active rescue posts |
| GET | `/api/strays/mine` | Required | page, limit | Current user's rescue posts |
| GET | `/api/strays/nearby` | Optional | `lat`, `lng`, radiusKm, limit and filters | Nearby rescue posts with distances |
| GET | `/api/strays/saved` | Required | page, limit | Current user's saved rescue posts |
| POST | `/api/strays/report` | Required | species/animalType, description, photos, condition, district, location, observedAt, submissionId | Idempotently created rescue post |
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
| POST | `/api/chat/:petId` | Required participant | text/photo/sharedStrayId/clientRequestId; participant where required | Idempotently created message and notification |
| GET | `/api/notifications` | Required | — | Current user's notifications |
| PUT | `/api/notifications/preferences` | Required | enabled, radiusKm, coordinates `[lng,lat]` | Updated alert settings |
| PATCH | `/api/notifications/read-all` | Required | — | Marks all current-user notifications read |
| PATCH | `/api/notifications/:id/read` | Required | notification ID | Marks one owned notification read |
| POST | `/api/matches/candidates` | Optional | species, breed, coordinates `[lng,lat]`, limit | Same explainable Smart Match engine as pet route |
| GET | `/api/analytics/hotspots` | Public | lat, lng, radiusKm, days, source | Aggregated pet/sighting/stray heat points |
| POST | `/api/uploads/image` | Required | image `dataUrl` | Validated application image URL/result |

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

Default API: `http://localhost:5000`. Vite commonly uses `http://localhost:5173` and proxies `/api` to the backend.

## Safe checks

```powershell
curl.exe http://localhost:5000/api/health
curl.exe "http://localhost:5000/api/pets?status=lost&limit=5"
npm.cmd run smoke:api
```

`/api/health` should report `status: "ok"`, `db: "connected"`, and both database fields as `petlostapp`.

## Seed and verification commands

The `fyp-demo-v1` seed is guarded and idempotent. It never targets `sample_mflix`. Set `ALLOW_TEST_SEED=true` and `SEED_USER_PASSWORD` only in local `server/.env` before using it.

```powershell
npm.cmd --prefix server run seed:test
npm.cmd --prefix server run seed:verify
npm.cmd --prefix server run seed:clean
```

Cleanup removes only documents carrying the approved seed-batch marker and requires the same explicit safety flag. Do not run seed or cleanup commands against genuine data without reviewing the configured target first.
