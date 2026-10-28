# Main-screen visual consistency pass — 28 October 2026

## Scope

Presentation-only continuation of the two existing, uncommitted feed/navigation batches. No browser automation, backend/API changes, dependencies, image transformations, database access, uploads or environment changes.

## Changes in this pass

- `src/style.css`: promote the existing neutral feed palette and system/Chinese font stack to the existing root theme; remove the competing feed palette; share page-title, padding and form-radius tokens. Option-card colours reference the same semantic palette. Keep form boundaries, selected treatments and focus indicators.
- `src/App.vue`: the selected nav state already had a 2px underline and no rectangular border. The rectangle visible in the screenshots matches the former 3px inset `:focus-visible` outline. Replace that with a 2px, rounded inset keyboard-focus indicator; preserve all six destinations and handlers. This diagnosis is from source inspection, not a new browser run.
- `PetCard.vue`, `StrayRescueScreen.vue`: natural feed-image height, `object-fit: contain`, maximum height 640px for unusually tall media, compact 128px fallback. Carousel access and complete detail photos remain available. Existing files and protected image loading are unchanged.
- `ChatInboxScreen.vue`, `Chatscreen.vue`: neutral headers, consistent title/search typography, flatter conversation rows and semantic control colours. Keep unread, search, refresh and thread behaviour.
- `ProfileScreen.vue`, `profile/MyPetsTab.vue`, `profile/ProfileContentTabs.vue`, `profile/ProfileStrayCard.vue`: compact avatar/identity grid, separated statistics, flatter rows, wrapping tab labels. Remove obsolete parent-scoped pet-row CSS now owned by the child component.
- `PostPetScreen.vue`, `SightingLocationPicker.vue`: common form boundaries, padding and focus styling; distinguish the last-seen description/landmark input from map confirmation. GPS remains optional. Change the shared confirmation label to the context-neutral “Confirmed map location”.
- `MapScreen.vue`, `AreaInsightsCard.vue`: shared heading hierarchy, flatter insight section and larger metadata. Keep all existing metrics, disclosures, tie disclosure, loading/error states and viewport scope.
- `SavedScreen.vue`, `SettingsScreen.vue`, `PetDetail.vue`, `StrayDetailScreen.vue`, `MapView.vue`: remove obvious cream headers, excess elevation or competing rounded post containers; retain useful form/management grouping and natural detail images.
- `en.json`, `zh-HK.json`, `zh-CN.json`: localized description/map labels and placeholders; English singular/plural rescue/comment, tied-district and sparse-sample wording.

All 17 component script blocks inspected in this pass match HEAD after line-ending normalization. PetCard's opt-in feed prop belongs to the preceding batch; its script was not changed in this pass. API clients, stores, routing, permission logic and image-loading code were not edited.

## Verification

Focused Vitest selection: 13 files, 170 unique tests passed after correcting an accidentally encoded separator caught by the new Area Insights test. The first run passed 169 tests and failed that new wording assertion; the affected 8-test file passed on its corrective rerun. No unrelated full suite was repeated.

Files tested:

- PetCard, StrayRescueScreen, ThemeContrast, ProfileScreen.
- PostPetImages, SightingLocationPicker, AreaInsightsCard.
- MessagingState, AppCreationAuth, ManagedImage.
- SettingsScreen, SavedScreen, MapScreen.

Coverage includes nested actions versus card navigation, keyboard entry/tab behaviour, three-language labels, report-coordinate confirmation and preserved input/retry behaviour, protected image handling, saved/profile controls, retained Map requests/pagination, singular/plural wording and numerical light/dark token contrast. These are component/mock and stylesheet-contract checks, not actual browser layout measurements.

- `npm run typecheck`: passed.
- `npm run lint`: passed, zero warnings.
- `npm run build`: passed. Existing large-main-chunk warning remains (approximately 792 kB minified); no dependency or chunking change in this visual task.
- `git diff --check`: passed; Git emits its normal LF-to-CRLF conversion notices.
- Changed-line secret-pattern check: passed, with no secret values printed.

Visual proportions, real focus appearance, wrapping and perceived usability remain for the user's screenshot review. No browser/device verification is claimed. No servers were started and no database/provider operations ran. No commit or push.

## Optional screenshot review

1. Compare Radar/Rescue landscape photos and missing-photo fallbacks; open a detail page to check the complete image.
2. Compare Profile, Messages, Report, Map, Saved and Settings in light/dark mode; check one Chinese locale for wrapping.
3. Tab through bottom navigation and form controls; compare the keyboard-focus indicator with the selected nav underline.
