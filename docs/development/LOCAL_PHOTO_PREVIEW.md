# Disposable local photo preview (Windows)

This preview creates **fictional records in a new local disposable MongoDB replica
set**. It never loads runtime `.env`, connects to Atlas, uploads to Cloudinary,
changes existing provider assets or runs the application seed/migration scripts.
The production scoring, API policies and Smart Match evaluation kit are unchanged.

## Open it from VS Code

In a PowerShell terminal at the project root, using the existing installed Node
22.20+ and npm dependencies:

```powershell
node --experimental-test-module-mocks server/scripts/localPhotoPreview.js --local-only
```

Wait for `"ready":true`, then open **http://127.0.0.1:4182**. Choose **Continue as
guest** to browse, or use the fictional viewer login in the per-run README path
printed by the command. You do not need `npm start`, another Vite process, Atlas
credentials or a provider key. Port 4182 must be free.

- **Radar:** `FICTIONAL Preview Dog` and `FICTIONAL Preview Cat`; open either card
  for its existing pet detail. Use View sightings on the dog for the compact
  timeline. The viewer account can see its permitted note/photo; guests receive
  only public approximate history information.
- **Rescue:** two clearly fictional dog/cat posts, with locally attached photos;
  open a card for its existing detail/comments. The dog has one fictional comment;
  the cat's thread is empty. No general comments are added to lost-pet posts.
- **Map:** two eligible pet reports; Area Insights opens on demand. Its counts
  still use the existing viewport API, not rescue/sighting totals.

The sample reports belong to a separate fictional creator so the viewer's Radar
does not accidentally exclude them under the real ownership rule. Signing in as
the creator deliberately excludes their own pets from Radar; their My pets still
opens them. Synthetic accounts exist only for this run and are removed on stop.

## Photo and location boundaries

The JPEGs already licensed and recorded in
[photo attribution](../../public/test-photos/ATTRIBUTION.md) are stored explicitly
in each fixture's `photo` and `photos` fields as same-origin URLs:

```text
http://127.0.0.1:4182/test-photos/dog.jpg
http://127.0.0.1:4182/test-photos/cat.jpg
```

They are not inserted into unrelated records or used as fallback photographs.
Ordinary image write/validation and delivery permissions are not relaxed. This
preview uses existing legacy URL fields for its explicitly fictional records;
it does not claim another managed-image upload verification or private-binary
delivery test. Uploads and hosted AI are disabled. A storage factory call fails
closed, real Cloudinary imports are blocked, and backend fetches accept only
loopback HTTP URLs.

Device geolocation is disabled **only by preview response headers**, so existing
fallback locations make the sample feeds predictable: pets near Wan Chai, rescues
near Yau Tsim Mong. The records are not real sightings. OpenStreetMap background
tiles still use the ordinary free tile service and require internet; local photos
do not. CSP blocks external photo/AI/storage domains while permitting OSM tiles.
No production permissions policy/CSP or runtime settings file is edited.

## Stop and remove this run

In the same terminal type `stop` and Enter, or press **Ctrl+C** once. Wait for
`"cleanupComplete":true`. The harness closes its frontend/backend, drains active
route work, removes exact enumerated IDs only from its verified disposable
database, stops the owned replica and records results under
`verification/local-photo-preview/<run>/ledger.json`.

Do not kill unrelated Node/MongoDB processes or run seed/cleanup commands. If
startup fails, the same teardown runs; preserve the ledger if cleanup is reported
incomplete. Every launch creates a new run; sample changes are intentionally not
persistent. Existing Atlas records, original upload files, provider objects and
runtime environment files are never cleanup targets.

For a self-check that starts and stops automatically without browser automation:

```powershell
node --experimental-test-module-mocks server/scripts/localPhotoPreview.js --local-only --verify-and-stop
```

The check verifies actual local health, login, two Radar/two Rescue records,
their detail photo references, allowed versus public sighting fields, and JPEG
byte delivery through the local frontend. It verifies no storage/provider calls
occurred and confirms teardown. It is API/database/HTTP evidence, not visual or
physical-device verification. The cached MongoDB 8.0.17 binary is required; an
absent cache fails instead of downloading or switching to Atlas.
