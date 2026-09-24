# PawRadar — Current Feature Status

This document tracks current web milestone coverage. Native wrapper work is intentionally deferred until the web application and Atlas-backed verification are stable.

| Objective | Status | Current implementation | Remaining work |
|---|---|---|---|
| Centralized lost-pet management | Complete | Reporting, owner-scoped posts, status lifecycle, breed/district/status filters, pagination, public details | Live regression after Atlas access returns |
| Sighting management and verification | Complete | Idempotent reports, owner-authorized history, chronological ordering, trajectory pins/polyline, confirmation | Live cross-account workflow verification |
| Geospatial radar | Complete | GeoJSON, `2dsphere`, nearby queries, Leaflet markers/clusters, ownership exclusion | Performance profiling with production-like volume |
| Spatial hotspot analytics | Complete | Pet/sighting/stray aggregation API and Leaflet heatmap | Calibrate weights/radius with evaluation data |
| Radius notifications | Partial | Stored radius/location preferences and in-app notifications | Background/push delivery is not implemented |
| Explainable Smart Match | Complete | Species, breed similarity, spatial decay, recency decay, per-factor breakdown | Formal precision/recall evaluation dataset |
| Communication | Complete | Authenticated inbox/threads, image sharing, phone and WhatsApp subject to contact privacy | Real-time transport/read receipts are optional future work |
| Rescue community | Complete | Stray model, specific animal type, reports, map, comments, saves, moderation, rescue lifecycle | Shelter/admin queue and analytics exports |
| Internationalization/theme | Complete | `en`, `zh-HK`, `zh-CN`; persistent light/dark theme; localized formats | Ongoing copy/contrast review as screens change |
| Native packaging | Partial/deferred | Capacitor packages and Android project exist | Validate dependency placement, sync wrappers, iOS build on macOS |

## Current blocker

The local backend cannot complete Atlas server selection. Treat this as an environment/access blocker until Atlas Network Access and cluster availability are restored. No database mutation is authorized during cleanup.

## Highest-value next work

1. Restore Atlas access and complete smoke plus safe live-verification scenarios.
2. Run a read-only reference audit for the withheld SVG assets and report exact collection, document ID, and field matches.
3. Build an academic Smart Match evaluation set and report precision, recall, ranking quality, and sensitivity to scoring weights.
4. Add shelter-facing hotspot/rescue analytics and CSV export after the core regression suite is stable.
