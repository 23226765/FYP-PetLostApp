# Focused workflow repairs — 29 October 2026

Approved scope: privacy/preferences, Hong Kong rescue timestamps and unavailable distances. No new features or backend changes. Stable additional finding IDs are **BROW-PREF-01**, **BROW-TIME-01**, **BROW-DIST-01**; original findings 1–22 retain their numbering and meaning.

## Reproduction before implementation

Added assertions to existing SettingsScreen, StrayRescueScreen and PetDetail tests, then ran only those three files with `TZ=America/New_York`. Result: **8 failed, 29 passed**.

- Privacy save restored `en` instead of the current `zh-HK` preference by emitting stale full-user preferences through App's existing full-user update path.
- At `2026-10-29T20:30:00Z`, the rescue input showed `2026-10-29T20:30` instead of Hong Kong's next-day `2026-10-30T04:30`.
- The complete distance badge/icon remained present for undefined, null, NaN, Infinity, negative and string distances.

These were mounted-component reproductions with API mocks, not live account/database changes.

## Repairs and invariants

### BROW-PREF-01

Settings emits an explicit privacy-only patch with its initiating user ID. App validates that ID and merges only privacy into the current User. It neither reapplies stale preferences nor reloads unrelated feeds or resets chat/poster state. Profile/avatar events keep their existing separate path.

Settings captures session generation/token, account ID/epoch, request sequence and component lifetime for privacy load/save and appearance feedback. All success, error and finally branches check that identity. Account/session changes clear obsolete flags/messages; fresh props are required before resuming controls. Same-account prop updates preserve pending operations. The existing preference composable continues to own appearance persistence and rollback, without interference from privacy saves.

### BROW-TIME-01

Shared helpers convert stored instants to/from Hong Kong civil inputs with the IANA `Asia/Hong_Kong` zone, without reading the host timezone, stripping UTC strings, or assuming a fixed offset. Input conversion preserves seconds and milliseconds. Invalid civil dates and future observations fail before upload using existing localized `OBSERVED_TIME_INVALID` feedback; drafts stay intact.

The input maximum refreshes when opening the form. Observation labels explicitly state Hong Kong time in English/Traditional/Simplified Chinese. Rescue detail formatting uses the same zone and leaves the stored ISO timestamp intact. There is no existing observation-time edit control to expand: the caption editor still omits `observedAt`, and tests verify caption save preserves that instant. Helper tests additionally load, modify and serialize civil inputs across date/year boundaries.

### BROW-DIST-01

One non-coercing predicate accepts only finite numeric distances >= 0. Detail/default cards, feed cards, rescue feed, notification toast and existing pet-map popups omit invalid values and their distance-only icons/separators. Legitimate zero and explicit approximate labels remain. No coordinates, distance calculation, backend projections, permissions, filters or image behavior change.

## Automated evidence

**290 distinct relevant tests across 13 selected files passed**, combining the targeted run and affected-file corrective reruns. No full frontend/backend suite was run.

```powershell
$env:TZ='America/New_York'
npm.cmd run test:frontend -- src/views/__tests__/SettingsScreen.test.ts src/views/__tests__/StrayDetailScreen.test.ts src/components/__tests__/AppCreationAuth.test.ts src/components/__tests__/StrayRescueScreen.test.ts src/components/__tests__/PetDetail.test.ts src/components/__tests__/PetCard.test.ts src/components/__tests__/MapView.test.ts src/components/__tests__/CompactFilters.test.ts src/utils/__tests__/hongKongDateTime.test.ts src/utils/__tests__/distance.test.ts src/composables/__tests__/usePreferences.test.ts src/services/__tests__/apiAuthContext.test.ts src/i18n/__tests__/formatters.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

The timezone setting above is a child shell/process override only; no runtime environment file was read or changed.

- Settings and App: current/newer/pending preference state, privacy failures retaining drafts, old load/save success/failure, replacement busy flags, logout, same-token invalidation, A→B→A and unmount. App rejects mismatched-account privacy events and preserves unrelated user fields/feed requests.
- Rescue: exact ISO submission across the year boundary with milliseconds; next-day default/maximum; invalid/future times retain the draft/photo and perform no upload/submission; caption changes leave observation timestamps untouched. All three locales render the stored instant explicitly in Hong Kong time.
- Date helpers run in **actual Node subprocesses** with `TZ=America/New_York`, `UTC` and `Asia/Hong_Kong`. Each process asserts its resolved timezone, then produces the same input and round-trip ISO instant. This is real timezone/runtime verification, not database or physical-device verification.
- Distances: missing, null, NaN, infinity, negative/string values, zero, exact/approximate wording, feed/default card separators and all-three-locale detail labels. Existing Map, preference and protected-request attribution regressions remain passing.
- TypeScript and ESLint passed. Build passed with the existing main-chunk warning (approximately 795 kB minified).
- Diff/changed-file secret-pattern checks passed; original 22 finding headings remain identical. No secret values printed.

Two test-authoring issues were corrected without weakening assertions: Vitest rewrote `import.meta.url` to HTTP in jsdom, so actual child imports now use an explicit local `file:` URL; and an earlier CompactFilters assertion used VTU `get().exists()`, which TypeScript disallows, so it now uses `find().exists()`. An added invalid-time regression also exposed generic UI error translation; using the existing stable error code corrected the application feedback and the affected rescue suite passed.

The specialist was invoked through the supported `fyp_architect` runtime role, whose exposed tool definition fixes Astra/high. It completed read-only design and implementation reviews, reporting no remaining concrete scoped privacy defect. This does not claim automatic loading of a standalone configuration, a parent-model switch or independent test execution by the reviewer.

## Changed files and safety

- Application: App; SettingsScreen; StrayRescueScreen; StrayDetailScreen; PetDetail; PetCard; MapView; i18n formatters; new `utils/hongKongDateTime.ts` and `utils/distance.ts`.
- Copy: existing observation labels in the three base locales and two Chinese supplemental locale files.
- Tests: SettingsScreen, StrayDetailScreen, AppCreationAuth, StrayRescueScreen, PetDetail, PetCard; the CompactFilters fixture typing correction; new date and distance helper tests.
- Documentation: AUDIT_FINDINGS_CHECKLIST and this report.

No database/provider/browser operations, schema/index/API changes, image transformations, environment/package/lockfile changes, migrations, seeds or cleanup. Existing timestamps and other stored records remain unchanged. Build output is ignored generated output. No commit or push.

## Remaining limits

No live API, actual browser, mobile-device or Cloudinary verification occurred. Request races use mounted components with deferred mocked promises and existing Axios interceptor tests with mocked transport. They do not prove every native cross-tab scheduling pattern. Historical timestamps that were already stored incorrectly are not guessed or rewritten. Other browser findings, dependency advisories and deployment/evaluation work remain outside this repair batch.

Optional visual checks: save privacy after choosing another theme/language; enter a Hong Kong observation time and compare its detail display; compare a direct pet detail without distance with a legitimate zero-distance result.
