// Aggregates only the already-authorized, public-cell-matched Pet stream.
// No source IDs, dates, coordinates or arbitrary legacy strings are serialized.
export const MAP_DISTRICTS = Object.freeze(['Central and Western', 'Eastern', 'Southern', 'Wan Chai', 'Kowloon City', 'Kwun Tong', 'Sham Shui Po', 'Wong Tai Sin', 'Yau Tsim Mong', 'Islands', 'Kwai Tsing', 'North', 'Sai Kung', 'Sha Tin', 'Tai Po', 'Tsuen Wan', 'Tuen Mun', 'Yuen Long'])
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const countIf = condition => ({ $sum: { $cond: [condition, 1, 0] } })

export function mapInsightFacets(now) {
  const validDate = { $eq: [{ $type: '$createdAt' }, 'date'] }
  return {
    statistics: [{ $group: {
      _id: null,
      total: { $sum: 1 },
      dogs: countIf({ $eq: ['$species', 'Dog'] }),
      cats: countIf({ $eq: ['$species', 'Cat'] }),
      other: countIf({ $eq: ['$species', 'Other'] }),
      unclassifiedSpeciesCount: countIf({ $not: [{ $in: ['$species', ['Dog', 'Cat', 'Other']] }] }),
      recentCount: countIf({ $and: [validDate, { $gte: ['$createdAt', new Date(now.getTime() - WEEK_MS)] }, { $lte: ['$createdAt', now] }] }),
      unknownDateCount: countIf({ $ne: [{ $type: '$createdAt' }, 'date'] }),
      futureDateCount: countIf({ $and: [validDate, { $gt: ['$createdAt', now] }] }),
    } }],
    districtCounts: [
      { $group: { _id: { $cond: [{ $in: ['$district', MAP_DISTRICTS] }, '$district', null] }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ],
  }
}

export function publicMapInsights(result, now) {
  // Missing facets (e.g. an older API implementation) are unavailable, not zero.
  if (!Array.isArray(result?.statistics) || !Array.isArray(result?.districtCounts)) return null
  const stats = result.statistics[0] || {}
  const districts = result.districtCounts
  const topDistrictCount = Math.max(0, ...districts.map(row => row.count))
  const unknownDistrictCount = districts.find(row => row._id === null)?.count || 0
  return {
    total: stats.total || 0,
    speciesCounts: { dog: stats.dogs || 0, cat: stats.cats || 0, other: stats.other || 0 },
    unclassifiedSpeciesCount: stats.unclassifiedSpeciesCount || 0,
    topDistricts: districts.filter(row => row.count === topDistrictCount && MAP_DISTRICTS.includes(row._id)).map(row => row._id).sort(),
    topDistrictCount,
    unknownDistrictCount,
    unknownIsTop: topDistrictCount > 0 && unknownDistrictCount === topDistrictCount,
    recentCount: stats.recentCount || 0,
    unknownDateCount: stats.unknownDateCount || 0,
    futureDateCount: stats.futureDateCount || 0,
    windowStart: new Date(now.getTime() - WEEK_MS).toISOString(),
    windowEnd: now.toISOString(),
  }
}
