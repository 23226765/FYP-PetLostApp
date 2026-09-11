# PawRadar — Handover

## Tech Stack
- **Frontend:** Vue 3 (`<script setup>` + TypeScript), Vite, Axios, Leaflet; custom CSS tokens (mobile shell, max-width 480px).
- **Backend:** Node.js + Express + Mongoose, bcryptjs, jsonwebtoken, cors, dotenv.
- **DB:** Azure Cosmos DB (MongoDB API) with GeoJSON `2dsphere`.

## Endpoints (live)
- `GET /api/health`
- `GET /api/pets`, `GET /api/pets/nearby`, `GET /api/pets/:id`
- `POST /api/pets/report` (optional auth — attaches user as owner)
- `POST /api/pets/:id/sighting`, `PATCH /api/pets/:id/status`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

## Working Vue Screens
Radar (list + Leaflet map, species/radius filters), PostPet, Profile, PetDetail, PetCard, AuthScreen (login/register + guest), UserSettings (logout).
Orphaned (not wired): SmartMatch, Notifications, Poster, Chat, Onboarding, Boost, AdoptionHistory.

## Cosmos DB Config
Connected. DB `pawradar`; collections `pets` (12 seeded), `sightings`, `users`. Connection string + `JWT_SECRET` live in `server/.env` (gitignored).

## Next Task
Wire the remaining screens to the API — begin with a "My Posts" list (serve pets where `reportedBy` = current user) and connect SmartMatch to `GET /api/pets` results.