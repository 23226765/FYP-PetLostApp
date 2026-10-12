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

export function legacyImagePath(value: string): string | null {
  try {
    const base = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
    const url = new URL(value, `${base.origin}/`)
    const loopback = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    const local = url.origin === base.origin || url.origin === window.location.origin
      || (loopback(base.hostname) && loopback(url.hostname))
    if (!local || url.username || url.password || !url.pathname.startsWith('/uploads/')) return null
    // Validate the raw path before URL can normalize encoded/literal traversal.
    const raw = value.match(/^(?:(?:https?:)?\/\/[^/?#]+)?\/?uploads\/([^?#]*)(?:[?#].*)?$/i)
    if (!raw) return null
    const parts = raw[1]!.split('/').map((part) => decodeURIComponent(part))
    if (!parts.length || parts.some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(part) || part.endsWith('.'))) return null
    // Read through the fixed API origin, never the supplied URL's host/query.
    return `/uploads/legacy/${parts.map(encodeURIComponent).join('/')}`
  } catch { return null }
}

export const protectedImagePath = (value: string) => managedImagePath(value) || legacyImagePath(value)
