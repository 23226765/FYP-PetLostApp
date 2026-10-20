// bcrypt.js limits input to 72 UTF-8 bytes, not 72 JavaScript characters.
// Apply only when SETTING a password; legacy login must keep raw bcrypt comparison.
export const MIN_PASSWORD_LENGTH = 6
export const MAX_PASSWORD_BYTES = 72

export function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, code: 'PASSWORD_TOO_SHORT', field: 'password', params: { min: MIN_PASSWORD_LENGTH } }
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return { error: `Password must be ${MAX_PASSWORD_BYTES} UTF-8 bytes or fewer.`, code: 'PASSWORD_TOO_LONG', field: 'password', params: { maxBytes: MAX_PASSWORD_BYTES } }
  }
  return null
}
