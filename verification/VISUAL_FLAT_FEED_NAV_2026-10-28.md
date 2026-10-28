# Flat feed / navigation refinement

Continues the approved first visual batch without discarding its uncommitted work. This follow-up changes feed/navigation presentation only; earlier natural detail-photo work remains intact.

## Implemented

- White light-mode feeds/app bars and near-black (`#0a0a0a`) dark-mode feed surfaces through the existing opt-in theme tokens. Global theme defaults for unrelated screens remain unchanged.
- Edge-to-edge photo frames within the existing centred 480px column. Feed roots have no horizontal padding; headers/text/actions retain 14–16px inset. Floating post outlines, rounded card containers, gaps between cards and decorative shadows removed; posts use neutral separators.
- 4:5 portrait frames retain `object-fit: contain`, preserving complete identification content in previews. Stored files/URLs and uncropped natural detail views are unchanged. Depending on source proportions, contain framing can leave neutral space inside a full-width frame; no cropping, image transformation or new viewer was introduced.
- Compact system-font headers, readable wrapping labels, flat utility controls and clear saved states. Status labels retain their existing semantic colours and text. Existing shortened Rescue captions now have a plain View details entry to the existing full post, rather than a new workflow.
- All six navigation items remain in their existing order: Radar, Rescue, Report, Messages, Map, Profile. Flat opaque bar, neutral separator, safe-area padding, outline icons, compact wrapping labels and active underline. Report uses the same icon area as its peers, without negative margin, gradient, oversized tile or floating shadow. Unread badge and accessible names retained.
- Static neutral skeletons appear only during the existing list-loading states. They are noninteractive and `aria-hidden`; localized status text remains exposed. Map loading remains distinct. Existing reduced-motion handling extended to feed spinners; skeletons require no animation.

No Stories, Likes, Follow, gestures, navigation destinations, APIs, dependencies or new sheet workflow.

## Focused verification

**71 tests passed**, eight relevant frontend files: PetCard, StrayRescueScreen, ThemeContrast, RadarHotspots, CompactFilters, AppCreationAuth, AppNotificationFlow and ManagedImage. Covers existing actions and nested buttons, exact navigation order/active state/auth entry, filters, labels/specific animals, protected images, skeleton lifecycle and flat geometry/colour contracts. Numeric light/dark contrast assertions remain intact; the previous palette-value expectations were updated to the newly approved white/near-black values.

Vue TypeScript, ESLint, production build and `git diff --check` passed. Existing main-chunk warning remains (~791 kB). No full suites, backend tests, browser automation or screenshot capture. Actual pixel fit, system-font rendering and touch usability remain for manual screenshot review; source/style assertions and jsdom do not replace that review.

App and Rescue scripts are unchanged from HEAD (after line-ending normalization). `ManagedImage.vue`, upload composable, API service and router are unchanged. Earlier detail templates/scripts, image lifecycle and privacy work were preserved; no backend/database/provider/environment operations were run.

## Scope and Git

This follow-up touches `src/App.vue` (navigation markup sizing/CSS only), `src/style.css`, feed CSS/loading markup in RadarScreen and StrayRescueScreen, PetCard feed CSS, focused App/Rescue/Radar/theme tests, and verification documentation. Earlier dirty PetDetail/StrayDetail/locale/PetCard-test work remains, without reset or discard.

No database records, runtime environment files, original images or provider assets changed. No commit or push. Stop here for manual screenshot review before expanding visual scope.
