// Offline synthetic pilot only. Import no models, application startup, dotenv,
// storage adapters or providers. The production scorer remains unchanged.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { scoreCandidate, haversineDistanceKm } from '../services/matchEngine.js'
import { anonymousSearchCoordinates, projectPetLocation, distanceBand } from '../services/locationPrivacy.js'
import { isContentVisible } from '../services/moderationVisibility.js'

const KIT = new URL('../../evaluation/smart-match/v1/', import.meta.url)
const ROOT = new URL('../../', import.meta.url)
const SPLITS = ['development', 'held-out']
const LABELS = new Set(['', 'U', '0', '1', '2'])
const numericLabel = label => ['0', '1', '2'].includes(label)
const pairKey = (scenarioId, reportId) => `${scenarioId}/${reportId}`
const checksum = data => createHash('sha256').update(data).digest('hex')

export function eligibleReports(reports, scenario) {
  return reports.filter(report => report.species === scenario.species &&
    ['lost', 'sighted'].includes(report.status) && isContentVisible(report))
}

export function expectedPairs(reports, scenarios) {
  return scenarios.flatMap(scenario => eligibleReports(reports, scenario).map(report => pairKey(scenario.id, report.id)))
}

export function rankScenario(reports, scenario, now, limit = 20) {
  const observation = {
    species: scenario.species,
    breed: typeof scenario.breed === 'string' ? scenario.breed.trim().slice(0, 120) : '',
    coordinates: anonymousSearchCoordinates(null, scenario.coordinates),
  }
  const candidates = eligibleReports(reports, scenario).map(report => {
    const coordinates = projectPetLocation(report, null).coordinates
    const score = scoreCandidate(observation, {
      species: report.species, breed: report.breed, createdAt: report.createdAt, coordinates,
    }, { now })
    const { distanceKm, ...breakdown } = score.breakdown
    return {
      id: report.id, totalScore: score.totalScore,
      breakdown: { ...breakdown, distanceBand: distanceBand(distanceKm) },
      baselineDistance: haversineDistanceKm(observation.coordinates, coordinates),
      timestamp: Number.isFinite(Date.parse(report.createdAt)) ? Date.parse(report.createdAt) : -Infinity,
    }
  })
  const parsed = Number(limit)
  const take = Number.isFinite(parsed) ? Math.min(50, Math.max(1, Math.floor(parsed))) : 20
  const baseline = [...candidates].sort((a, b) => {
    if (a.baselineDistance !== b.baselineDistance) return a.baselineDistance < b.baselineDistance ? -1 : 1
    if (a.timestamp !== b.timestamp) return a.timestamp > b.timestamp ? -1 : 1
    return a.id.localeCompare(b.id)
  }).slice(0, take).map(candidate => candidate.id)
  const smartMatch = [...candidates].sort((a, b) => b.totalScore - a.totalScore || a.id.localeCompare(b.id))
    .slice(0, take).map(({ id, totalScore, breakdown }) => ({ id, totalScore, breakdown }))
  return { eligibleCount: candidates.length, smartMatch, baseline }
}

function checkRanking(ids, grades, k) {
  if (!Number.isInteger(k) || k < 1) throw new Error('Metric cutoff must be a positive integer')
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate ranking identity')
  for (const grade of grades.values()) if (![0, 1, 2].includes(grade)) throw new Error('Metric requires resolved grades')
  for (const id of ids) if (!grades.has(id)) throw new Error('Unjudged result: metrics are not measured')
}

export function precisionAtK(ids, grades, k = 3) {
  checkRanking(ids, grades, k)
  // Missing result slots count as not relevant; denominator is always k.
  return ids.slice(0, k).filter(id => grades.get(id) >= 1).length / k
}

export function ndcgAtK(ids, grades, k = 5) {
  checkRanking(ids, grades, k)
  const dcg = values => values.slice(0, k).reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0)
  const ideal = dcg([...grades.values()].sort((a, b) => b - a))
  return ideal === 0 ? null : dcg(ids.map(id => grades.get(id))) / ideal
}

// Small strict CSV reader: UTF-8/BOM, CRLF, quoted commas/newlines and doubled
// quotes supported. Unknown columns/pairs, duplicate rows and invalid grades fail.
export function parseSheet(text, pairs) {
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const rows = []
  let row = [], cell = '', quoted = false, closed = false
  const finishCell = () => { row.push(cell); cell = ''; closed = false }
  const finishRow = () => { finishCell(); if (row.some(value => value !== '')) rows.push(row); row = [] }
  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { cell += '"'; index++ }
        else { quoted = false; closed = true }
      } else cell += char
    } else if (char === ',') finishCell()
    else if (char === '\n') finishRow()
    else if (char === '"' && !cell && !closed) quoted = true
    else {
      if (char === '"' || closed) throw new Error('Malformed reviewer CSV quoting')
      cell += char
    }
  }
  if (quoted) throw new Error('Unclosed reviewer CSV quote')
  if (cell || row.length || closed) finishRow()
  const header = rows.shift()
  if (header?.length !== 4 || header.join(',') !== 'scenarioId,reportId,label,rationale') throw new Error('Unexpected reviewer CSV header')
  const allowed = new Set(pairs), values = new Map()
  for (const fields of rows) {
    if (fields.length !== 4) throw new Error('Reviewer rows must have exactly four columns')
    const [scenarioId, reportId, label, rationale] = fields.map(value => value.trim())
    const key = pairKey(scenarioId, reportId)
    if (!allowed.has(key)) throw new Error(`Unknown or ineligible review pair: ${key}`)
    if (values.has(key)) throw new Error(`Duplicate review pair: ${key}`)
    if (!LABELS.has(label)) throw new Error(`Invalid label at ${key}: use 0, 1, 2, U or blank`)
    if (label === 'U' && !rationale) throw new Error(`Explain uncertainty at ${key}`)
    values.set(key, { label, rationale })
  }
  return values
}

function resolveReview(key, first, second, adjudication) {
  const a = first.get(key)?.label || '', b = second.get(key)?.label || ''
  const final = adjudication.get(key)
  if (!a || !b) return { issue: 'missing-review' }
  if (a === b && numericLabel(a)) {
    if (final?.label && final.label !== a) throw new Error(`Adjudication contradicts agreeing reviews at ${key}`)
    return { grade: Number(a) }
  }
  if (numericLabel(final?.label) && final.rationale) return { grade: Number(final.label) }
  return { issue: a === 'U' || b === 'U' ? 'uncertain-review-needs-adjudication' : 'disagreement-needs-adjudication' }
}

export function evaluatePilot({ reports, scenarios, now, sheets, split }) {
  if (!SPLITS.includes(split)) throw new Error('Choose development or held-out')
  const allPairs = expectedPairs(reports, scenarios)
  const parsed = sheets.map(sheet => parseSheet(sheet, allPairs))
  if (parsed.length !== 3) throw new Error('Two independent sheets and one adjudication sheet are required')
  const selected = scenarios.filter(scenario => scenario.split === split)
  const pairs = expectedPairs(reports, selected)
  const resolved = new Map(), blockers = []
  let bothReviewed = 0, numericPairs = 0, agreements = 0
  for (const key of pairs) {
    const a = parsed[0].get(key)?.label, b = parsed[1].get(key)?.label
    if (a && b) bothReviewed++
    if (numericLabel(a) && numericLabel(b)) { numericPairs++; if (a === b) agreements++ }
    const result = resolveReview(key, ...parsed)
    if (result.issue) blockers.push({ pair: key, reason: result.issue })
    else resolved.set(key, result.grade)
  }
  const complete = blockers.length === 0
  const results = selected.map(scenario => {
    const ranking = rankScenario(reports, scenario, now)
    const grades = new Map(eligibleReports(reports, scenario).map(report => [report.id, resolved.get(pairKey(scenario.id, report.id))]))
    const positive = complete ? [...grades.values()].some(grade => grade >= 1) : null
    const metrics = ids => ({ precisionAt3: precisionAtK(ids, grades), ndcgAt5: ndcgAtK(ids, grades) })
    return {
      scenarioId: scenario.id, category: scenario.category, inputMode: scenario.inputMode,
      eligibleCount: ranking.eligibleCount, positiveRelevance: positive,
      // Withhold held-out results until every required review is resolved.
      rankings: split === 'held-out' && !complete ? null : ranking,
      metrics: complete ? { smartMatch: metrics(ranking.smartMatch.map(item => item.id)), nearestFirst: metrics(ranking.baseline) } : null,
    }
  })
  const positiveCases = results.filter(result => result.positiveRelevance)
  const average = (system, metric) => positiveCases.length ? positiveCases.reduce((sum, result) => sum + result.metrics[system][metric], 0) / positiveCases.length : null
  return {
    status: complete ? 'Measured synthetic pilot only' : 'Not measured', split,
    review: { requiredPairs: pairs.length, bothReviewed, resolvedPairs: resolved.size, numericPairs, agreements, disagreementPairs: numericPairs - agreements, blockers },
    summary: complete ? {
      scenarioCount: results.length, positiveCases: positiveCases.length,
      noRelevantCases: results.filter(result => result.eligibleCount > 0 && !result.positiveRelevance).map(result => result.scenarioId),
      noEligibleCases: results.filter(result => result.eligibleCount === 0).map(result => result.scenarioId),
      smartMatch: { precisionAt3: average('smartMatch', 'precisionAt3'), ndcgAt5: average('smartMatch', 'ndcgAt5') },
      nearestFirst: { precisionAt3: average('nearestFirst', 'precisionAt3'), ndcgAt5: average('nearestFirst', 'ndcgAt5') },
      ndcgWinsTiesLosses: positiveCases.reduce((counts, result) => {
        const delta = result.metrics.smartMatch.ndcgAt5 - result.metrics.nearestFirst.ndcgAt5
        counts[Math.abs(delta) < 1e-12 ? 'ties' : delta > 0 ? 'wins' : 'losses']++
        return counts
      }, { wins: 0, ties: 0, losses: 0 }),
    } : null,
    results,
  }
}

function validPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(value => typeof value === 'number' && Number.isFinite(value)) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
}

export function validateFixtures(reportFile, scenarioFile) {
  const { reports } = reportFile, { scenarios } = scenarioFile
  if (reportFile.version !== 'smart-match-synthetic-v1' || reportFile.version !== scenarioFile.version ||
    reportFile.frozenNow !== scenarioFile.frozenNow || !Number.isFinite(Date.parse(reportFile.frozenNow))) throw new Error('Fixture version or frozen clock mismatch')
  if (!Array.isArray(reports) || reports.length !== 24 || !Array.isArray(scenarios) || scenarios.length !== 12) throw new Error('Pilot requires exactly 24 reports and 12 scenarios')
  if (new Set(reports.map(report => report.id)).size !== 24 || new Set(scenarios.map(scenario => scenario.id)).size !== 12) throw new Error('Fixture IDs must be unique')
  for (const report of reports) {
    if (!/^P\d{2}$/.test(report.id) || !['Dog', 'Cat', 'Other'].includes(report.species) || !['lost', 'sighted', 'reunited'].includes(report.status) || typeof report.breed !== 'string') throw new Error('Invalid fictional report')
    if (report.location !== undefined && (report.location.type !== 'Point' || !validPoint(report.location.coordinates))) throw new Error('Invalid report GeoJSON')
    if (report.createdAt !== undefined && (typeof report.createdAt !== 'string' || !Number.isFinite(Date.parse(report.createdAt)))) throw new Error('Invalid report date')
    if (report.moderationStatus !== undefined && !['visible', 'hidden'].includes(report.moderationStatus)) throw new Error('Invalid moderation control')
  }
  const families = new Map()
  for (const scenario of scenarios) {
    if (!/^Q\d{2}$/.test(scenario.id) || !SPLITS.includes(scenario.split) || !scenario.family || !validPoint(scenario.coordinates) || !['Dog', 'Cat', 'Other'].includes(scenario.species) || typeof scenario.breed !== 'string' || scenario.breed.length > 120) throw new Error('Invalid fictional scenario')
    if (families.has(scenario.family) && families.get(scenario.family) !== scenario.split) throw new Error('Related scenario family crosses development/held-out split')
    families.set(scenario.family, scenario.split)
  }
  if (scenarios.filter(scenario => scenario.split === 'development').length !== 4) throw new Error('Split must be four development and eight held-out scenarios')
}

export function loadKit() {
  const names = ['reports.json', 'scenarios.json', 'reviewer-1.csv', 'reviewer-2.csv', 'adjudication.csv', 'PROTOCOL.md', 'REVIEW_PACKET.md']
  const bytes = new Map(names.map(name => [name, readFileSync(new URL(name, KIT))]))
  const reportFile = JSON.parse(bytes.get('reports.json').toString('utf8'))
  const scenarioFile = JSON.parse(bytes.get('scenarios.json').toString('utf8'))
  validateFixtures(reportFile, scenarioFile)
  return {
    reports: reportFile.reports, scenarios: scenarioFile.scenarios, now: new Date(reportFile.frozenNow),
    sheets: ['reviewer-1.csv', 'reviewer-2.csv', 'adjudication.csv'].map(name => bytes.get(name).toString('utf8')),
    version: reportFile.version, checksums: Object.fromEntries([...bytes].map(([name, data]) => [name, checksum(data)])),
  }
}

export function run(args = []) {
  if (args.length && (args.length !== 2 || args[0] !== '--split' || !SPLITS.includes(args[1]))) throw new Error('Usage: node server/scripts/evaluateSmartMatch.js [--split development|held-out]')
  const split = args[1] || 'development', kit = loadKit()
  let commit = 'unavailable'
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* manifest explicitly records missing Git provenance */ }
  const sources = ['server/scripts/evaluateSmartMatch.js', 'server/services/matchEngine.js', 'server/services/locationPrivacy.js', 'server/services/moderationVisibility.js', 'server/controllers/petController.js']
  return {
    description: 'Small synthetic pilot, not proof of real-world recovery effectiveness. Human origin/independence of labels requires procedural evidence.',
    manifest: {
      version: kit.version, commit, node: process.version, icu: process.versions.icu, platform: process.platform, arch: process.arch,
      frozenNow: kit.now.toISOString(), scenarioIds: kit.scenarios.filter(scenario => scenario.split === split).map(scenario => scenario.id),
      inputChecksums: kit.checksums, sourceChecksums: Object.fromEntries(sources.map(name => [name, checksum(readFileSync(new URL(name, ROOT)))])),
      definitions: { precisionAt3: 'grades >= 1; denominator 3 even for short lists', ndcgAt5: 'gain 2^grade-1; log2(rank+1); zero ideal gain => null', averages: 'positive-relevance queries only; no-relevant and no-eligible cases listed separately', baseline: 'public-grid Haversine distance ascending; newest createdAt then ID; missing distance/date last', scoreTies: 'production ID localeCompare; stable ASCII fixture IDs', resultLimit: 20 },
    },
    ...evaluatePilot({ ...kit, split }),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(run(process.argv.slice(2)), null, 2)) }
  catch (error) { console.error(`Offline evaluation stopped: ${error.message}`); process.exitCode = 1 }
}
