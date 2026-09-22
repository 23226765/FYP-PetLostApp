import { i18n } from './index'

const DISTRICT_KEYS: Record<string, string> = {
  'Central and Western': 'districts.centralWestern',
  'Wan Chai': 'districts.wanChai',
  Eastern: 'districts.eastern',
  Southern: 'districts.southern',
  'Yau Tsim Mong': 'districts.yauTsimMong',
  'Sham Shui Po': 'districts.shamShuiPo',
  'Kowloon City': 'districts.kowloonCity',
  'Wong Tai Sin': 'districts.wongTaiSin',
  'Kwun Tong': 'districts.kwunTong',
  'Kwai Tsing': 'districts.kwaiTsing',
  'Tsuen Wan': 'districts.tsuenWan',
  'Tuen Mun': 'districts.tuenMun',
  'Yuen Long': 'districts.yuenLong',
  North: 'districts.north',
  'Tai Po': 'districts.taiPo',
  'Sha Tin': 'districts.shaTin',
  'Sai Kung': 'districts.saiKung',
  Islands: 'districts.islands',
}

export function districtLabel(value: string) {
  const key = DISTRICT_KEYS[value]
  return key ? i18n.global.t(key) : value
}

export function petStatusLabel(value: string) {
  const keyByValue: Record<string, string> = {
    lost: 'pets.lost',
    sighted: 'pets.sighted',
    reunited: 'pets.reunited',
  }
  return keyByValue[value] ? i18n.global.t(keyByValue[value]) : value
}

export function speciesLabel(value: string) {
  const keyByValue: Record<string, string> = {
    Dog: 'pets.dog', Dogs: 'pets.dog',
    Cat: 'pets.cat', Cats: 'pets.cat',
    Other: 'pets.other',
    All: 'radar.all',
  }
  return keyByValue[value] ? i18n.global.t(keyByValue[value]) : value
}

export function strayAnimalLabel(species: string, animalType?: string) {
  const specifiedType = typeof animalType === 'string' ? animalType.trim() : ''
  return species === 'Other' ? specifiedType || i18n.global.t('strayAnimal.fallback') : speciesLabel(species)
}

export function rescueStatusLabel(value: string) {
  const keyByValue: Record<string, string> = {
    'Needs Rescue': 'strays.needsRescue',
    needs_rescue: 'strays.needsRescue',
    reported: 'strays.spotted',
    Spotted: 'strays.spotted',
    spotted: 'strays.spotted',
    'In Care': 'strays.inCare',
    in_care: 'strays.inCare',
    rescue_dispatched: 'strays.helpDispatched',
    rescued: 'strays.inCare',
    Resolved: 'strays.resolved',
    resolved: 'strays.resolved',
  }
  return keyByValue[value] ? i18n.global.t(keyByValue[value]) : value
}

export function strayConditionLabel(value: string) {
  const keyByValue: Record<string, string> = {
    healthy: 'strays.healthy',
    injured: 'strays.injured',
    critical: 'strays.critical',
    unknown: 'strays.unknownCondition',
  }
  return keyByValue[value.toLowerCase()] ? i18n.global.t(keyByValue[value.toLowerCase()]) : value
}

export function formatRelativeDate(value: string | Date | undefined | null) {
  if (!value) return i18n.global.t('common.unknown')
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  if (Number.isNaN(timestamp)) return String(value)
  const elapsed = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return i18n.global.t('common.now')
  if (minutes < 60) return i18n.global.t('common.minutesAgo', { count: minutes }, minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return i18n.global.t('common.hoursAgo', { count: hours }, hours)
  const days = Math.floor(hours / 24)
  if (days === 1) return i18n.global.t('common.yesterday')
  if (days <= 14) return i18n.global.t('common.daysAgo', { count: days }, days)
  return i18n.global.d(new Date(timestamp), 'short')
}

export function formatDateTime(value: string | Date | undefined | null) {
  if (!value) return i18n.global.t('common.unknown')
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : i18n.global.d(date, 'dateTime')
}
