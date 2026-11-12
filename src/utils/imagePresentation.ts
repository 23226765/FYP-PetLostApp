/** Recognize known demo graphics without replacing them with unrelated photos. */
export function isDemonstrationImage(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const url = new URL(value.trim(), window.location.origin)
    return ['placehold.co', 'www.placehold.co'].includes(url.hostname)
      || (url.origin === window.location.origin && url.pathname === '/avatar.svg')
  } catch { return false }
}

export function displayImageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || isDemonstrationImage(value)) return ''
  try {
    const api = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
    const url = new URL(value.trim(), `${api.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

export function attachedPhotoSources(photo?: string, photos?: string[]): string[] {
  return [...new Set([photo, ...(photos || [])].map(displayImageUrl).filter(Boolean))]
}

export function photoFallbackKey(photo?: string, photos?: string[]): string {
  const supplied = [photo, ...(photos || [])].filter(value => typeof value === 'string' && value.trim())
  return !supplied.length ? 'photoPresentation.noPhoto'
    : supplied.every(isDemonstrationImage) ? 'photoPresentation.demoPlaceholder' : 'photoPresentation.unavailable'
}

export function profileInitials(name?: string): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) || []
  if (!words.length) return ''
  if (words.length > 1) return `${Array.from(words[0]!)[0]}${Array.from(words.at(-1)!)[0]}`.toLocaleUpperCase()
  return (/\p{Script=Han}/u.test(words[0]!) ? Array.from(words[0]!).slice(0, 2).join('') : Array.from(words[0]!)[0] || '').toLocaleUpperCase()
}
