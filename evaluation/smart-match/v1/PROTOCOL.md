# Smart Match synthetic pilot — protocol v1

**Effectiveness: Not measured.** No relevance judgments have been supplied.
This is a small fictional offline pilot, not proof of real-world recovery,
usability, animal identity, veterinary suitability or calibrated confidence.
The official HKBU/ISA assessment brief has not been supplied; ISA alignment is
provisional. Do not invent reviewers, agreement, participant feedback or results.

## Question and system under evaluation

Does the current rules-based Smart Match put reports worth checking near the top,
compared with nearest-first discovery, on these fictional observation tasks?

- Production sources: [scorer](../../../server/services/matchEngine.js),
  [controller](../../../server/controllers/petController.js), and
  [public-location policy](../../../server/services/locationPrivacy.js).
- Same-species `lost`/`sighted` reports are eligible. Hidden and reunited controls
  are excluded; missing moderation status remains visible. Species therefore adds
  the same 30 points to every eligible result and does not distinguish their rank.
- The unchanged 100-point heuristic uses species 30, breed 25, distance 25 and
  report-creation recency 20. Missing factors are not reweighted. `lastSeen` is
  context for review, not the date used by the recency score. Sighting counts and
  district labels do not contribute to the score. Photos are not analyzed.
- Both observation and candidate positions use production 750m public grid
  centres for scoring, including for authenticated callers. Baseline distance
  uses the same centres. Public-grid precision is intentionally approximate.
- **Chinese limitation:** normalization retains only Latin letters/digits after
  decomposition. Chinese-only breed strings become empty and earn zero breed
  points, even when both strings are identical. It does not translate English,
  Traditional Chinese or Simplified Chinese breed names. Q10/Q11 expose this
  limitation; P19/P10 retain their authored Chinese values without normalization
  in the fixtures or reviewer packet.
- Scores/percentages are not probabilities. There is no low-score rejection
  threshold or 5km candidate cutoff: farther reports can still appear. A
  no-counterpart scenario may still return results. Do not claim abstention.

## Collection and split

[reports.json](reports.json) contains 24 fictional reports: 12 dogs, eight cats,
four specific animals under `Other`. Four hidden/reunited eligibility controls
leave 20 eligible reports overall. All identity, location and narrative details
are fictional; nothing is copied from Atlas or seeded accounts. No photographs,
contact data or external image URLs are needed.

[scenarios.json](scenarios.json) contains 12 scenarios. Q01–Q04 are development;
Q05–Q12 are held-out. The complete eligible pair set contains 94 reviews per
reviewer: 34 development, 60 held-out. The two reviewer sheets use different
fixed non-ranking orders. Report IDs are offline aliases, not MongoDB IDs.

| Design coverage | Scenarios |
| --- | --- |
| Distinctive cases | Q01, Q05, Q06 |
| Competing distance/breed/date clues | Q02, Q07 |
| Ambiguous candidates | Q04, Q08 |
| Missing information and historical data | Q03, Q09; P07 has no location, P08 no creation date |
| Traditional/Simplified Chinese breed input | Q10, Q11 |
| No rabbit counterpart designed into the pool | Q12; reviewers still judge independently |

All points use `[longitude, latitude]`; the fixed clock is
`2026-11-01T04:00:00.000Z` (12:00 Hong Kong). All observations occur at that
reference time for the fictional review tasks. District-centre and GPS-fallback
coordinates are supplied inputs representing the current UI, not actual GPS
measurements. Q09 explicitly separates the stated Sha Tin observation from the
app's Hong Kong-centre fallback. The runner does not simulate a device or geocoder.
Legacy missing fields are deliberate test anomalies, not records to insert into
the current required-location schema. They are not automatically repaired.

The shared report pool is intentional; observation families do not cross the
split. Use development cases to debug the protocol/runner, not to report held-out
performance. Do not add near-duplicate variants across splits. Freeze code,
fixtures, protocol and labels before the held-out run. Weights stay unchanged in
this task. Future tuning after seeing held-out results requires a fresh set.

## Independent review — instructions for people

1. Arrange two real reviewers, ideally not the scoring implementer. Keep a short
   private record of their role, review date and confirmation they did not see
   rankings/weights. Do not include personal details in public artifacts without
   permission. This is document relevance review, not a claimed usability study.
2. Give both reviewers [REVIEW_PACKET.md](REVIEW_PACKET.md) and this rubric.
   For blinded review, share the packet and the rubric below without the scoring
   description, source code, scenario design categories or runner output. One
   person fills [reviewer-1.csv](reviewer-1.csv), the other independently fills
   [reviewer-2.csv](reviewer-2.csv). Do not show one person's labels to the other
   before both independent passes finish. Keep the original sheet entries.
3. Each row identifies a scenario and an eligible report. Use the packet to judge
   whether a finder should check that report. Consider physical description,
   plausible approximate location/time, uncertainty and contradictions. Do not
   award points by copying breed/distance/time thresholds or engine scores.
4. Enter `0`, `1`, `2`, or `U` in `label`. Leave genuinely unreviewed rows blank.
   Brief reasons are encouraged for every grade and required for `U`. CSV columns
   and IDs must not change. You may filter/sort by scenarioId to reduce switching
   between tasks; row order has no meaning. In a spreadsheet, save as **CSV UTF-8**, not XLSX or
   an automatically renamed text file. Quote commas/newlines in rationales when
   editing manually, e.g. `"Collar unclear, needs checking"`.
5. Only after both passes, inspect disagreement/uncertainty pairs reported by the
   runner. Discuss them or use a third reviewer. Enter a final numeric label and
   a reason in [adjudication.csv](adjudication.csv) for those pairs. Keep original
   reviewer labels untouched. Never fill blank independent reviews via
   adjudication. Unresolved uncertainty remains unmeasured; agreement between two
   `U` labels is not a numeric relevance judgment.

| Label | Meaning |
| --- | --- |
| 2 | Strong candidate worth checking first, with substantial supporting detail |
| 1 | Plausible candidate worth checking, but incomplete/ambiguous evidence |
| 0 | Inconsistent or not useful for this observation |
| U | Cannot responsibly judge from the supplied information; explain why |
| blank | Not reviewed; never interpret this as zero |

Several candidates may receive 2 or 1. Do not force one correct identity. Case
design intentions are not answer keys. The kit contains no human labels. If only
author labels can be obtained, report an author-labelled exploratory exercise;
do not relabel copied author judgments as two independent reviewers.
Software can check completeness, not whether a person genuinely reviewed a pair.

## Frozen comparison and metric definitions

Both systems see identical eligible reports and approximate coordinates, with
the production limit of 20. This collection has at most ten candidates per
scenario, so it does not evaluate large-corpus retrieval or result truncation.

- **Smart Match:** production score descending; ties by production ID
  `localeCompare`. Fixture aliases are stable ASCII P01–P24.
- **Nearest-first:** unrounded Haversine distance between public grid centres,
  ascending; ties by newest `createdAt`, then ID. Missing distance/date sorts last.
- **Precision@3:** grades 1 and 2 are relevant. Divide by **3**, even if fewer
  results exist; empty slots contribute zero. This can penalize sparse lists.
- **nDCG@5:** gain `2^grade - 1`, discount `log2(rank + 1)` with ranks starting at
  one, divided by the best ordering of **all judged eligible candidates**, not
  just returned ones. Missing slots contribute zero. Equal-score ordering follows
  the actual deterministic tie-break, not a tie-averaged idealization.
- **No-relevant cases:** if all eligible grades are zero, precision is zero and
  nDCG is `null` (zero ideal gain). List these cases and returned candidates
  separately; exclude them from both main averages and nDCG wins/ties/losses.
  Report the excluded count so favorable averages cannot conceal false matches.
  A case with no eligible reports is listed separately as `noEligibleCases`.
- **Incomplete/uncertain:** no metric or aggregate is emitted for the entire
  selected split until every required pair has both independent reviews and any
  necessary numeric adjudication. `summary`/per-query metrics remain `null`,
  `status` is **Not measured**, and blockers identify missing/disputed pairs.
  Development rankings can be inspected; held-out rankings are withheld until
  that split is fully resolved. Completion of development labels does not unlock
  held-out results. Invalid/duplicate/unknown labels or pairs stop the run.
- Report individual queries, mean metrics for positive-relevance queries,
  pre-adjudication numeric agreement counts and nDCG wins/ties/losses with a
  1e-12 equality tolerance. Do not claim statistical significance from eight
  held-out scenarios or turn this into a recovery-rate estimate.

## Execution and evidence

From the project root, using the existing Node installation (no new packages):

```sh
node server/scripts/evaluateSmartMatch.js --split development
node server/scripts/evaluateSmartMatch.js --split held-out
```

The runner prints JSON to stdout and writes nothing. It reads only the local kit,
named source files and local Git HEAD; imports only Node built-ins and the pure
production scoring/location/visibility modules. It does not load runtime `.env`,
start the app, connect to MongoDB, run browser/GPS logic, fetch images, call AI,
or contact Cloudinary. Do not run seeds, server startup or migration for this kit.
Retain stdout as an evaluation artifact when appropriate; avoid overwriting
reviewer sheets with shell redirection. A valid unlabelled run exits zero while
remaining Not measured; malformed inputs exit nonzero.

The manifest records the fixed clock, split IDs, Node/ICU/platform, local commit,
and SHA-256 hashes of inputs, protocol, packet, scorer, policy, controller and
runner. Hashes capture uncommitted source too; a commit alone is insufficient.
Outputs are deterministic for unchanged inputs/source/runtime. Review sheets are
never rewritten. Preserve the exact reviewed versions for the report.

Focused correctness checks (mocked persistence for controller parity):

```sh
node --test server/tests/smartMatchEvaluation.test.js server/tests/smartMatchEvaluationParity.test.js server/tests/matchEngine.test.js
```

Test-only toy grades test metric arithmetic. They are not human judgments, are
not written into these sheets and must never be reported as pilot measurements.
Production parity covers ranking, eligibility, limits and disclosed breakdowns
with a fixed clock and mocked model operations. It is not real MongoDB, provider,
HTTP-deployment or browser evidence.

The recorded checks used Node 22.20.0. The parity test uses Node's experimental
MockTimers API; the CLI isolation check uses `module.registerHooks`. Older Node
versions may not support those test helpers, even though the runner itself has
no external package dependency.

## ISA presentation and limitations

Link this kit from [PROGRESS.md](../../../docs/PROGRESS.md#smart-match-behavior-and-evaluation-gap).
Describe the research question, 24/12 collection, 4/8 split, actual reviewer
procedure, baseline, definitions, per-case results and exclusions. Until real
reviews exist, Smart Match P@3/nDCG@5, baseline P@3/nDCG@5 and comparisons are all
**Not measured**. Do not insert plausible-looking placeholders as numbers.

Keep correctness tests in a separate verification paragraph. After evaluation,
show difficult cases and Chinese normalization/GPS-fallback limitations even if
averages favor Smart Match. The small hand-designed corpus, subjective judgments,
reused candidate pool, coarse locations, Latin-only breed handling, no visual
recognition and absence of real incidents limit external validity. This pilot
does not establish effectiveness for Hong Kong pet recovery, rendered usability,
fairness across breeds/languages, physical-device GPS, production scalability or
probabilistic calibration. User/device evaluation remains separate future work.
