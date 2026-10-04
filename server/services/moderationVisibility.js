export const VISIBLE_MODERATION_FILTER = Object.freeze({
  moderationStatus: { $ne: 'hidden' },
})

/** Missing moderationStatus is intentionally treated as visible for legacy data. */
export function visibleContentFilter(filter = {}) {
  return { ...filter, moderationStatus: { $ne: 'hidden' } }
}

export function isContentVisible(content) {
  return content?.moderationStatus !== 'hidden'
}
