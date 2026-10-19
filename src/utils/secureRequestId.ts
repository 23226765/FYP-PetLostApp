// Request identities must survive uncertain retries, but must never depend on
// randomUUID being exposed on an insecure mobile-development origin.
export function secureRequestId(prefix = 'image'): string {
  try {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  } catch {
    throw Object.assign(new Error('Secure request IDs are unavailable'), { apiCode: 'SECURE_ID_UNAVAILABLE' })
  }
}
