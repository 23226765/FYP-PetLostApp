import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  loadKit, validateFixtures, eligibleReports, expectedPairs, rankScenario,
  precisionAtK, ndcgAtK, parseSheet, evaluatePilot, run,
} from '../scripts/evaluateSmartMatch.js'
import { breedSimilarity } from '../services/matchEngine.js'

const ROOT = new URL('../../', import.meta.url)
const SCRIPT = fileURLToPath(new URL('../scripts/evaluateSmartMatch.js', import.meta.url))
const kit = loadKit()
const HEADER = 'scenarioId,reportId,label,rationale\n'
// These tiny arithmetic/control-flow fixtures are NOT judgments for P01–P24.
// Never write test grades into reviewer files or report them as human evidence.
const toy = {
  reports: [
    { id: 'toy-a', species: 'Dog', breed: 'Toy', status: 'lost', createdAt: '2026-10-31T00:00:00Z', location: { coordinates: [114.1, 22.3] } },
    { id: 'toy-b', species: 'Dog', breed: 'Toy', status: 'lost', createdAt: '2026-10-30T00:00:00Z', location: { coordinates: [114.1, 22.3] } },
  ],
  scenarios: [{ id: 'toy-query', split: 'held-out', species: 'Dog', breed: 'Toy', coordinates: [114.1, 22.3], category: 'unit arithmetic', inputMode: 'test only' }],
  now: new Date('2026-11-01T04:00:00Z'),
}
const toySheet = (a = '', b = '', reason = '') => `${HEADER}toy-query,toy-a,${a},${reason}\ntoy-query,toy-b,${b},${reason}\n`
const toyRun = sheets => evaluatePilot({ ...toy, sheets, split: 'held-out' })

test('collection is 24 reports/12 scenarios, 4/8 split, 94 blank independent review pairs and no cross-split families', () => {
  assert.equal(kit.reports.length, 24)
  assert.equal(kit.scenarios.length, 12)
  assert.equal(kit.scenarios.filter(scenario => scenario.split === 'development').length, 4)
  assert.deepEqual(Object.fromEntries(['Dog', 'Cat', 'Other'].map(species => [species, kit.reports.filter(report => report.species === species).length])), { Dog: 12, Cat: 8, Other: 4 })
  const pairs = expectedPairs(kit.reports, kit.scenarios)
  assert.equal(pairs.length, 94)
  assert.equal(expectedPairs(kit.reports, kit.scenarios.filter(s => s.split === 'development')).length, 34)
  assert.notEqual(kit.sheets[0], kit.sheets[1])
  for (const sheet of kit.sheets) {
    const rows = parseSheet(sheet, pairs)
    assert.equal(rows.size, 94)
    assert.ok([...rows.values()].every(row => row.label === '' && row.rationale === ''))
  }
})

test('both real kit splits remain Not measured with blank sheets; held-out rankings are withheld', () => {
  for (const split of ['development', 'held-out']) {
    const output = run(['--split', split])
    assert.equal(output.status, 'Not measured')
    assert.equal(output.summary, null)
    assert.equal(output.review.resolvedPairs, 0)
    assert.ok(output.results.every(result => result.metrics === null))
    assert.equal(output.review.blockers.length, split === 'development' ? 34 : 60)
    if (split === 'held-out') assert.ok(output.results.every(result => result.rankings === null))
    else assert.ok(output.results.every(result => result.rankings !== null))
    assert.equal(output.manifest.frozenNow, '2026-11-01T04:00:00.000Z')
    assert.ok(Object.values(output.manifest.inputChecksums).every(hash => /^[a-f0-9]{64}$/.test(hash)))
    assert.equal(Object.keys(output.manifest.sourceChecksums).length, 5)
  }
})

test('eligibility includes legacy missing moderation but excludes hidden, reunited and other species', () => {
  const dog = kit.scenarios[0]
  const ids = eligibleReports(kit.reports, dog).map(report => report.id)
  assert.equal(ids.length, 10)
  assert.ok(ids.includes('P02'))
  assert.ok(!ids.includes('P11') && !ids.includes('P12') && !ids.includes('P13'))
})

test('Chinese-only breed values remain authored text and receive zero breed similarity under the unchanged engine', () => {
  for (const id of ['Q10', 'Q11']) {
    const scenario = kit.scenarios.find(s => s.id === id)
    assert.match(scenario.breed, /\p{Script=Han}/u)
    assert.equal(breedSimilarity(scenario.breed, scenario.breed), 0)
    assert.ok(rankScenario(kit.reports, scenario, kit.now).smartMatch.every(result => result.breakdown.breed === 0))
  }
})

test('nearest-first ties use newest date then ID, with missing distances last; score ties use ID', () => {
  const record = { ...toy.reports[0], createdAt: '2026-10-31T00:00:00Z' }
  const reports = [
    { ...record, id: 'z' }, { ...record, id: 'a' },
    { ...record, id: 'old', createdAt: '2026-10-30T00:00:00Z' },
    { ...record, id: 'unknown', createdAt: '2026-11-01T00:00:00Z', location: undefined },
  ]
  const result = rankScenario(reports, toy.scenarios[0], toy.now)
  assert.deepEqual(result.baseline, ['a', 'z', 'old', 'unknown'])
  assert.deepEqual(result.smartMatch.slice(0, 2).map(item => item.id), ['a', 'old'])
  assert.deepEqual(rankScenario([...reports].reverse(), toy.scenarios[0], toy.now), result)
  assert.equal(result.smartMatch.find(item => item.id === 'unknown').breakdown.distanceBand, 'unknown')
})

test('missing dates/location are not silently repaired, and report-creation rather than lastSeen determines recency', () => {
  const report = kit.reports.find(item => item.id === 'P07')
  const scenario = kit.scenarios.find(item => item.id === 'Q09')
  const result = rankScenario(kit.reports, scenario, kit.now)
  assert.equal(result.smartMatch.find(item => item.id === report.id).breakdown.distance, 0)
  assert.equal(result.smartMatch.find(item => item.id === 'P08').breakdown.daysAgo, null)
  const changeLastSeen = kit.reports.map(item => ({ ...item, lastSeen: '1900-01-01T00:00:00Z' }))
  assert.deepEqual(rankScenario(changeLastSeen, scenario, kit.now), result)
})

test('metric arithmetic: graded ranking, complete ideal pool and short-list denominator', () => {
  const grades = new Map([['A', 2], ['B', 1], ['C', 0]])
  assert.equal(precisionAtK(['C', 'B', 'A'], grades), 2 / 3)
  assert.equal(precisionAtK(['A'], grades), 1 / 3)
  assert.equal(ndcgAtK(['A', 'B', 'C'], grades), 1)
  const expected = (1 / Math.log2(3) + 3 / Math.log2(4)) / (3 + 1 / Math.log2(3))
  assert.ok(Math.abs(ndcgAtK(['C', 'B', 'A'], grades) - expected) < 1e-12)
  assert.ok(ndcgAtK(['B'], grades) < 1)
  assert.equal(precisionAtK([], new Map()), 0)
  assert.equal(ndcgAtK([], new Map()), null)
  assert.equal(ndcgAtK(['zero'], new Map([['zero', 0]])), null)
})

test('metrics reject unknown/duplicate results, unresolved grades and invalid cutoffs', () => {
  assert.throws(() => precisionAtK(['A'], new Map()), /Unjudged/)
  assert.throws(() => ndcgAtK(['A', 'A'], new Map([['A', 2]])), /Duplicate/)
  for (const grade of [undefined, null, -1, 3, '1', 'U']) assert.throws(() => precisionAtK(['A'], new Map([['A', grade]])), /resolved/)
  assert.throws(() => ndcgAtK([], new Map(), 0), /cutoff/)
})

test('CSV handles BOM, CRLF, quoted commas/newlines and escaped quotes', () => {
  const text = '\uFEFFscenarioId,reportId,label,rationale\r\ntoy-query,toy-a,U,"Unclear, ""collar""\r\nnot visible"\r\n'
  const parsed = parseSheet(text, ['toy-query/toy-a'])
  assert.deepEqual(parsed.get('toy-query/toy-a'), { label: 'U', rationale: 'Unclear, "collar"\nnot visible' })
})

test('malformed, duplicate, unexpected or fabricated label formats fail closed', () => {
  const pairs = ['toy-query/toy-a', 'toy-query/toy-b']
  for (const input of [
    HEADER + 'toy-query,toy-a,3,\n', HEADER + 'toy-query,toy-a,1.0,\n',
    HEADER + 'toy-query,toy-a,U,\n', HEADER + 'unknown,toy-a,1,\n',
    HEADER + 'toy-query,toy-a,1,\ntoy-query,toy-a,2,\n',
    HEADER + 'toy-query,toy-a,1,"not closed\n', HEADER + 'toy-query,toy-a,1,a,b\n',
    'scenarioId,reportId,label,score\n', '"scenarioId,reportId,label,rationale"\n', HEADER + 'toy-query,toy-a,1,"closed"tail\n',
  ]) assert.throws(() => parseSheet(input, pairs))
})

test('one reviewer/adjudication cannot fill an absent independent review; uncertain pairs do not become zero', () => {
  const first = toySheet('2', '0')
  for (const second of [toySheet(), HEADER]) {
    const output = toyRun([first, second, toySheet('2', '0', 'Toy arithmetic only')])
    assert.equal(output.status, 'Not measured')
    assert.equal(output.summary, null)
    assert.equal(output.results[0].metrics, null)
    assert.equal(output.results[0].rankings, null)
  }
  const uncertain = toyRun([toySheet('U', '0', 'Insufficient toy evidence'), toySheet('U', '0', 'Insufficient toy evidence'), toySheet()])
  assert.equal(uncertain.status, 'Not measured')
  assert.equal(uncertain.review.blockers[0].reason, 'uncertain-review-needs-adjudication')
})

test('toy disagreements require numeric reasoned adjudication and original agreement is retained', () => {
  const first = toySheet('2', '0'), second = toySheet('1', '0')
  assert.equal(toyRun([first, second, toySheet()]).status, 'Not measured')
  assert.equal(toyRun([first, second, toySheet('2', '')]).status, 'Not measured')
  const resolved = toyRun([first, second, toySheet('2', '', 'Toy arithmetic adjudication')])
  assert.equal(resolved.status, 'Measured synthetic pilot only')
  assert.equal(resolved.review.agreements, 1)
  assert.equal(resolved.review.disagreementPairs, 1)
  assert.equal(resolved.results[0].metrics.smartMatch.precisionAt3, 1 / 3)
  assert.throws(() => toyRun([first, first, toySheet('0', '', 'Conflict with agreement')]), /contradicts/)
})

test('zero-relevance toy cases are explicit, not silently averaged as ranking success', () => {
  const zeros = toySheet('0', '0'), output = toyRun([zeros, zeros, toySheet()])
  assert.deepEqual(output.summary.noRelevantCases, ['toy-query'])
  assert.equal(output.summary.positiveCases, 0)
  assert.equal(output.summary.smartMatch.precisionAt3, null)
  assert.equal(output.summary.smartMatch.ndcgAt5, null)
  assert.equal(output.results[0].metrics.smartMatch.precisionAt3, 0)
  assert.equal(output.results[0].metrics.smartMatch.ndcgAt5, null)
  assert.equal(output.results[0].rankings.smartMatch.length, 2)
})

test('no eligible toy reports is distinct from reviewed nonrelevance', () => {
  const output = evaluatePilot({ ...toy, reports: [], sheets: [HEADER, HEADER, HEADER], split: 'held-out' })
  assert.deepEqual(output.summary.noEligibleCases, ['toy-query'])
  assert.deepEqual(output.summary.noRelevantCases, [])
  assert.equal(output.summary.smartMatch.precisionAt3, null)
})

test('fixture validation rejects split leakage, malformed coordinates and collection drift', () => {
  const reports = JSON.parse(readFileSync(new URL('../../evaluation/smart-match/v1/reports.json', import.meta.url)))
  const scenarios = JSON.parse(readFileSync(new URL('../../evaluation/smart-match/v1/scenarios.json', import.meta.url)))
  const copy = value => structuredClone(value)
  const leaked = copy(scenarios); leaked.scenarios[4].family = leaked.scenarios[0].family
  assert.throws(() => validateFixtures(reports, leaked), /crosses/)
  const reversed = copy(scenarios); reversed.scenarios[0].coordinates = [22.3, 114.1]
  assert.throws(() => validateFixtures(reports, reversed), /scenario/)
  const duplicate = copy(reports); duplicate.reports[0].id = duplicate.reports[1].id
  assert.throws(() => validateFixtures(duplicate, scenarios), /unique/)
  const shortened = copy(reports); shortened.reports.pop()
  assert.throws(() => validateFixtures(shortened, scenarios), /24/)
})

test('runner is deterministic across host timezones, leaves sheets unchanged and rejects unsupported CLI options', () => {
  const before = loadKit().sheets
  const outputs = ['UTC', 'America/Los_Angeles'].map(TZ => JSON.parse(execFileSync(process.execPath, [SCRIPT, '--split', 'held-out'], { cwd: ROOT, env: { ...process.env, TZ }, encoding: 'utf8' })))
  assert.deepEqual(outputs[0], outputs[1])
  assert.deepEqual(loadKit().sheets, before)
  const invalid = spawnSync(process.execPath, [SCRIPT, '--database', 'forbidden'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /Usage:/)
})

test('actual CLI completes with network/database/provider modules and runtime environment reads forbidden', () => {
  // A restricted import graph catches accidental dependency or I/O additions.
  const guard = `
    import fs from 'node:fs';
    import { registerHooks, syncBuiltinESMExports } from 'node:module';
    const read = fs.readFileSync;
    fs.readFileSync = function(path, ...args) {
      if (/[/\\\\]\\.env(?:[.\\\\/]|$)/.test(String(path))) throw new Error('Runtime environment read forbidden');
      return read.call(this, path, ...args);
    };
    syncBuiltinESMExports();
    globalThis.fetch = () => { throw new Error('Network forbidden'); };
    const builtins = new Set(['node:fs','node:crypto','node:child_process','node:url','node:path']);
    const files = ['/scripts/evaluateSmartMatch.js','/services/matchEngine.js','/services/locationPrivacy.js','/services/moderationVisibility.js'];
    registerHooks({ resolve(specifier, context, next) {
      if (builtins.has(specifier)) return next(specifier, context);
      const result = next(specifier, context);
      if (result.url.startsWith('file:') && files.some(path => result.url.endsWith(path))) return result;
      throw new Error('Non-offline module forbidden');
    }});
  `
  const stdout = execFileSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(guard)}`, SCRIPT, '--split', 'held-out'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(JSON.parse(stdout).status, 'Not measured')
})
