const DAY_MS = 24 * 60 * 60 * 1000

function clamp(value, minimum = 0.1, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function rounded(value) {
  return Math.round(value * 100) / 100
}

export function recencyFactor(createdAt, windowDays, now = new Date()) {
  const timestamp = new Date(createdAt).getTime()
  const reference = new Date(now).getTime()
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference) || windowDays <= 0) return 0

  const ageDays = Math.max(0, (reference - timestamp) / DAY_MS)
  return clamp(1 - ageDays / windowDays, 0, 1)
}

export function sightingIntensity(sighting, windowDays, now = new Date()) {
  const confirmationCount = Array.isArray(sighting.confirmedBy)
    ? sighting.confirmedBy.length
    : Number(sighting.confirmationCount) || 0
  const credibility = 0.55 + Math.min(4, Math.max(0, confirmationCount)) * 0.08
  const recency = 0.65 + recencyFactor(sighting.createdAt, windowDays, now) * 0.35
  return rounded(clamp(credibility * recency))
}

export function strayIntensity(stray, windowDays, now = new Date()) {
  const urgency = {
    healthy: 0.4,
    unknown: 0.58,
    injured: 0.85,
    critical: 1,
  }[stray.condition] ?? 0.5
  const statusFactor = {
    reported: 1,
    rescue_dispatched: 0.8,
    rescued: 0.5,
  }[stray.rescueStatus] ?? 1
  const recency = 0.65 + recencyFactor(stray.createdAt, windowDays, now) * 0.35
  return rounded(clamp(urgency * statusFactor * recency))
}
