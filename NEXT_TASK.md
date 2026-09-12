# NEXT_TASK — Wrap-up: push, iOS, deploy

## Status
All 5 roadmap milestones are complete and committed (`884a903`). No code feature remains.

## Target
Final release actions (no code changes):
- `git push` — commits `c64942e`, `884a903` are ahead of `origin/master`.
- iOS (Mac only): `npx cap add ios && npx cap sync`.
- Deploy (optional): host `dist/` + Express backend; set `VITE_API_BASE_URL`.

## Acceptance Criteria
- `origin/master` up to date; iOS project generated (on a Mac); app reachable via a public URL.

