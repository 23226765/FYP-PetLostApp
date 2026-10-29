# PawRadar - Feature Status and Evidence

Snapshot: 29 October 2026, including uncommitted approved repairs. **Implemented** describes code availability, not production readiness or proven user benefit. Verification below is historical recorded evidence; no application checks were rerun during documentation drafting. Official assessment requirements remain unavailable.

| Working objective | Implementation state | Evidence | Remaining limitation/work |
| --- | --- | --- | --- |
| Lost-pet reports and owner lifecycle | Implemented | [pet controller](../../server/controllers/petController.js), [browser recovery journey](../../verification/browser-integration-2026-10-23/fda05496cacf470aad07dd8fca089c24/BROWSER_RESULTS.md) | Production and current physical-device evaluation not established |
| Sightings, history and movement trace | Implemented | [transaction service](../../server/services/sightingSubmission.js), [MapView](../../src/components/MapView.vue), [audit evidence](AUDIT_FINDINGS_CHECKLIST.md) | Precise data remains role-restricted; real recovery accuracy not measured |
| Nearby Radar and filtering | Implemented | [Radar](../../src/components/RadarScreen.vue), [pet routes](../../server/routes/pets.js) | UI offers animal/district/radius; backend breed filtering is not a missing UI control |
| Independent Map and Area Insights | Implemented | [viewport evidence](../../verification/MAP_VIEWPORT_INDEPENDENCE_2026-10-28.md), [insights definitions/tests](../../verification/AREA_INSIGHTS_2026-10-28.md) | Latest UI lacks physical-device evaluation; historical origin/data-quality limitations disclosed |
| Spatial hotspots | Implemented | [analytics controller](../../server/controllers/analyticsController.js), [aggregation](../../server/services/hotspotAnalytics.js), [audit integration evidence](AUDIT_FINDINGS_CHECKLIST.md) | Sightings/rescues only; counts/weights are recorded activity, not risk forecasts |
| Explainable Smart Match | Implemented; evaluation pending | [scoring service](../../server/services/matchEngine.js), [screen](../../src/components/SmartMatchScreen.vue), [rules and limits](../PROGRESS.md#smart-match-behavior-and-evaluation-gap) | No image recognition, calibrated confidence or labelled ranking-effectiveness study |
| In-app radius alerts | Partially implemented against broader push goal | [notification controller](../../server/controllers/notificationController.js) | In-app delivery exists; background/browser/native push is not implemented |
| Contact and private messaging | Implemented | [chat controller](../../server/controllers/chatController.js), [messaging browser observations](../../verification/browser-integration-2026-10-27/ec93952ee69d464faf81a710d3316431/BATCH1_BROWSER.md) | Polling, not WebSockets; account-vs-report contact-source observations need separate reconciliation |
| Rescue community | Implemented | [rescue controller](../../server/controllers/strayController.js), [workflow repairs](../../verification/WORKFLOW_REPAIRS_2026-10-29.md) | Hong Kong observation conversion repaired without historical rewrites; advanced exports not implemented |
| Safety/moderation | Implemented | [moderation routes](../../server/routes/moderation.js), [privacy/evidence rules](../../server/services/moderationEvidence.js), [checklist](AUDIT_FINDINGS_CHECKLIST.md) | No general administrator conversation access; deployed policy verification pending |
| Language/theme/preferences | Implemented | [preferences](../../src/composables/usePreferences.ts), [latest privacy-only repair](../../verification/WORKFLOW_REPAIRS_2026-10-29.md), [visual consistency evidence](../../verification/VISUAL_CONSISTENCY_2026-10-28.md) | Three locales; component/contrast evidence is not comprehensive device/accessibility sign-off |
| Saved posts | Implemented with storage limits | [saved pets](../../src/composables/useSavedPets.ts), [saved rescue model](../../server/models/SavedStray.js) | Pet saves are local per account/guest; no cross-device pet-save synchronization |
| Durable image writes | Implemented; historical conversion partial | [media attachment](../../server/services/mediaAttachments.js), [quota/reconciliation](../../server/services/mediaReconciliation.js), [evidence index](../PROGRESS.md#verification-and-command-safety) | Opt-in storage; legacy migration and automated bulk cleanup unfinished |
| Native packaging | Present but deferred/unverified | [Capacitor configuration](../../capacitor.config.ts), [package declarations](../../package.json) | Dependencies/Android source are not proof of installed-device or iOS readiness |
| Deployment and FYP evaluation | Planned/not established | [risks and evaluation needs](../PROGRESS.md#risks-planned-work-and-evaluation-needs) | No production sign-off, formal user study or validated free-hosting topology |

## Current follow-up

1. Keep the approved repair work and original 22 finding numbers intact; reconcile later observations using current code and dated evidence.
2. Obtain the official assessment brief and supervisor instructions before claiming ISA compliance.
3. Evaluate the existing recovery UX on actual devices and Smart Match on labelled cases; update diagrams/results without treating test counts as effectiveness.
4. Plan historical-image portability and a zero-cost controlled deployment before any approved migration/release. Do not expand scope with new features merely to fill this table.

Atlas is not a confirmed current blanket blocker: the latest [28 October read-only report](../../verification/MAP_VIEWPORT_INDEPENDENCE_2026-10-28.md) records success. No current database/provider check was performed for this status update.
