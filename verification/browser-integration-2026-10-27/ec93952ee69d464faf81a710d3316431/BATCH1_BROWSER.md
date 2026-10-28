# Messaging browser evidence — 27 October 2026

Actual observations completed before the user stopped further automated browser reviewing. No later browser pass is implied.

- Actual frontend/backend with disposable `fyp_transactions_browser_ec93952ee69d464faf81a710d3316431`; real authorization/controllers/MongoDB; storage adapter mocked in memory.
- Owner (`127.0.0.1`) and reporter (`localhost`) origins maintained independent sessions. English owner and Traditional Chinese reporter were observed, not a complete language/theme matrix.
- Mixed-case `RePoRtEr` search found the matching participant. No-results/clear restored two authorized conversations. Filtering retained the unread total of two.
- Text-only outgoing messages had no image/editor. A genuine synthetic image decoded at 160×120 in both sessions; only the sender had its editor.
- Keyboard Enter sent `Browser Batch1 text only send`; sending disabled the control. Sender and recipient messages had no empty attachment/editor. Recipient polling delivered it on the following poll after an initial short observation timeout.
- Reload/mobile/layout/theme matrix remained unfinished when reviewing stopped. Final avatar-empty guards, Map and filter changes have component/code coverage, not new browser evidence.

## Teardown

`ledger.json` confirms `cleanupComplete: true`. Exact synthetic fixtures removed: three users, one pet, five messages, five notifications, one media asset and one upload-budget record. The single mock provider object has `absentConfirmed: true`. Owned backend, Vite and local replica set stopped; disposable storage removed. No Atlas or real Cloudinary operations.

`teal.png` and `coral.png` are generated fixtures, **not screenshots**. Observations remain in this report and the conversation's browser tool evidence. No further screenshots or browser automation were collected after the stop instruction.
