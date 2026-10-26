# Controlled upload cancellation, retry and account-switch verification

- Date: 26 October 2026 (Hong Kong); event timestamps below are UTC.
- Local frontend: `http://127.0.0.1:4179`; Chrome extension-controlled existing tab `1048422313`.
- Disposable replica-set database: `fyp_transactions_browser_73ce3fb9e2f84728beac5d9e1de6bfd5`.
- Actual Vue UI, Express routes, authorization and MongoDB operations; only image-storage provider mocked. Generated `coral.png` and `teal.png` fixtures only. No real provider upload or Atlas access by these browser actions.
- Synthetic owner used English/light; synthetic reporter used Traditional Chinese/dark. Desktop viewport with existing mobile-width shell. This supplemental run did not repeat all earlier mobile/locale journeys.
- Evidence: this report, `ledger.json` request/provider events and numbered snapshots, and inline browser-tool screenshots listed below. Screenshots were displayed in the tool transcript; no durable screenshot path/export was exposed, so this report does not claim screenshot files exist.

## Results

### 1. Active cancellation and retry — passed

1. Owner opened Report and filled `Active Cancel Fixture`, a synthetic breed/location/contact number, explicitly confirmed latitude 22.30 / longitude 114.18, and selected coral image.
2. With a 30-second provider delay, clicked POST LOST PET. UI showed Uploading image… 99%, Cancel, and disabled POSTING.
3. Clicked Cancel while upload was active. UI showed “Upload cancelled. Your selection is kept; retry when ready.” and Retry upload. Name, breed, district, location text, confirmed coordinates, contact and photo preview remained.
4. Waited for delayed provider work. Parent snapshot 3 recorded zero pets, one pending asset and one mock provider object; no automatic content submission occurred.
5. Clicked Retry upload. Upload-only retry completed; form remained, requiring a separate explicit POST LOST PET.
6. Explicit post succeeded. Owner Profile displayed exactly one Active Cancel Fixture and its decoded image (natural width 160).
7. Parent snapshot 4 recorded one pet, one attached asset and one provider object. Retry returned HTTP 200 using the same upload key, without another provider upload start.

Screenshot transcript title: **Cancel active upload and inspect preserved form**.

### 2. Provider failure and retry — passed

1. Owner filled a fresh `Provider Retry Fixture`, confirmed latitude 22.301 / longitude 114.181 and selected teal image.
2. Parent armed a single provider-boundary failure, with no delay. POST displayed “Image storage is unavailable. Please try again later.” and Retry upload. All form fields and preview remained.
3. Parent snapshot 5 recorded the failed asset as deleted with `IMAGE_STORAGE_UNAVAILABLE`, no second pet, and the first successful pet/asset/object unchanged.
4. Clicked Retry upload, waited for upload retry completion, then explicitly posted the preserved form.
5. Owner Profile displayed exactly two reports: one Provider Retry Fixture and one Active Cancel Fixture. Parent snapshot 6 recorded success.

This is an injected storage-provider failure, not a browser-offline/network-loss test. A new upload key after the terminal failure is permitted; this result does not claim reuse of the failed key.

Screenshot transcript title: **Observe controlled storage failure feedback**.

### 3. Logout/account switch before late completion — passed for same-tab navigation path

An initial Account Switch Fixture attempt established logout/unmount before late completion, but context compaction delayed the replacement login until after completion. That attempt is **not** evidence of completion after replacement login.

One bounded repeat, `AccountSwitchTiming2`, supplied the required ordering:

| Event | Actual ledger time (UTC) |
|---|---|
| Owner provider upload started | 2026-10-26T10:48:35.925Z |
| Replacement reporter login returned HTTP 200 | 2026-10-26T10:48:43.461Z |
| Old owner provider upload completed | 2026-10-26T10:49:05.930Z |

The owner started upload (99%), navigated Profile → Open settings → Log out, then signed in as reporter in the same tab. Reporter login completed **22.469 seconds before** the old provider upload finished.

- Reporter Profile showed Browser reporter, zero active reports and no owned pets.
- Opened a fresh reporter Report form while the old upload was still pending: no selected photo; pet name, breed, location, latitude, longitude and phone empty; contact name Browser reporter.
- After the recorded late completion, a read-only DOM check verified the same empty fields, reporter contact name and enabled Add photo control. No owner draft, preview, old success/error or automatic submission appeared.
- Parent captured snapshot 9 after completion for database/provider attribution checks.
- Final browser action logged reporter out. Observed `/login` and guest navigation; no synthetic session was intentionally left signed in.

Screenshot transcript titles: **Verify new-account draft is empty during the delayed completion** and **Confirm late upload completion leaves the reporter form untouched**.

This tests real navigation/unmount abort plus logout/login in the same tab. It does not claim a still-mounted old upload form, cross-tab switching, or a successful old HTTP response delivered into the replacement account; the browser abort is part of the protection exercised.

## Observations and limitations

- Low-severity UX observation: cancelling an active upload showed the useful cancellation/retry message plus a generic “Unable to post the pet report.” message. The draft was preserved and retry worked; no functional or data-integrity failure was observed. Consider suppressing the generic post-failure message for deliberate cancellation in a separately approved repair.
- Provider-failure wording was visible both beside upload and at form bottom; useful but redundant.
- No browser-offline injection, provider SDK/Cloudinary verification, cross-tab session transition or concurrent duplicate final content POST was exercised in this supplemental run. Do not infer those from the upload-key reuse result.
- No application functionality was modified. The parent owns final exact-ID teardown and records its outcome in the run ledger; this report does not pre-claim cleanup.

## Final parent verification and cleanup

The harness exited 0 after `stop`. Its ledger records `cleanupComplete: true`, exact deletion of 3 synthetic users, 2 pets, 5 media-asset records and 1 upload-budget record, and empty assertions for every application collection in the dedicated database. All 4 exact in-memory provider objects were confirmed absent. The owned replica set stopped and the isolated frontend/API was no longer reachable.

`node verify-ledger.mjs` passed its read-only assertions for cancellation identity reuse, no duplicate content/attachments, failure compensation, replacement-login timing and exact cleanup. Harness/evidence syntax and `git diff --check` passed. Secret scanning covered 335 worktree files and 309 index files with no findings, allowing only precisely reviewed fictional redaction-test fixtures. Application/config/package tracked-file comparison was unchanged. Runtime environment files, Atlas data, real Cloudinary assets and original images were not modified. No commit or push.

