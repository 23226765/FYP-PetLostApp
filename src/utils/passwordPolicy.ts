export const MAX_PASSWORD_BYTES = 72

// Count exactly as UTF-8 encoding does, without modifying the supplied password.
export function passwordByteLength(password: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(password).length
  // Older webviews: include surrogate pairs and lone surrogates, never truncate.
  let bytes = 0
  for (const character of password) {
    const point = character.codePointAt(0)!
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return bytes
}
