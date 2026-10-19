import type { AppNotification } from '../types/notification'
import { i18n } from './index'
import { districtLabel, speciesLabel } from './formatters'

// Reconstruct legacy system messages rather than translating or trusting stored
// English prose. Authored text is supplied separately by the authorized API.
export function notificationPresentation(notification: AppNotification) {
  const t = i18n.global.t
  const params = notification.event?.params || {}
  const text = (key: string) => typeof params[key] === 'string' ? params[key] as string : ''
  const petName = text('petName') || t('pets.unknownPet')
  const district = text('district') ? districtLabel(text('district')) : t('notificationEvents.reportedArea')
  const animal = text('breed') || speciesLabel(text('species')) || t('strayAnimal.fallback')
  const code = notification.event?.code || notification.type
  switch (code) {
    case 'proximity': return { title: t('notificationEvents.proximityTitle'), body: t('notificationEvents.proximityBody', { petName, animal, district }) }
    case 'sighting': return { title: t('notificationEvents.sightingTitle', { petName }), body: t('notificationEvents.sightingBody', { petName, district }) }
    case 'reunited': return { title: t('notificationEvents.reunitedTitle'), body: t('notificationEvents.reunitedBody', { petName }) }
    case 'comment': return { title: t('notificationEvents.commentTitle'), body: text('text') || t('notificationEvents.commentBody') }
    case 'message.text': return { title: t('notificationEvents.messageTitle'), body: text('text') || t('notificationEvents.messageBody') }
    case 'message.photo': return { title: t('notificationEvents.messageTitle'), body: t('notificationEvents.photoBody') }
    case 'message.sharedPost': return { title: t('notificationEvents.messageTitle'), body: t('notificationEvents.sharedBody') }
    default: return { title: t('notificationEvents.messageTitle'), body: t('notificationEvents.messageBody') }
  }
}
