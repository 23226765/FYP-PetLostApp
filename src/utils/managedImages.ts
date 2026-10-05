export function managedImagePath(value: string): string | null {
  try {
    const base = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
    const url = new URL(value, `${base.origin}/`)
    if (url.origin !== base.origin) return null
    const prefix = `${base.pathname.replace(/\/$/, '')}/uploads/managed/`
    if (!url.pathname.startsWith(prefix) || !/^[a-f0-9]{24}\/(?:content|preview)$/i.test(url.pathname.slice(prefix.length)) || url.search || url.hash) return null
    return `/uploads/managed/${url.pathname.slice(prefix.length)}`
  } catch { return null }
}
