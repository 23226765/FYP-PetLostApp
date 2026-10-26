# Controlled browser verification — 23 October 2026

Actual Chrome extension browser, actual Vite frontend and Express routes/controllers/JWT/business logic, real disposable MongoDB replica set. Only storage adapter and expected-database-name module mocked. No runtime .env, Atlas or provider credentials loaded. Cloudinary operations were in-memory, not provider verification.

Origin: http://127.0.0.1:4179. Database: fyp_transactions_browser_fda05496cacf470aad07dd8fca089c24. Accounts: owner/reporter/shelter@browser.example.test, all synthetic. Shelter has shelter_admin role. Health HTTP 200/readyState1 confirmed before browser submissions.

## Passed through actual UI

- Login owner, logout, reporter login, owner return, shelter login, owner return. Account preferences applied: English owner, Traditional Chinese reporter, Simplified Chinese shelter. Old moderation evidence absent on ordinary account transition.
- Owner report created Browser Maple (6adb74407391a84e48d66e7f) using confirmed latitude22.30/longitude114.18, districtKowloonCity and fictional report phone. No GPS permission requested. Explicit location required/confirmed state displayed. Pet created photo-free; profile Active reports1 and unique detail link correct.
- Reporter submitted sighting6adb7496547066af27221934 at22.301/114.181. Success notified owner. Detail displayed exactly1history item, note/location and map trace. Owner refreshing detail retained1entry and permitted note.
- Owner saw1incomingmessage, reporter own send did not create own badge. Message notification opened correct reporter conversation. Reading cleared Messages badge while independent sighting notification remained.
- Owner cancelled reunion once then confirmed Sighted→Reunited. Closed banner and disabled new-sighting action appeared.
- Chat image selected then removed before sending; different synthetic image selected and sent. Actual multipart upload, attachment and permission-checked delivery rendered160x120 image. No forced network failure/retry was injected.
- Rescue6adb7747547066af27221cfa created through UI with synthetic image and explicit location. Comment posted once/count1, bookmark toggled, caption edited and success feedback displayed.
- Unrelated reporter rescue view had no author edit/delete or status controls. Shelter view had status controls but no author edit/delete. Shelter status update reflected rescue_dispatched in moderation context.
- Reporter submitted synthetic rescue report. Shelter moderation showed1report and image. Hide with reason recorded actor/time; report remained pending independently. Hidden evidence image still rendered160px. Author direct hidden rescue route displayed Post unavailable. Owner direct /moderation displayed Administrator access required without old evidence.
- Privacy Visible selection/save displayed success. Avatar upload displayed Profile photo updated and image complete/naturalWidth160.
- Mobile390x844 English light settings and dark privacy cards visually readable. Desktop default1262px screenshots showed centered480px chat/moderation. Traditional/Simplified user-written English captions/messages remained untranslated. Keyboard Tab from appearance reached Change profile photo. Reunion Cancel worked. Viewport override reset afterward.

## Confirmed issues / reproductions

1. Medium: Settings owner Light→Dark, wait Language and appearance saved, then Visible contact privacy→Save. Theme flips back Light despite only privacy changing. Backend savedDark reappeared on subsequent login. Parent code review identifies stale props.user.preferences merged by saveContactPrivacy and reapplied by App user update.
2. Medium: Rescue datetime default displayed15:03 while local chat timestamp23:03. Submit unchanged; detail Observed3:03PM. Parent confirms UTC ISO sliced into datetime-local then reparsed as local, shifting observation8hours in HongKong.
3. Low: Owner /pets/6adb74407391a84e48d66e7f displays bare 'km away' with absent distance value. Confirmed on refresh.
4. Contact configuration inconsistency: report required phone50000101 entered; owner privacyVisible saved; reporter detail still says in-appmessagesonly. Parent confirms contact projection reads account phone (synthetic account blank) instead of report phone. No unauthorized contact disclosure observed.
5. Low localization: Simplified moderation subtitle displayed literal rescue_dispatched and Dog while surrounding controls translated.
6. Low visual: photo-free pet/chat avatar thumbnails displayed broken image/alt text instead of intentional fallback in desktop chat screenshot.
7. Observed consistency gap: reunited pet remains in Radar's '1 pet missing nearby' with Found it? button. Submission after reunion from this card was not exercised; authorization bypass not claimed.

Suspected only: clicking Report immediately while login success initialization was still running briefly opened form then returned toRadar; not reproduced systematically.

## Evidence and limitations

Browser tool transcript retains actual accessibility snapshots and screenshots: mobile dark privacy selector; desktop protected coral chat image; Simplified dark hidden moderation evidence; English light mobile settings. Tool exposed screenshot bytes/inline images, no persisted screenshot file was created. Ledger retains method/path/status only, never credentials/tokens/body; current runtime request paths may omit router prefixes because logging captured req.path after routing. Future harness draft records original path.

Initial upload attempt blocked by Chrome extension file-URL permission; user enabled it; reconnection and subsequent uploads succeeded. No agent permission settings changed.

Not verified here: pet/sighting image upload via UI, forced network failure/retry or in-flight cancellation, two simultaneous browser profiles, full keyboard focus trap/Escape coverage, exhaustive all-screen theme/locale combinations, GPS denial, actual mobile device, provider behavior. Selection cancellation is not in-flight upload cancellation. Limited browser checks supplement, not replace, backend role/privacy regressions.

Additional actual runtime diagnostics: vue-i18n repeatedly reported Invalid linked format / Unexpected empty linked key for the literal you@example.com; pet photo selection attempted unavailable pwa-camera-modal before web fallback. These are diagnostics, not proof that fallback upload is broken.

Exact teardown completed via stdin stop: process exit0 and CLEANUP_VERIFIED. ledger.json records exact deleted fixture IDs, empty collection assertions, mock objects absent, and cleanupComplete=true. Owned replica shut down. No application fixes made during verification.
