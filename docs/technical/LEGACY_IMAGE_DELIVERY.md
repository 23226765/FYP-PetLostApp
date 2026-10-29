# Protected legacy image delivery

## Scope

- Existing files, database values and `/uploads/...` URLs are preserved.
- `/uploads/...` and `/api/uploads/legacy/...` now use the same permission-checked handler; neither uses static serving.
- This is a read-only compatibility bridge. It does not upload, migrate, re-encode, delete or clean records/files.

## Reference and access policy

Owning references are `User.avatar`, `Pet.photo/photos`, `Sighting.photo`, `Stray.photo/photos` and `Message.photo`. Notification thumbnails are derivative copies and cannot establish ownership by themselves.

Every matching owning record must permit access. Lookup deliberately includes hidden/inactive records: a public pet/avatar copy cannot override a private sighting, blocked chat or hidden reference. An image shared between incompatible audiences is unavailable rather than treated as public. Missing parents, detached references, ambiguous paths and unreferenced files return the same HTTP 404.

The existing managed-image policy is reused: visible discovery photos remain public; sighting photos require the pet owner or reporter; message photos require conversation membership and an unblocked relationship. Hidden parents suppress private child images. There is no general administrator access to private conversations or a new moderation-evidence bypass.

Relative `/uploads/...` references, loopback URLs and explicitly configured CORS origins can establish local ownership. Unknown-origin URLs with matching paths conservatively restrict access but cannot establish ownership alone. This avoids trusting client Host headers or arbitrary third-party URLs. Invalid stored aliases fail closed. Supporting an additional historic production origin may require separately reviewing its configuration.

## Filesystem and response safety

- Decode once; reject dot traversal, double encoding, encoded separators, backslashes, NUL, drive paths and empty path segments.
- Permit unambiguous ASCII path segments. Non-ASCII/ambiguous historical filenames require a separate compatibility review.
- Reject symlinks/junctions, escapes outside the upload root and hard-link aliases.
- Check file identity/size before and after a bounded read. Legacy files larger than 16 MiB are unavailable.
- Detect actual raster bytes; serve only JPEG, PNG, WebP, GIF or AVIF. SVG/text/executable content is not served as an image.
- GET and HEAD use `private, no-store, max-age=0`, no ETag/Last-Modified and no 304 reuse. Authorization is reevaluated on every request.
- MongoDB reference-query failures never fall back to public delivery. Basename candidate lookup is capped at 100 owning references and fails closed if the cap is exceeded. It currently queries the five owning collections; no new index or schema is introduced.

## Frontend

Vue `ManagedImage` and Leaflet-owned image elements read legacy images through the fixed backend API with an Authorization header when signed in. Only blob object URLs reach the image element. Tokens are never placed in image URLs. Blob URLs and pending reads are cleared on session changes, removal or teardown. Ordinary external/Base64 rendering remains compatible; those sources are not secured or migrated by this batch.

## Important limitation

Previously downloaded, browser-cached, printed, screenshotted or externally copied images cannot be recalled. Old immutable cache entries may remain visible until the client discards them. New application rendering uses the protected API alias and no-store delivery, but this does not remotely erase past copies. This change also does not remove EXIF from existing image bytes.

## Verification

- `npm --prefix server test`: isolated MongoDB-reference/block mocks with real Express/JWT, temporary raster files and filesystem escape tests.
- `npm run test:frontend`: Vue, Axios and Leaflet-image loader fixtures.
- `node server/scripts/verifyManagedImagesReadOnly.js`: guarded live health/smoke/role checks, including existing local image delivery; no production initialization or database writes.
- Real MongoDB transaction tests remain separately opt-in and unrelated to this read-only delivery handler.
