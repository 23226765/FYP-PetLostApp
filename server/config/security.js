const MIN_JWT_SECRET_LENGTH = 32

const REJECTED_JWT_SECRETS = new Set([
  'pawradar_dev_secret',
  'pawradar_dev_secret_change_me',
  'your_jwt_secret_here',
])

export function requireJwtSecret(value = process.env.JWT_SECRET) {
  const secret = typeof value === 'string' ? value.trim() : ''

  if (!secret) {
    const error = new Error('JWT secret is not configured.')
    error.code = 'JWT_SECRET_MISSING'
    throw error
  }
  if (REJECTED_JWT_SECRETS.has(secret.toLowerCase())) {
    const error = new Error('JWT secret uses a rejected placeholder value.')
    error.code = 'JWT_SECRET_PLACEHOLDER'
    throw error
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    const error = new Error('JWT secret is too short.')
    error.code = 'JWT_SECRET_TOO_SHORT'
    throw error
  }
  if (new Set(secret).size < 8) {
    const error = new Error('JWT secret has insufficient character diversity.')
    error.code = 'JWT_SECRET_WEAK'
    throw error
  }

  return secret
}

export function securityConfigurationMessage(error) {
  if (error?.code === 'JWT_SECRET_MISSING') {
    return 'JWT_SECRET is required in server/.env.'
  }
  if (error?.code === 'JWT_SECRET_PLACEHOLDER') {
    return 'JWT_SECRET must not use a known placeholder value.'
  }
  if (error?.code === 'JWT_SECRET_TOO_SHORT') {
    return `JWT_SECRET must contain at least ${MIN_JWT_SECRET_LENGTH} characters.`
  }
  if (error?.code === 'JWT_SECRET_WEAK') {
    return 'JWT_SECRET must be a randomly generated value with sufficient character diversity.'
  }
  return 'Security configuration is invalid.'
}

export { MIN_JWT_SECRET_LENGTH }
