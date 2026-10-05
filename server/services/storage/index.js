import { imageStorageConfig } from '../../config/imageStorage.js'
import { createCloudinaryStorage } from './cloudinaryStorage.js'

export function createImageStorage(environment = process.env) {
  const config = imageStorageConfig(environment)
  return createCloudinaryStorage(config)
}
