# Cancellation repair and cross-tab browser verification

## Scope and evidence

- Browser actions performed on 26 October 2026; report completed on 27 October after an interruption. Timestamps below are UTC.
- Actual Chrome extension-controlled tabs: production/retained host `1048422313`, separate full-app account tab `1048422320`; origin `http://127.0.0.1:4179`.
- Disposable local database: `fyp_transactions_browser_0eb769b6fbbc4443aa906aef5ce27f41`.
- Actual frontend, API, authentication and MongoDB operations; provider delay/failure injected only at in-memory storage adapter. Synthetic accounts and generated coral/teal image fixtures only.
- Production UI tested separately from `/__verification/retained-upload.html`, a harness-only host mounting the actual `PostPetScreen.vue` once with its initial owner prop. The host does not reset the component or respond to account-change events; production component/composable listeners remain active.
- `ledger.json` contains API/provider events and parent snapshots. Screenshots were captured inline in browser-tool results; capture titles below identify transcript evidence, not exported screenshot files.

## Completed browser checks

### Deliberate cancellation feedback — passed

Owner filled `Cancel Fixed Fixture`, explicitly confirmed synthetic coordinates, selected coral image and posted with a 30-second adapter delay. At Uploading image 99%, clicked Cancel.

Observed exactly one alert: **Upload cancelled. Your selection is kept; retry when ready.** The previous redundant generic posting error was absent. Photo preview, name, breed, district, location, confirmed coordinates and contact input remained; retry and submit controls re-enabled.

After provider completion, clicked Retry upload, then explicitly POST LOST PET. The success heading was `Cancel Fixed Fixture is on the radar`. Parent snapshot evidence recorded one attached asset/object and one pet, with cached same-key upload retry; no automatic content submission occurred on cancellation/retry alone.

Screenshot title: **Verify cancellation now shows only intentional-cancellation feedback**.

### Production App cross-tab switch — passed

Tab A started `Production Cross Tab Fixture` upload. Without navigating tab A, used tab B Settings → Log out → reporter login. Tab A automatically left the report view and displayed reporter Traditional Chinese/dark Radar.

| Event | UTC timestamp |
|---|---|
| Upload started | 2026-10-26T11:05:14.891Z |
| Reporter login completed | 2026-10-26T11:05:17.200Z |
| Old provider upload completed | 2026-10-26T11:05:44.905Z |

After completion, tab A had zero old draft-name matches, zero old report headings, and visible Radar. No form resurrection or automatic submission occurred. Parent snapshot 3 recorded the unsubmitted asset pending under its original owner; no reporter content was created.

This is production lifecycle coverage: `App.vue` intentionally unmounts/remounts its authorization-scoped tree. It is not evidence that a production report form remains mounted after account switching.

Screenshot title: **Confirm no old form returns after cross-tab completion**.

### Retained actual component, delayed provider success — passed

Loaded the harness-only host after owner login. Its visible component mount count was `1`. Filled `Retained Success Old Draft`, selected coral image, posted, then switched tab B from owner to reporter without navigating or reloading the host.

- All old form fields and selected image cleared; alerts empty; mount count remained `1`.
- Entered `Reporter New Draft Success` into the same mounted component. Exact entry timestamp was not captured; subsequent sequential ledger inspection still showed the upload-start event only, before provider completion.
- Reporter login completed at `11:06:56.438Z`; provider finished at `11:07:24.142Z`.
- At `11:07:47.206Z`, post-completion DOM read confirmed mount count `1`, new name retained, remaining fields blank, no alerts or selected image. No automatic submission occurred.
- Initial owner prop deliberately remained unchanged in the host, making this a defensive component-integration case rather than ordinary app routing.

Screenshot title: **Verify retained component after old provider success**.

## Interrupted check: retained component, delayed provider failure

The same component (mount count still `1`) was reused for `Retained Failure Old Draft`. Started teal image upload with a delayed provider failure and switched tab B to reporter.

| Event | UTC timestamp |
|---|---|
| Upload started | 2026-10-26T11:08:47.727Z |
| Reporter login completed | 2026-10-26T11:08:50.018Z |
| DOM: mount 1, all nine text fields empty, no alerts | 2026-10-26T11:08:50.358Z |
| New marker `Reporter New Draft Failure` entered | 2026-10-26T11:08:50.431Z |
| Provider failure recorded | 2026-10-26T11:09:17.735Z |

The new marker was entered before the old provider failed, but interruption prevented the final post-failure DOM observation. On 27 October, supported Chrome inventory confirmed the old fixture tabs no longer exist; cached state could not be inspected. **Do not mark this final browser assertion passed from this run.** A fresh isolated repeat of only this failure case is needed.

Follow-up: the missing assertion was subsequently verified in fresh disposable run `cf6c850fb751472aa0622c6f4472cff6` on 27 October. See `verification/browser-integration-2026-10-27/cf6c850fb751472aa0622c6f4472cff6/BROWSER_RESULTS.md` for actual post-failure DOM, mount-count and timing evidence. This does not retroactively change the interrupted observation boundary of this run.

## Evidence boundaries and preservation

- Browser storage events trigger the actual upload abort handler. Late provider work was real within the mock adapter, but old HTTP success/failure delivery to the mounted component was not forced after transport abortion. Unit tests for delayed promise resolution/rejection complement these browser checks.
- A locator expecting English after reporter login failed because localization correctly changed the field to Traditional Chinese; a fresh accessibility snapshot was used before retrying the field interaction. No application failure resulted.
- No Atlas access, real Cloudinary upload, environment change, or application code edit was performed by these browser actions. Only approved local synthetic fixtures were mutated.
- Parent owns exact-ID cleanup/recovery and records that evidence separately. This report does not pre-claim cleanup after the interrupted process.

## Verified recovery after interruption

On 27 October the parent reopened only this run's identified local replica-set files and exact database. Collection IDs were checked against this ledger before deleting 3 synthetic users, 1 pet, 4 media assets and 1 upload-budget record. Every collection was verified empty; the recovery replica stopped and its validated temporary directory was removed. `recovery.json` preserves the final asset states and exact deleted IDs. The original incomplete harness cleanup flag remains historical; successful recovery is recorded separately. The original provider was memory-only in the terminated process, so no real provider object existed and no retrospective provider lookup is claimed.

