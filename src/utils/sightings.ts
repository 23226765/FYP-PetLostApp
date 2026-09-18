import type { Sighting } from '../types/pet'

function reportTime(sighting: Sighting): number {
  const value = sighting.sightedAt || sighting.createdAt
  const timestamp = value ? new Date(value).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function normalizeSightingHistory(items: readonly Sighting[]): Sighting[] {
  const byId = new Map<string, Sighting>()
  for (const sighting of items) {
    const id = String(sighting.id || '').trim()
    if (!id || byId.has(id)) continue
    byId.set(id, sighting)
  }

  return [...byId.values()].sort(
    (left, right) => reportTime(left) - reportTime(right) || left.id.localeCompare(right.id),
  )
}
