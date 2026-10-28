# Radar / Rescue visual redesign — first batch

The subsequent approved flat feed/navigation refinement supersedes the rounded-card/4:3 feed styling below; see [the follow-up report](VISUAL_FLAT_FEED_NAV_2026-10-28.md). This report retains the earlier implementation and verification history. Natural detail-photo and lifecycle-preservation work remains applicable.

## Implemented scope

- Existing theme extended with opt-in `.feed-theme` overrides on Radar and Rescue only: neutral light canvas, white cards, charcoal dark surfaces, retained teal/coral semantics and stronger visible focus. Legacy global canvas/font/colour values remain unchanged.
- System font stack with Traditional/Simplified Chinese fallbacks; consistent feed spacing, 16px cards, quieter shadows and readable metadata/status labels.
- Radar uses `PetCard`'s explicit `feed` presentation. Header/name/status, uncropped 4:3 photo, district/existing approximate distance, last seen/reward and sighting/Save actions. Status/buttons no longer cover the animal photo. Default `feed: false` preserves the existing Saved-card presentation.
- Rescue retains author/time/district/status, uncropped 4:3 horizontally scrolling photos, Comment/Save/Share, specific animal type, condition, caption and comment preview/count. Condition and photo-position labels moved out of the photo. Multi-photo regions have keyboard focus and localized instructions.
- Pet and Rescue detail photos use natural image proportions. Pet detail toolbar space is reserved above the image and the sheet no longer overlaps its bottom. No lightbox or new photo viewer.
- Public distance labels reuse existing supplied values; approximate values are labelled, unavailable ones omitted. Radar never substitutes a precise location string for a missing district. No coordinates are calculated or fetched by this redesign.

## Preservation evidence

`ManagedImage.vue`, `useImageUpload.ts` and `services/api.ts` are byte-for-byte unchanged from HEAD. PetDetail/StrayDetail templates and scripts are unchanged after normalizing line endings; their changes are CSS only. Rescue's script is unchanged. Original handlers, routing, filters, permission guards, protected delivery, upload lifecycle, saves and in-app sharing remain in place. No App/navigation, backend, model, API, dependency, environment or provider changes.

The scoped feed token aliases are rebound locally so inherited legacy aliases resolve to the neutral palette. Other screens and default Saved cards do not acquire the feed theme. Existing avatars retain normal circular cover styling; only pet/rescue photographs use the uncropped treatment.

## Focused verification

- **59 tests passed**, eight frontend files: PetCard, StrayRescueScreen, ThemeContrast, PetDetail, StrayDetailScreen, ManagedImage, CompactFilters and RadarHotspots.
- Final small typography/icon refinements: **22 tests passed**, the three directly affected card/theme files. No full suites or backend tests rerun.
- A final cascade correction ensures opt-in feed radius/press styling and segmented-control weights take precedence over retained legacy selectors; the **15 directly affected card/theme tests passed** afterward, followed by lint/build/diff checks.
- Vue TypeScript, ESLint and production build passed. Existing main-chunk size warning remains (about 790 kB).
- Numeric light/dark checks cover primary/secondary text, selected surfaces, focus/accent visibility and soft coral/teal badge contrast. Source contracts check theme opt-in, contain framing, natural detail image height and removal of the sheet overlap. These are not browser/pixel verification.
- Component interactions cover card click/Enter, nested sighting/Save buttons, persisted local Save state, Comment/Share routing, multi-photo focus region, specific animal labels and three locale labels. Existing image-delivery, ownership and filtering regressions passed.
- An initial image fallback test stub did not forward its native error event; correcting the stub preserved the intended assertion without altering image lifecycle code.

No browser automation or screenshot capture was performed. Visual fit, actual platform fonts and touch scrolling remain for the user's screenshot review. CSS displays the entire supplied image; it cannot restore details already absent from a historical source image.

## Changed files

`src/style.css`; `src/components/PetCard.vue`, `RadarScreen.vue`, `StrayRescueScreen.vue`, `PetDetail.vue`; `src/views/StrayDetailScreen.vue`; three locale JSON files; existing StrayRescueScreen/ThemeContrast tests; new PetCard tests; this report.

No live database records, runtime environment files, original images or provider assets changed. No new dependencies, APIs or features. All edits remain uncommitted; nothing pushed. Work stops at this first visual batch pending screenshot review.
