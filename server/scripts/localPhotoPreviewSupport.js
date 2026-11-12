// Local-only fictional fixtures. No configuration files, model or provider imports.
import assert from 'node:assert/strict'

export const PREVIEW_PORT = 4182
export const PET_CENTRE = [114.1897, 22.2825]
export const RESCUE_CENTRE = [114.1694, 22.3193]

export function preparePreviewEnvironment(environment) {
  for (const name of Object.keys(environment)) {
    if (/MONGO|CLOUDINARY|CLOUDFLARE|ASSISTANT|SECRET|PASSWORD|TOKEN|DOTENV|PROXY|^VITE_|^MEDIA_|^NODE_OPTIONS$|^DEBUG$/i.test(name)) delete environment[name]
  }
  Object.assign(environment, {
    NODE_ENV: 'test', IMAGE_UPLOADS_ENABLED: 'false', ASSISTANT_AI_ENABLED: 'false',
    ALLOW_TEST_SEED: 'false', ALLOW_IMAGE_MIGRATION: 'false',
    ALLOW_IMAGE_CLEANUP: 'false', ALLOW_MEDIA_RECONCILIATION: 'false',
    MONGOMS_RUNTIME_DOWNLOAD: 'false',
  })
}

export function fixtureDocuments({ origin, run, creatorId, now = new Date() }) {
  assert.equal(origin, `http://127.0.0.1:${PREVIEW_PORT}`)
  assert.match(run, /^[a-f0-9]{32}$/)
  const seedBatch = `local-photo-preview-${run}`
  const image = animal => `${origin}/test-photos/${animal}.jpg`
  const pets = ['Dog', 'Cat'].map((species, index) => ({
    name: `FICTIONAL Preview ${species}`, species, breed: index ? 'Domestic Shorthair' : 'Mixed breed',
    photo: image(species.toLowerCase()), photos: [image(species.toLowerCase())],
    description: 'Fictional local photo preview only. This is not a real lost-pet report.',
    district: 'Wan Chai', locationName: 'Fictional preview park',
    location: { type: 'Point', coordinates: [PET_CENTRE[0] + index * 0.001, PET_CENTRE[1]] },
    status: index ? 'sighted' : 'lost', lastSeen: now, reportedBy: creatorId, seedBatch,
  }))
  const strays = ['Dog', 'Cat'].map((species, index) => ({
    species, photo: image(species.toLowerCase()), photos: [image(species.toLowerCase())],
    description: `FICTIONAL Preview ${species} rescue post. Local demonstration only; no real animal needs rescue.`,
    district: 'Yau Tsim Mong', locationName: 'Fictional preview square',
    location: { type: 'Point', coordinates: [RESCUE_CENTRE[0] + index * 0.001, RESCUE_CENTRE[1]] },
    condition: 'healthy', rescueStatus: 'reported', reporterName: 'Fictional Preview Creator',
    reportedBy: creatorId, observedAt: now, active: true, seedBatch,
  }))
  return { pets, strays, seedBatch }
}
