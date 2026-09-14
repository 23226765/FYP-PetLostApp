# PawRadar Backend Overview

This document reflects the active Express/Mongoose backend under `server/`.

## 1. Database and Connection

### Database provider

- **Provider:** Azure Cosmos DB using its MongoDB API (not local MongoDB and not MongoDB Atlas).
- **Database name:** `pawradar`.
- **Connection:** `server/index.js` calls `mongoose.connect()` with a 15-second server-selection timeout.
- **Startup behavior:** the Express server still starts if the database connection fails. In that state, `/api/health` returns HTTP `503` with `status: "degraded"`.

### Environment variables

Local backend variables are defined in the gitignored file `server/.env` and loaded by `dotenv` through `import 'dotenv/config'`.

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Cosmos DB MongoDB connection string, including the `pawradar` database |
| `PORT` | Express port; defaults to `5000` |
| `JWT_SECRET` | Signs and verifies seven-day login tokens |
| `CORS_ORIGINS` | Optional comma-separated browser origins; defaults to `http://localhost:3000,http://127.0.0.1:3000` |

> Never commit `server/.env`. Production must define a strong `JWT_SECRET`; the source currently contains a development fallback.

### GeoJSON convention and indexes

All map points use GeoJSON in longitude-first order:

```json
{
  "type": "Point",
  "coordinates": [114.1694, 22.3193]
}
```

`coordinates` is always **`[lng, lat]`**, with longitude from `-180` to `180` and latitude from `-90` to `90`.

| Model | Defined indexes |
|---|---|
| `User` | `alertLocation: 2dsphere` |
| `Pet` | `location: 2dsphere`; `{ species, status }`; `{ district, breed, status }` |
| `Sighting` | `location: 2dsphere`; `{ pet }`; `{ reportedBy, createdAt: -1 }` |
| `Stray` | `location: 2dsphere`; `{ district, rescueStatus, createdAt: -1 }` |
| `Message` | `{ pet, createdAt }`; `{ sentBy, createdAt: -1 }`; `{ pet, participant, createdAt }` |
| `Notification` | `{ user, createdAt: -1 }`; `{ user, pet, type, sighting }` |

The `2dsphere` indexes support `$geoNear` radius queries for pets, strays, and alert recipients. Several controllers include an in-memory sorting fallback for Cosmos DB configurations that reject an unindexed `ORDER BY`.

## 2. Data Models

Mongoose normally maps these model names to the collections `users`, `pets`, `sightings`, `strays`, `messages`, and `notifications`.

### `User`

| Field | Type and rules |
|---|---|
| `name` | String, required, trimmed |
| `email` | String, required, unique, lowercase, trimmed |
| `password` | String, required; bcrypt hash is stored |
| `phone` | String, default empty |
| `avatar` | String, default profile-image URL |
| `role` | `user \| shelter_admin`, default `user` |
| `alertsEnabled` | Boolean, default `true` |
| `alertRadiusKm` | Number from 1–50, default `3` |
| `alertLocation` | Optional GeoJSON Point with `[lng, lat]` |
| `createdAt` | Date, defaults to now |

### `Pet`

| Field | Type and rules |
|---|---|
| `name` | String, required, trimmed |
| `species` | `Dog \| Cat \| Other`, required |
| `breed`, `district` | Strings |
| `photo`, `photos` | Primary image String and additional String array |
| `description`, `details`, `reward` | Strings |
| `ownerName`, `ownerPhone` | Contact Strings |
| `status` | `lost \| sighted \| reunited`, default `lost` |
| `locationName` | Human-readable location String |
| `location` | Required GeoJSON Point with `[lng, lat]` |
| `lastSeen` | Date |
| `mapX`, `mapY` | Numbers, each defaulting to `50` |
| `reportedBy` | Optional ObjectId reference to `User` |
| `createdAt`, `updatedAt` | Automatic timestamps |

### `Sighting`

| Field | Type and rules |
|---|---|
| `pet` | Required ObjectId reference to `Pet` |
| `reportedBy` | Optional ObjectId reference to `User` |
| `location` | Required GeoJSON Point with `[lng, lat]` |
| `locationName`, `note`, `photo` | Strings |
| `reporterName`, `reporterPhone` | Contact Strings |
| `confirmedBy` | Array of `User` ObjectIds |
| `resolved` | Boolean, default `false` |
| `createdAt`, `updatedAt` | Automatic timestamps |

### `Stray`

| Field | Type and rules |
|---|---|
| `species` | `Dog \| Cat \| Other`, required |
| `description` | String, required, trimmed |
| `photo` | String |
| `condition` | `unknown \| healthy \| injured \| critical`, default `unknown` |
| `district`, `locationName` | Required Strings |
| `location` | Required GeoJSON Point with `[lng, lat]` |
| `rescueStatus` | `reported \| rescue_dispatched \| rescued`, default `reported` |
| `reporterName`, `reporterPhone` | Required contact Strings |
| `reportedBy` | Optional ObjectId reference to `User` |
| `statusUpdatedAt` | Date, defaults to now |
| `createdAt`, `updatedAt` | Automatic timestamps |

### `Message`

| Field | Type and rules |
|---|---|
| `pet` | Required ObjectId reference to `Pet` |
| `sender` | `owner \| finder`, required |
| `sentBy` | Optional ObjectId reference to `User` |
| `participant` | Finder/conversation ObjectId reference to `User` |
| `text`, `photo` | Strings; a request must supply at least one |
| `createdAt`, `updatedAt` | Automatic timestamps |

### `Notification`

`Notification` is also an active Mongoose model and supports the radius-alert feature.

| Field | Type and rules |
|---|---|
| `user` | Required ObjectId reference to the recipient `User` |
| `pet` | Required ObjectId reference to `Pet` |
| `sighting` | Optional ObjectId reference to `Sighting` |
| `type` | `proximity \| sighting`, required |
| `title`, `body` | Required Strings |
| `photo` | String |
| `read` | Boolean, default `false` |
| `createdAt`, `updatedAt` | Automatic timestamps |

## 3. Authentication

- **Public:** no token is required.
- **Optional JWT:** a valid `Authorization: Bearer <token>` attaches the current user; missing or invalid tokens continue as a guest.
- **JWT required:** `requireAuth` rejects missing, invalid, or expired tokens with HTTP `401`.
- JWTs contain the user ID and expire after seven days.
- Login is rate-limited in memory over a 15-minute window: 10 failed attempts per IP and 5 per email.

## 4. Active API Routes

Unless noted otherwise, successful JSON responses use the wrapper shown in the **Returns** column. Validation errors use `{ "error": "..." }`.

### Health

| Method | Path | Auth | Required input | Returns |
|---|---|---|---|---|
| `GET` | `/api/health` | Public | None | HTTP `200` with `{ status: "ok", db: "connected", readyState: 1 }`, or HTTP `503` when disconnected |

### Authentication and profile

| Method | Path | Auth | Required input | Returns |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Body: `name`, valid `email`, `password` (min 6); optional `phone` | HTTP `201`: `{ token, user }` |
| `POST` | `/api/auth/login` | Public | Body: `email`, `password` | `{ token, user }` |
| `GET` | `/api/auth/me` | JWT | Bearer token | `{ user }` |
| `PATCH` | `/api/auth/me` | JWT | Body: `name`, valid `email`, `phone` | `{ user }` |

### Lost pets and sightings

| Method | Path | Auth | Required input | Returns |
|---|---|---|---|---|
| `GET` | `/api/pets` | Public | Optional query: `species`, `status`, `breed`, `district` | `{ pets }`, newest first |
| `GET` | `/api/pets/mine` | JWT | Bearer token | `{ pets }` reported by the current user |
| `GET` | `/api/pets/nearby` | Public | Query: `lat`, `lng`; optional `radiusKm` (default 3, max 50), `species`, `status`, `breed`, `district` | `{ pets }` nearest first, including `distanceKm` |
| `POST` | `/api/pets/report` | Optional JWT | Body: `name`, `species`, valid HK `district`, `locationName`, `coordinates`, and valid owner name/phone; optional `breed`, `photo`, `description`, `details`, `reward`, `lastSeen`, `mapX`, `mapY` | HTTP `201`: `{ pet }`; also creates nearby proximity notifications |
| `GET` | `/api/pets/sightings/mine` | JWT | Bearer token | `{ sightings }` reported by the current user, with selected pet fields populated |
| `GET` | `/api/pets/:id/sightings` | Optional JWT | Pet `id` | `{ sightings }`, newest first; includes confirmation count and current-user state |
| `POST` | `/api/pets/:id/sightings/:sightingId/confirm` | JWT | Pet `id`, sighting `sightingId` | `{ confirmationCount, confirmedByMe: true }` |
| `GET` | `/api/pets/:id` | Public | Pet `id` | `{ pet }` |
| `POST` | `/api/pets/:id/sighting` | Optional JWT | Pet `id`; body requires `coordinates`; optional `locationName`, `note`, `photo`, `reporterName`, `reporterPhone` | HTTP `201`: `{ sighting, pet }`; pet becomes `sighted` and notifications are created |
| `PATCH` | `/api/pets/:id/status` | JWT, owner only | Pet `id`; body `status` = `lost`, `sighted`, or `reunited` | `{ pet }` |

Pet reports and stray reports prefer the authenticated user's saved contact details when a valid optional token is supplied.

### Stray-animal rescue

| Method | Path | Auth | Required input | Returns |
|---|---|---|---|---|
| `GET` | `/api/strays` | Public | Optional query: `species`, `condition`, `status`, `district` | `{ strays }`, newest first |
| `GET` | `/api/strays/mine` | JWT | Bearer token | `{ strays }` reported by the current user |
| `GET` | `/api/strays/nearby` | Public | Query: `lat`, `lng`; optional `radiusKm` (default 5, clamped 1–50), `species`, `condition`, `status`, `district` | `{ strays }` nearest first, including `distanceKm` |
| `POST` | `/api/strays/report` | Optional JWT | Body: `species`, `description`, valid HK `district`, `locationName`, `coordinates`, valid reporter name/phone; optional `photo`, `condition` | HTTP `201`: `{ stray }` |
| `GET` | `/api/strays/:id` | Public | Stray report `id` | `{ stray }` |
| `PATCH` | `/api/strays/:id/status` | JWT, reporter or shelter admin | Stray report `id`; body `status` = `reported`, `rescue_dispatched`, or `rescued` | `{ stray }` |

### Private chat

All chat routes require JWT authentication. Conversations are scoped by pet and finder (`participant`).

| Method | Path | Auth | Required input | Returns |
|---|---|---|---|---|
| `GET` | `/api/chat/inbox` | JWT | Bearer token | `{ conversations }` visible to the current owner/finder, newest activity first |
| `GET` | `/api/chat/:petId` | JWT | Pet `petId`; pet owners must also supply query `participantId` | `{ messages, viewerRole }` in chronological order |
| `POST` | `/api/chat/:petId` | JWT | Pet `petId`; body needs `text` or `photo`; owners also supply `participantId` for an existing conversation | HTTP `201`: `{ message }` |

Text messages are limited to 2,000 characters. Encoded photo strings are limited to 1,500,000 characters.

### Notifications and radius-alert preferences

All notification routes require JWT authentication.

| Method | Path | Auth | Required input | Returns |
|---|---|---|---|---|
| `GET` | `/api/notifications` | JWT | Bearer token | `{ notifications }`, up to 50 newest records |
| `PUT` | `/api/notifications/preferences` | JWT | Body: `enabled` Boolean, `radiusKm` from 1–50; optional `coordinates: [lng, lat]` | `{ preferences }` |
| `PATCH` | `/api/notifications/read-all` | JWT | Bearer token | `{ success: true }` |
| `PATCH` | `/api/notifications/:id/read` | JWT | Notification `id` | `{ notification }` |

The radius engine persists in-app notifications for users whose `alertLocation` falls within their individual radius. It does not currently send native push notifications.

## 5. Health Check and Quick Verification

Start the backend from the workspace root:

```powershell
cd server
npm start
```

In another terminal, verify Express and the database connection:

```powershell
curl.exe -i http://localhost:5000/api/health
```

Expected: HTTP `200` and `{"status":"ok","db":"connected","readyState":1}`.

Verify a normal database read:

```powershell
curl.exe -i http://localhost:5000/api/pets
```

Verify the geospatial index/query near central Hong Kong:

```powershell
curl.exe -i "http://localhost:5000/api/pets/nearby?lat=22.3193&lng=114.1694&radiusKm=10"
```

The health URL can also be opened directly in a browser: <http://localhost:5000/api/health>.

## 6. Useful Backend Commands

Run these from `server/`:

```powershell
npm run dev   # Nodemon development server
npm test      # Node route tests
npm run seed  # Replaces Pet and Sighting seed data; use deliberately
```
