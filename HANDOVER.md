# PawRadar — Current Handover

## Current milestone

PawRadar is a mobile-first Vue web application backed by an Express REST API and MongoDB Atlas. The web feature set is integrated; native packaging remains secondary. The immediate operational blocker is Atlas connectivity in the local environment, not an identified application-code defect.

## Stack

- Frontend: Vue 3.5, Composition API with `<script setup lang="ts">`, Vue Router, Axios, Vite, Vue I18n.
- Maps: Leaflet, marker clustering, and `leaflet.heat`.
- Device APIs: Capacitor core, camera, geolocation, Android, and iOS packages.
- Backend: Node.js, Express 4, Mongoose 8, JWT, bcryptjs, CORS, dotenv.
- Database: MongoDB Atlas database `petlostapp`; GeoJSON coordinates are always `[longitude, latitude]`.

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
