# PawRadar — Handover

## Tech Stack
- **Frontend:** Vue 3 (`<script setup>` + TypeScript), Vite, Axios, Leaflet; custom CSS tokens (mobile shell, max-width 480px).
- **Backend:** Node.js + Express + Mongoose, bcryptjs, jsonwebtoken, cors, dotenv.
- **DB:** MongoDB Atlas database `petlostapp`, accessed through Mongoose with GeoJSON `2dsphere` indexes.

## Endpoints (live)
- `GET /api/health`
- `GET /api/pets`, `GET /api/pets/nearby`, `GET /api/pets/:id`
- `POST /api/pets/report` (optional auth — attaches user as owner)
- `POST /api/pets/:id/sighting`, `PATCH /api/pets/:id/status`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

## Working Vue Screens
Radar (list + Leaflet map, species/radius filters), PostPet, Profile, PetDetail, PetCard, AuthScreen (login/register + guest), UserSettings (logout).
Orphaned (not wired): SmartMatch, Notifications, Poster, Chat, Onboarding, Boost, AdoptionHistory.

## MongoDB Atlas Config
The reusable connection module is `server/config/database.js`. The private `MONGODB_URI` and `JWT_SECRET` belong only in `server/.env` (gitignored); `server/.env.example` contains safe placeholders. Express starts only after a successful connection to `petlostapp` and `/api/health` performs a database ping.

## Next Task
Wire the remaining screens to the API — begin with a "My Posts" list (serve pets where `reportedBy` = current user) and connect SmartMatch to `GET /api/pets` results.
