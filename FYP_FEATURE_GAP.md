# FYP Feature Gap — PetLost HK

## Feature Scorecard
| Requirement | Status | Files |
|---|---|---|
| 1. Centralized Lost & Sighting mgmt | Partial | `Pet.js`, `Sighting.js`, `petController.js` (species ✓, sighting log ✓; **breed/district filter ✗**) |
| 2. Chronological Location Analytics & Mapping | Fully Implemented | `MapView.vue`, `PetDetail.vue` |
| 3. Radius Alert Engine | Fully Implemented | `petController.js` `$geoNear`, `notificationController.js` |
| 4. PM & Social Verification | Fully Implemented | `Chatscreen.vue`, `ChatInboxScreen.vue`, `Sighting.js` `confirmedBy` + confirm endpoint |
| 5. Mobile Readiness (Capacitor) | Partial | `@capacitor/camera`, `geolocation.ts`, `android/` (iOS ✗) |
| 6. Stray Animal Extension | Missing | — |

## Top 3 Critical Missing Functions
1. **Stray animal extension** — Phase 5 stray reporting/mapping module (entirely unbuilt).
2. **Breed/district filtering** — refine the radar query with `breed` + `district` params.
3. **iOS build** — generate the iOS wrapper (`npx cap add ios`, needs macOS).

## Recommended Next Steps
1. **Stray module** — new `Stray` collection (or `species:'Other'` + shelter flow) + a map layer.
2. **Filtering** — add `breed`/`district` query support to `getNearbyPets` + frontend controls.
3. **iOS** — generate + sync the iOS project on a Mac.