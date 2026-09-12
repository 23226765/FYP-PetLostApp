# NEXT_TASK — Final Cleanup & Commit

## Milestone & Target Feature
All 5 milestones and every feature are complete. Remaining work is consolidation: delete the redundant `OnboardingScreen.vue` (superseded by `AuthScreen.vue`) and commit the uncommitted chat + sighting-photo work.

## Files to Modify
- `src/components/OnboardingScreen.vue` (delete)
- commit all pending changes

## Implementation Spec
- Delete `OnboardingScreen.vue` — it is unreferenced (only self-referenced) and duplicates `AuthScreen.vue`.
- Verify no imports: `grep -r "OnboardingScreen" src` → only its own file.
- Commit: `git add -A && git commit -m "feat: chat + sighting photos; remove onboarding"`.

## Acceptance Criteria
- `OnboardingScreen.vue` removed; working tree clean.
- `npx vue-tsc --noEmit` and `npm run build` pass; no console errors.