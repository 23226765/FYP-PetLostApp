# NEXT_TASK — Wire Adoption History & Boost screens

## Milestone & Target Feature
All 5 milestones + notifications are done. Two screens remain dead code: `AdoptionHistoryScreen` (Activity) and `BoostScreen`. Wire them into navigation and populate Activity with the user's real reported pets.

## Files to Modify
- `src/components/ProfileScreen.vue`
- `src/App.vue`
- `src/components/AdoptionHistoryScreen.vue`

## Implementation Spec
- `ProfileScreen.vue`: add emits `open-activity`, `open-boost`; add "Activity" and "Boost alert" rows to the Settings list that emit them.
- `App.vue`: import both screens; add `showActivity`, `showBoost` refs; render each in `<Transition name="page">` with `@close`/`@back` handlers.
- `AdoptionHistoryScreen.vue`: on mount call `getMyPets()` (import from `../services/api`); map each `Pet` → a `HistoryEntry` (`petName`, `breed`, `petPhoto`, `location`, `dateAgo: postedAgo`, `type:'post'`, `outcome: status`, `note: description`) and replace the hardcoded `entries`.

## Acceptance Criteria
- Profile → "Activity" lists the user's real posts; "Boost alert" opens the Boost screen; both close via back.
- `npx vue-tsc --noEmit` and `npm run build` pass; no console errors.