import net from 'node:net'
import cors from 'cors'
import helmet from 'helmet'

export const DEVELOPMENT_CORS_ORIGINS = Object.freeze([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const TRUST_PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal'])
const EXPOSED_RATE_LIMIT_HEADERS = Object.freeze([
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'Retry-After',
])

function configurationError(code) {
  const error = new Error('Invalid HTTP security configuration.')
  error.code = code
  return error
}

function validCidr(value) {
  const parts = value.split('/')
  if (parts.length !== 2) return false
  const version = net.isIP(parts[0])
  if (!version || !/^\d+$/.test(parts[1])) return false
  const prefix = Number(parts[1])
  return prefix >= 0 && prefix <= (version === 4 ? 32 : 128)
}

function validProxyAddress(value) {
  return TRUST_PROXY_NAMES.has(value) || Boolean(net.isIP(value)) || validCidr(value)
}

/**
 * `true` and wildcard proxy trust are intentionally rejected. Explicit proxy
 * subnets are safest; a bounded hop count is supported for controlled hosts
 * where the application cannot know the platform proxy subnet in advance.
 */
export function parseTrustProxy(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'false' || normalized === 'off' || normalized === '0') return false
  if (normalized === 'true' || normalized === '*' || normalized === 'all') {
    throw configurationError('TRUST_PROXY_UNSAFE')
  }
  if (/^\d+$/.test(normalized)) {
    const hops = Number(normalized)
    if (hops >= 1 && hops <= 10) return hops
    throw configurationError('TRUST_PROXY_INVALID')
  }

  const addresses = normalized.split(',').map((part) => part.trim()).filter(Boolean)
  if (!addresses.length || addresses.some((address) => !validProxyAddress(address))) {
    throw configurationError('TRUST_PROXY_INVALID')
  }
  return addresses.length === 1 ? addresses[0] : addresses
}

function normalizedOrigin(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw configurationError('CORS_ORIGIN_INVALID')
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw configurationError('CORS_ORIGIN_INVALID')
  }
  return url.origin
}

export function parseCorsOrigins(value, { production = false } = {}) {
  const configured = String(value ?? '').trim()
  if (!configured) {
    if (production) throw configurationError('CORS_ORIGINS_REQUIRED')
    return [...DEVELOPMENT_CORS_ORIGINS]
  }

  const origins = [...new Set(configured.split(',').map((origin) => normalizedOrigin(origin.trim())))]
  if (!origins.length || origins.includes('*')) throw configurationError('CORS_ORIGIN_INVALID')
  return origins
}

export function resolveHttpSecurityConfig(environment = process.env) {
  const production = environment.NODE_ENV === 'production'
  return Object.freeze({
    production,
    trustProxy: parseTrustProxy(environment.TRUST_PROXY),
    allowedOrigins: Object.freeze(parseCorsOrigins(environment.CORS_ORIGINS, { production })),
  })
}

export function createCorsOptions(allowedOrigins) {
  const allowed = new Set(allowedOrigins)
  return {
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) return callback(null, true)
      const error = new Error('Origin is not allowed by CORS')
      error.code = 'CORS_ORIGIN_DENIED'
      error.status = 403
      return callback(error)
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: [...EXPOSED_RATE_LIMIT_HEADERS],
    maxAge: 600,
    optionsSuccessStatus: 204,
  }
}

export function createSecurityHeaders({ production = false } = {}) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: production
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
      : false,
  })
}

export function apiNoStore(_req, res, next) {
  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')
  next()
}

export function configureHttpSecurity(app, config) {
  app.set('trust proxy', config.trustProxy)
  app.disable('x-powered-by')
  app.use(createSecurityHeaders({ production: config.production }))
  app.use('/api', apiNoStore)
  app.use(cors(createCorsOptions(config.allowedOrigins)))
}

export function httpSecurityConfigurationMessage(error) {
  const messages = {
    CORS_ORIGINS_REQUIRED: 'CORS_ORIGINS is required in production.',
    CORS_ORIGIN_INVALID: 'CORS_ORIGINS contains an invalid or unsafe origin.',
    TRUST_PROXY_UNSAFE: 'TRUST_PROXY must not enable blanket proxy trust.',
    TRUST_PROXY_INVALID: 'TRUST_PROXY must contain explicit proxy addresses, subnets, or a bounded hop count.',
  }
  return messages[error?.code] || 'HTTP security configuration is invalid.'
}
