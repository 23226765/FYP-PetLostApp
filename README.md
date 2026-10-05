# PawRadar — Hyperlocal Lost Pet Recovery & Sighting Platform

PawRadar is a mobile-first web application for reporting lost pets, recording community sightings, tracing movement, coordinating rescue work, and contacting owners quickly. It combines database-level geospatial search with a localized Vue interface so nearby reports can be ranked and displayed without exposing MongoDB credentials to the browser.

## Technology stack

| Layer | Current technology |
|---|---|
| Frontend | Vue 3.5, TypeScript 5.7, Composition API, Vue Router 4.6, Axios 1.19, Vite 8 |
| Localization | Vue I18n 11; English, Traditional Chinese (Hong Kong), Simplified Chinese |
| Maps | Leaflet 1.9, Leaflet marker clusters, `leaflet.heat` |
| Backend | Node.js, Express 4.19, REST API, Helmet 8.1, JWT 9, bcryptjs 3 |
| Data | Mongoose 8.6 and MongoDB Atlas database `petlostapp` |
| Device integration | Capacitor 8 core, camera, geolocation, Android and iOS packages |
| Testing | Vitest, Vue Test Utils, Node's built-in test runner, `vue-tsc`, ESLint |

The user interface is designed as a native-like mobile shell with a maximum width of 480 px. Its core brand tokens are deep teal `#1d6360`, coral `#ef6351`, and warm white `#fcf9f2`, implemented through semantic theme variables for light and dark modes.

## Architecture

```text
Vue client
  ├─ Vue Router screens and mobile navigation
  ├─ central authentication/preferences state
  ├─ typed Axios service (/api)
  └─ Leaflet maps, trajectory, clusters and heatmap
            │ HTTP + bearer JWT
            ▼
Express API
  ├─ validation, authorization and privacy projection
  ├─ pet/sighting/rescue/message/notification controllers
  ├─ Smart Match and hotspot services
  └─ Mongoose models and indexes
            │ TLS MongoDB protocol
            ▼
MongoDB Atlas: petlostapp
```

The frontend never connects directly to MongoDB. `MONGODB_URI` and `JWT_SECRET` are backend-only values loaded from `server/.env`.

### Geospatial design

`Pet`, `Sighting`, `Stray`, and the user's optional alert location store GeoJSON points with coordinates in `[longitude, latitude]` order. Explicit `2dsphere` indexes support `$geoNear` queries and spherical distance ordering. Scalar indexes cover common status, district, species, ownership, and chronology filters.

Database-level spatial filtering avoids loading a large unbounded result set into the application for distance calculations. The API returns the limited, ordered records needed by the client while keeping the same ownership rule across list, map, status, nearby, and pagination results.

## Implemented features

- Registration, login, JWT session restoration, profile/avatar editing, private real-name storage, and contact privacy.
- Persistent account language/theme preferences with anonymous local fallback and cross-tab synchronization.
- Radar list and map with species, breed, district, status, radius, pagination, marker clustering, and owner-post exclusion.
- Lost-pet reporting, public `/pets/:id` deep links, owner-only status changes, and reunited state.
- Idempotent sighting submissions, owner-authorized detail history, chronological map trajectory, and community confirmation.
- Explainable Smart Match scoring by species, breed-token similarity, spatial distance decay, and temporal recency.
- Real QR lost-pet flyers, printable layout, Web Share, one-tap phone, and WhatsApp actions.
- Authenticated direct-message inbox and threads with text, photos, shared rescue posts, and participant authorization.
- Rescue community reports with specific animal type, multiple photos, location, conditions, comments, saves, sharing, and rescue lifecycle.
- Proximity preferences, in-app notifications, notification deep links, read state, and unread navigation badges.
- Spatial hotspot aggregation covering pets, sightings, and rescue reports, rendered as a Leaflet heatmap.
- Saved content and profile activity screens.
- Private content reporting, reversible account blocking, and a role-restricted shelter-admin review queue with audited, non-destructive decisions.

## Data model

The active collections are:

- `users`
- `pets`
- `sightings`
- `strays`
- `messages`
- `notifications`
- `straycomments`
- `savedstrays`
- `contentreports`
- `userblocks`

All use timestamps. Ownership checks are enforced in controllers. Idempotency fields prevent duplicate sightings, messages, rescue posts, and comments caused by retried submissions. Existing image fields still accept legacy URL and Base64 strings; conversion to managed media is not complete.

See [BACKEND_OVERVIEW.md](BACKEND_OVERVIEW.md) for the model/index summary and registered API endpoints.

## Durable image storage: Phase 1 foundation

The authenticated managed-image pipeline is separate from existing image flows and disabled by default. It does not migrate or replace existing images. Cloudinary is behind a storage adapter; Sharp validates actual raster bytes, corrects orientation, strips metadata (including EXIF GPS), resizes, and re-encodes images to WebP. SVG, GIF, animated images and non-image files are rejected.

- `POST /api/uploads/managed`: bearer authentication, multipart file `image`, fields `purpose` and `idempotencyKey`. Supported purposes: `avatar`, `pet`, `sighting`, `stray`, `message`.
- `GET /api/uploads/managed/:id/preview`: uploader-only, unexpired pending-image preview streamed through the backend. Cloudinary delivery is authenticated; provider IDs and signed URLs are not returned to clients.
- Private `MediaAsset` metadata records track ownership, checksums, idempotency, provider metadata and recovery states. The optional `mediaassets` collection/indexes are initialized only when managed uploads are explicitly enabled.
- Input limit: 8 MiB, 40 megapixels and 12,000 pixels per side; two concurrent jobs globally and one per user per backend process. Limits are 100 reservations per user per rolling day and ten outstanding uploads. Per-purpose output limits are 250 KiB–1 MiB and 512–1,600 pixels per side.
- A database reservation precedes upload. A failed final write triggers exact-object compensation when its state can be safely confirmed. Database/provider outages retain recovery metadata rather than deleting an object with an uncertain committed state.

Configuration belongs only in local `server/.env`; never use frontend `VITE_` variables:

```dotenv
IMAGE_STORAGE_PROVIDER=cloudinary
IMAGE_UPLOADS_ENABLED=false
MEDIA_NAMESPACE=petlostapp/dev
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
ALLOW_IMAGE_MIGRATION=false
ALLOW_IMAGE_CLEANUP=false
```

Keep managed uploads disabled until Phase 2 connects content attachment and authorized delivery. No migration, abandonment cleanup worker or client deletion endpoint runs in Phase 1. Expired pending records are not automatically deleted; recovery and cleanup require a later, separately approved implementation. Multi-instance deployments will also need distributed concurrency/quota enforcement.

The opt-in `npm.cmd --prefix server run verify:images -- --confirm-temporary-cloudinary-write` probe creates one uniquely named Cloudinary test image, verifies signed delivery, and deletes that exact object. It never connects to MongoDB. Run it only with explicit permission for the temporary provider write.

## Security and runtime hardening

- Backend startup requires a non-placeholder `JWT_SECRET` of at least 32 characters.
- The secret is never logged on configuration failure.
- Login throttling uses normalized email and IP counters and clears both after successful authentication.
- Registration, authenticated mutations, and uploads have bounded user/IP rate limits with standard response headers.
- Helmet applies CSP, clickjacking, MIME-sniffing, referrer and cross-origin resource protections; HSTS is enabled only in production.
- API responses use `Cache-Control: no-store`; uploaded images retain an explicit cross-origin resource policy for the frontend.
- CORS uses an exact origin allowlist with credentials. Production startup requires `CORS_ORIGINS` explicitly.
- Proxy trust defaults to disabled and rejects blanket `true`/wildcard trust. Production deployments must identify their proxy by subnet/address or a controlled hop count.
- Express body limits support profile and messaging images while preserving explicit validation.
- Trust-and-safety reports are private and idempotent. User blocks are account-scoped, reversible, rate-limited, and suppress direct social interaction without hiding emergency discovery posts.
- Moderation queue reads and updates require `shelter_admin`; projections exclude contact and precise-location fields, and review decisions never delete target content automatically.
- Central error logging records bounded diagnostic metadata, not complete request, driver, URI, or configuration objects.
- Startup refuses an unexpected database and always selects lowercase `petlostapp`.
- `sample_mflix` is not referenced, queried, seeded, or modified.

## Local setup

### Requirements

- Node.js 22 or newer (required by the image-validation dependencies)
- npm
- A MongoDB Atlas URI whose user can access `petlostapp`

### Install

```powershell
npm.cmd install
npm.cmd --prefix server install
```

### Configure the backend

Copy `server/.env.example` to `server/.env`, then set values locally:

```dotenv
MONGODB_URI=your_mongodb_atlas_connection_string
PORT=5000
JWT_SECRET=replace_with_a_random_secret_of_at_least_32_characters
```

The example JWT text is not a valid runtime secret. Known placeholders are deliberately rejected. Never commit `server/.env`, put its values in frontend source, or expose them through a `VITE_` variable.

Development CORS and proxy configuration:

```dotenv
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
TRUST_PROXY=false
```

For production, set `NODE_ENV=production`, list the deployed frontend origin in
`CORS_ORIGINS`, and configure `TRUST_PROXY` for the actual reverse proxy. Prefer
an explicit IP/CIDR such as `10.0.0.0/8`; a hop count such as `1` is accepted
only when the backend cannot be reached through a shorter, untrusted network
path. Never set `TRUST_PROXY=true` or `TRUST_PROXY=*`.

### Start the application

Terminal 1:

```powershell
npm.cmd --prefix server start
```

Terminal 2:

```powershell
npm.cmd run dev
```

Open the exact local URL printed by Vite, normally `http://localhost:5173`. The API defaults to `http://localhost:5000`.

### Verify connectivity

```powershell
curl.exe http://localhost:5000/api/health
npm.cmd run smoke:api
```

A healthy response reports `status: "ok"`, `db: "connected"`, and database `petlostapp`.

## Safe demonstration data

The idempotent `fyp-demo-v1` seed creates only fictional PawRadar data. It requires both `ALLOW_TEST_SEED=true` and a local `SEED_USER_PASSWORD` in `server/.env`.

```powershell
npm.cmd --prefix server run seed:test
npm.cmd --prefix server run seed:verify
```

Cleanup removes only records carrying that seed batch marker:

```powershell
npm.cmd --prefix server run seed:clean
```

The separate legacy `npm.cmd --prefix server run seed` command is destructive and additionally guarded. Do not use either cleanup/reset command against genuine data without reviewing the target and authorization flags.

## Quality checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:frontend
npm.cmd --prefix server test
npm.cmd run build
```

Backend JavaScript syntax can be checked without connecting to Atlas:

```powershell
Get-ChildItem server -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Safe live-verification scripts are available after Atlas access is restored:

```powershell
npm.cmd --prefix server run verify:bugfixes
npm.cmd --prefix server run verify:privacy
npm.cmd --prefix server run verify:sightings
npm.cmd --prefix server run verify:strays
npm.cmd --prefix server run verify:preferences
```

## Current milestone status

The web implementation covers the core pet, sighting, rescue, mapping, matching, communication, localization, theme, and notification workflows. Current follow-up work is:

1. Restore local Atlas access and repeat smoke/live cross-account verification.
2. Evaluate Smart Match with a labelled dataset and report ranking precision/recall.
3. Add shelter-facing aggregate reports/exports after the main regression suite remains stable.
4. Resume controlled Capacitor packaging only after the web build is frozen.

No process in this project should load or alter MongoDB's `sample_mflix` database.
