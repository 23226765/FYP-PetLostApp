# Professor-feedback refinement and manual photo verification

Date: 12 November 2026 (Hong Kong). This report describes this bounded run, not
a new full-application audit or physical-device evaluation.

## Changes and confirmed photo causes

- Existing `fyp-demo-v1` photos/avatars are generated `placehold.co` graphics.
  They are not uploaded animal photos or evidence of a Cloudinary failure.
  No seeds or existing records were changed. Main feed/detail fallbacks now
  identify demo graphics, absent attachments and failed images separately.
- Confirmed PetCard error bug: ManagedImage renders protected API images as blob
  URLs; comparing the failed DOM URL against the original API URL prevented the
  fallback. The card now handles real protected-read/blob errors and tries only
  another actually attached source, never an unrelated animal photograph.
- Pet/rescue detail photos can use an attached `photos` entry when `photo` is
  empty or a demo graphic. Profiles, settings and rescue author/comment avatars
  use initials or a generic icon when no usable avatar exists.
- Area Insights promotes Reports in view / New reports in past 7 days, displays
  labeled animal count bars, keeps the actual leading district/tie summary and
  puts longer qualifications under View details. No API/statistic changed.
- Radar/Saved cards distinguish viewing history from reporting a sighting.
  Existing sighting entries show permitted time/area/note. Rescue feed/detail
  distinguish View comments and Write a comment using the existing thread and
  composer. No general pet comments or per-card count requests were added.
- Shared light/dark tokens and en / zh-HK / zh-CN strings are retained. Smart
  Match scoring, UI and the entire offline evaluation kit are unchanged.

## Authorized real-provider/manual run

- Harness: `server/scripts/manualPhotoVerificationHarness.js`; actual application
  controllers, authentication, validation, Sharp, transactions and image-delivery
  authorization. Cloudinary was real; only storage-factory/configuration tracking
  was substituted. No business logic or authorization was mocked in this run.
- Database: `fyp_transactions_browser_bfd1406ee2c04285a5fc8e57d97d593f`, in an owned
  disposable loopback MongoDB 8.0.17 replica set. Health returned HTTP 200,
  connected/isolated before user submissions. Initial counts: zero pets/assets.
  Atlas, `petlostapp` and `sample_mflix` were never connected or accessed.
- Cloudinary Admin usage confirmed **Free**, 0.19 / 25 credits used (24.81
  remaining) before startup. Usage is periodically updated, not an instantaneous
  quota reservation. No billing/plan change occurred.
- A hard single-attempt guard consumed its slot synchronously before provider
  preflight/ledger awaits. No second upload was attempted or authorized.
- The user performed UI clicks. No browser automation was used.
- Storage-harness safety work used a real delegated specialist task with explicit
  `gpt-6-astra` / high settings and completion evidence from the collaboration
  tool. Standalone specialist instructions were supplied manually; this does not
  claim automatic named-agent loading or a change to the parent-session model.

| Stage | Actual evidence |
| --- | --- |
| Select | Local fixture `public/test-photos/dog.jpg`; fictional report name entered by the user: `Fictional photo verification dog`. A preview alone was not counted as a pass. |
| Upload | `POST /api/uploads/managed` returned 201; provider upload attempts = **1**. |
| Process/store | Processed dog checksum matches the exact upload ledger. Output: **800 x 533**, WebP, **17,834 bytes**. This processing was also reproduced offline without another upload. |
| Save/attach | `POST /api/pets/report` returned 201. Pet `6af5a12f8852c71e63bcc46d` referenced MediaAsset `6af5a12e8852c71e63bcc462`; retained `attachedTo` links that same pet. |
| Delivery | Two successful 200 reads at `/api/uploads/managed/6af5a12e8852c71e63bcc462/content`; provider read starts = 2. |
| Refresh/reopen | The user explicitly confirmed the photo remained visible after refreshing and reopening through Profile → My pets, before removal. This is human-reported observation corroborated by API/provider reads, not automated visual inspection. |
| Remove | `PATCH /api/uploads/managed/content/pet/6af5a12f8852c71e63bcc46d` returned 200. Snapshot showed empty pet `imageIds`, asset state `deleted`, and exact provider absence confirmed. |

Cloudinary object identity (not a credential or signed URL):

```text
petlostapp/test/bfd1406ee2c04285a5fc8e57d97d593f/pets/d0bc5379-1ef1-4b39-9937-04fdaaa2dbd4
```

It was an **authenticated** Cloudinary image. The public-ID prefix is not a
guarantee of the Media Library's physical folder display in every folder mode.
Provider asset ID was recorded locally in the exact cleanup ledger. Provider
URLs, signatures, API credentials, JWTs and password hashes are not reproduced.

MongoDB stores the MediaAsset metadata (provider, private public/provider IDs and
provider URL, dimensions, format, bytes/checksum, uploader/purpose/state/target)
and the Pet's image ID references, not image bytes or a new local-upload file.
Production validation requires stored metadata to match the processed image.
The safe application image URL resolves through permission checks; the backend
fetches authenticated Cloudinary bytes, then the frontend displays a temporary
blob URL. No signed Cloudinary link is sent to the frontend. A fresh reopened
report re-fetches bytes from the saved image reference rather than relying on
the initial local preview.

## Exact cleanup

The user removed the image in the application. `deleteSource` is `application`;
teardown subsequently confirmed absence with exact provider lookups rather than
deleting another asset. The ledger records one object and `absentConfirmed=true`,
no collision/ambiguity/recovery requirement, and `cleanupComplete=true`.

Teardown removed only enumerated IDs in this run's already-verified empty-at-start
disposable database: **one pet, one MediaAsset, one user, one MediaUploadBudget**.
Other application collections contained zero records. Counts were checked zero
after exact-ID removal. The owned replica was stopped; frontend/backend closed,
harness process exited zero, and port 4181 health/status URLs were unreachable.
No original uploads, existing Cloudinary objects, Atlas records or runtime `.env`
files changed. No seed, migration or live bulk-cleanup script ran.

## Automated verification and limits

- Final focused frontend run: **210 tests / 14 files passed**, covering photo
  fallbacks, protected image rendering/session clearing, avatar initials,
  localized Insights/counts/disclosures, sighting/comment actions, Saved routing,
  auth gates, and existing Map resize/query guards.
- Backend: **74 distinct targeted tests passed** across manual harness safety,
  legacy/managed access, image processing, storage adapter and lifecycle suites.
  Providers/persistence are mocked in those tests; real temporary filesystem and
  Sharp processing checks are identified by their suites. These test counts are
  separate from the real provider/local MongoDB/manual run above.
- Vue TypeScript, frontend and targeted harness ESLint, backend script syntax,
  production build, diff checks and changed-source secret-pattern checks passed.
  Existing >500kB bundle warning remains; no dependency was added/upgraded.
- The real browser console reported existing non-blocking email-placeholder i18n
  linked-format warnings and a missing Capacitor web camera modal. The browser
  file-input fallback worked, and the upload/save/reopen/removal completed. These
  warnings were not treated as provider failures or expanded into an unrelated
  authentication/native-dependency repair.
- All three locales and permissions have focused automated coverage where
  relevant. Shared semantic theme tokens were preserved; rendered light/dark
  appearance was not automatically verified. Bar appearance, mobile layout,
  touch comfort and all physical-device/native-camera behavior remain human
  visual/device checks. No participant study or matching effectiveness is claimed.

## Photo attribution and safe reproduction

Both local dog/cat copies are CC0; creator, source, licence, transformations and
hashes are in [photo attribution](../../../public/test-photos/ATTRIBUTION.md).
They are explicit fictional fixtures only, never automatic substitutes for
missing photos on existing reports.

From the Windows VS Code project terminal, these checks do not upload anything:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The temporary app URL is stopped and the synthetic account no longer exists.
Do not restart a real-provider test or upload again without a new scoped approval.
Optional visual spot-checks in the ordinary app: Insights counts/bars/details;
View sightings versus Report a sighting; Rescue View comments versus Write a
comment. No broad browser review is required.
