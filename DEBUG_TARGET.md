# DEBUG_TARGET — Pet card image fallback

## Files
- `src/components/PetCard.vue` — pet card render.
- `server/seed.js` — image URLs (`U()` → absolute Unsplash).
- `server/controllers/petController.js` — `reportPet` allows empty `photo`.

## Why the image fails
Seed URLs are absolute (all verified 200), so there is no `/uploads` path issue. The breakage is frontend: `PetCard.vue` binds `<img :src="pet.photo">` with no `@error` handler. User-reported pets with no photo get `photo: ''` → empty `src` renders a broken icon, and its long `alt` text overlaps the "LOST" badge.

## Fix Checklist
- [ ] `PetCard.vue`: `@error` → styled placeholder (warm tint + `<AppIcon name="paw">`).
- [ ] Hide raw `alt` text on failure (keep it for screen readers only).
- [ ] Normalize URL: treat empty/relative `photo` as "no photo" → placeholder.
- [ ] Repeat the fallback in `PetDetail.vue`, `MapView.vue`, `SmartMatchScreen.vue` thumbnails.