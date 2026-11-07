import catalogue from './assistantGuidance.json' with { type: 'json' }

export const ASSISTANT_LIMITS = Object.freeze({ text: 1000, history: 6, context: 4000, answer: 4000, transcript: 24 })
export function assistantTopics(locale) { return catalogue[locale] || catalogue.en }
export function unknownReviewedHelp(locale) {
  return { id: 'unknown', answer: {
    en: 'I can explain the reviewed topics below, but cannot verify other app capabilities or read your records. Choose a topic for accurate app help.',
    'zh-HK': '我可以解釋下方已審閱的主題，但無法確認其他功能或讀取你的記錄。請選擇主題以查看準確的應用說明。',
    'zh-CN': '我可以解释下方已审核的主题，但无法确认其他功能或读取你的记录。请选择主题以查看准确的应用说明。',
  }[locale] || 'Choose a reviewed topic for app help.' }
}
export function findReviewedHelp(text, locale) {
  const normalized = text.trim().toLowerCase()
  const all = Object.values(catalogue).flat()
  const exact = all.find(topic => topic.question.toLowerCase() === normalized)
  if (exact) return assistantTopics(locale).find(topic => topic.id === exact.id)
  // Latin tokens must not match inside brand names (e.g. radar in PawRadar).
  // Prefer a specific phrase over a shorter ambiguous phrase across all locales.
  const matches = all.flatMap(topic => topic.keywords.filter(key => /^[a-z0-9 ]+$/i.test(key)
    ? new RegExp(`(?:^|[^a-z0-9])${key}s?(?:$|[^a-z0-9])`, 'i').test(normalized)
    : normalized.includes(key)).map(key => ({ topic, length: key.length })))
  matches.sort((a, b) => b.length - a.length)
  if (matches.length) return assistantTopics(locale).find(topic => topic.id === matches[0].topic.id)
  // Unknown application questions must not be answered by inventing capabilities.
  if (/pawradar|petlostapp|this app|這個應用|这个应用|此應用|此应用/i.test(text)) {
    return unknownReviewedHelp(locale)
  }
  return null
}
