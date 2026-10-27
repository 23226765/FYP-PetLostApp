# Retained-component delayed-failure verification — passed

## Scope

- Repeated only the final delayed-failure browser observation interrupted in run `0eb769b6fbbc4443aa906aef5ce27f41`. Did not repeat the earlier completed journeys.
- Date: 27 October 2026. Timestamps below are UTC.
- Actual Chrome extension automation: full-app tab `1048422528`; retained-host tab `1048422529`; origin `http://127.0.0.1:4179`.
- Disposable local replica-set database: `fyp_transactions_browser_cf6c850fb751472aa0622c6f4472cff6`.
- Real frontend, authentication, API routes, authorization and MongoDB operations. Only the storage adapter was mocked, with one deliberately delayed provider failure.
- Synthetic owner/reporter accounts and current-run generated `teal.png` only. No Atlas, real Cloudinary, runtime environment or application-source changes by browser verification.

## Procedure and observed results

1. Signed in as synthetic owner in full app tab B and opened Settings.
2. Opened `/__verification/retained-upload.html` in tab A. The test-only host mounted the actual `PostPetScreen.vue` once with an initial owner prop. Visible mount count was `1`.
3. Entered `Retained Failure Final Fixture`, a synthetic location/contact, confirmed longitude 114.183 / latitude 22.303 and selected the generated teal image.
4. With parent-controlled 30-second delay plus fail-next-upload armed, clicked POST LOST PET. Observed Uploading image 99%, Cancel, and disabled POSTING.
5. Without navigating/reloading tab A, used real tab B Settings → Log out → reporter login.
6. Tab A remained mounted (`1`), cleared all nine text fields and old image, and displayed no alerts. Its interface reacted to reporter Traditional Chinese/dark preferences.
7. Entered `Reporter retained final marker` in the same component after the switch, without submitting it.
8. After the old provider failure was recorded, read the actual DOM and captured a screenshot. Mount count was still `1`; the new marker remained; all other fields were empty; no error/success alert or old image appeared; submit was enabled. A specific `.photo-preview` query returned `0` (generic image elements were Leaflet map tiles).
9. Logged reporter out through the full app UI and confirmed `/login`. Only the two created local test tabs were closed afterward; unrelated user tabs were not interacted with.

## Timing evidence

| Event | Timestamp (UTC) |
|---|---|
| Owner upload started (ledger) | 2026-10-27T12:20:45.347Z |
| Reporter login HTTP 200 completed (ledger) | 2026-10-27T12:20:47.090Z |
| Mounted component cleared, no alerts (browser DOM) | 2026-10-27T12:20:47.747Z |
| New reporter marker entered (browser action timestamp) | 2026-10-27T12:20:47.813Z |
| Old provider upload failed (ledger) | 2026-10-27T12:21:15.349Z |
| Final unchanged DOM observed (browser) | 2026-10-27T12:21:33.848Z |

The replacement login preceded failure by **28.259 seconds**, and the new draft marker preceded failure by **27.536 seconds**. The final DOM observation was **18.499 seconds after** the failure.

## Evidence and limits

- Browser screenshot was displayed inline under tool title **Final proof: late provider failure does not alter the retained form**. No screenshot file/export path was provided by the browser tool; this report does not invent one.
- `ledger.json` provides the API/provider chronology and parent database snapshots. The relevant synthetic asset ID is `6ae0971d53b8ddb724b92b93`.
- This is retained **production-component integration**, not ordinary full-app routing. The test host intentionally retains the initial owner prop and does not remount or clear state itself; actual component/session listeners provide clearing and cancellation. The earlier full-App cross-tab unmount check remains separately documented in the previous run report.
- The actual account-change handler aborts transport. This proves the retained component remains safe while old provider work finishes/fails; it does not claim an old HTTP response was forced through an aborted transport. Delayed resolved/rejected-promise unit tests supply complementary coverage.
- Only one failed upload was initiated; no new pet report was submitted successfully in this run. Parent owns database/provider assertions and exact-ID teardown; see its final ledger/cleanup evidence rather than treating browser observations as cleanup proof.

## Final database and cleanup verification

Parent snapshot 2 recorded zero pets, unchanged empty avatars, and exactly one asset under its original owner in state `deleted` with `IMAGE_STORAGE_UNAVAILABLE`. No asset was attached to the replacement account. The harness then exited 0 after exact teardown: 3 synthetic users, 1 media record and 1 upload-budget record removed; all collections asserted empty; zero in-memory provider objects; owned replica stopped. `cleanupComplete: true` is in `ledger.json`, and the isolated frontend/API was independently unreachable.

`node verify-followup.mjs` passed read-only assertions over this run and the prior run's recovery evidence. The prior run's identified local files were separately recovered and cleaned by exact ledger IDs; its original incomplete teardown flag was not overwritten. No Atlas or real provider operation occurred.

Final syntax/diff checks passed. A local-credential and generic-secret scan of 346 worktree files and 338 index files returned zero findings, with only precisely reviewed fictional test URI exceptions. No additional application/configuration/package changes were made during this resume; no commit or push was issued.

