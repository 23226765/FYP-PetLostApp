<template>
  <div class="map-wrap">
    <div
      ref="mapEl"
      class="leaflet-map"
      role="application"
      :aria-label="showHeatmap ? t('radar.mapHeatLabel') : strays?.length ? t('radar.mapStraysLabel') : t('radar.mapPetsLabel')"
    ></div>
    <p v-if="heatmapError" class="heatmap-notice" role="alert">
      {{ heatmapError }}
    </p>
    <p v-if="locationMessage" class="location-notice" role="status">
      {{ locationMessage }}
    </p>
    <p v-if="showTrajectoryEmpty" class="trajectory-empty" role="status">
      {{ t('sightings.noCoordinates') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Pet, Sighting } from '../types/pet'
import type { StrayReport } from '../types/stray'
import type { HotspotCell } from '../types/analytics'
import { getCurrentLocation } from '../services/geolocation'
import { translateApiError, useAppI18n } from '../i18n'
import { formatDateTime, petStatusLabel, rescueStatusLabel, strayAnimalLabel, strayConditionLabel } from '../i18n/formatters'

const props = defineProps<{
  pets: Pet[]
  center?: { lat: number; lng: number } | null
  radiusKm?: number
  sightings?: Sighting[]
  strays?: StrayReport[]
  heatCells?: HotspotCell[]
  showHeatmap?: boolean
  focusedSightingId?: string
}>()
const { t, locale } = useAppI18n()

const emit = defineEmits<{
  open: [pet: Pet]
  'open-stray': [stray: StrayReport]
  'sighting-open': [sightingId: string]
}>()

const mapEl = ref<HTMLElement | null>(null)

let map: L.Map | null = null
let markersLayer: L.LayerGroup | null = null
let trajectoryLayer: L.MarkerClusterGroup | null = null
let trajectoryRouteLayer: L.LayerGroup | null = null
let straysLayer: L.LayerGroup | null = null
let radiusCircle: L.Circle | null = null
let userMarker: L.Marker | null = null
let heatLayer: L.HeatLayer | null = null
let resizeObserver: ResizeObserver | null = null
let invalidateFrame: number | null = null
let disposed = false
let centerRequest = 0
let heatRenderRequest = 0
let trajectoryFitKey = ''
let heatPluginPromise: Promise<void> | null = null
const trajectoryMarkers = new Map<string, L.Marker>()

const locationMessage = ref<string | null>(null)
const heatmapError = ref('')
const trajectoryPointCount = ref(0)
const showTrajectoryEmpty = computed(
  () => props.sightings !== undefined && props.sightings.length > 0 && trajectoryPointCount.value === 0,
)

const HK_CENTER: [number, number] = [22.2825, 114.1897]
const PAW_PLACEHOLDER = `<span class="pawradar-image-fallback" aria-hidden="true">
  <svg viewBox="0 0 64 64" focusable="false">
    <circle cx="18" cy="20" r="7"/><circle cx="32" cy="14" r="7"/>
    <circle cx="46" cy="20" r="7"/><circle cx="12" cy="34" r="6"/>
    <path d="M32 27c-11 0-19 9-19 18 0 7 6 10 12 7 4-2 10-2 14 0 6 3 12 0 12-7 0-9-8-18-19-18Z"/>
  </svg>
</span>`

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizedImageUrl(value: string | null | undefined): string {
  const photo = value?.trim()
  if (!photo) return ''

  try {
    const apiUrl = new URL(
      import.meta.env.VITE_API_BASE_URL || '/api',
      window.location.origin,
    )
    const resolved = new URL(photo, `${apiUrl.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol) ? resolved.href : ''
  } catch {
    return ''
  }
}

function imageMarkup(photo: string | undefined, label: string, className: string): string {
  const url = normalizedImageUrl(photo)
  const placeholderClass = url ? '' : ' is-placeholder'
  const image = url
    ? `<img src="${esc(url)}" alt="" aria-hidden="true" data-pawradar-image />`
    : ''
  return `<span class="pawradar-media ${className}${placeholderClass}" data-pawradar-media role="img" aria-label="${esc(label)}">${image}${PAW_PLACEHOLDER}</span>`
}

function bindImageFallback(root: HTMLElement | null | undefined) {
  root?.querySelectorAll<HTMLImageElement>('[data-pawradar-image]').forEach((image) => {
    const media = image.closest<HTMLElement>('[data-pawradar-media]')
    const showPlaceholder = () => {
      image.hidden = true
      media?.classList.add('is-placeholder')
    }

    image.onerror = showPlaceholder
    image.onload = () => media?.classList.remove('is-placeholder')
    if (image.complete && image.naturalWidth === 0) showPlaceholder()
  })
}

function validLatLng(lat: unknown, lng: unknown): [number, number] | null {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }

  return [lat, lng]
}

function propCenter(): [number, number] | null {
  return props.center ? validLatLng(props.center.lat, props.center.lng) : null
}

async function resolveCenter(): Promise<{
  coordinates: [number, number]
  showUserMarker: boolean
}> {
  const suppliedCenter = propCenter()
  if (suppliedCenter) {
    locationMessage.value = null
    return { coordinates: suppliedCenter, showUserMarker: true }
  }

  try {
    const { lat, lng } = await getCurrentLocation()
    const coordinates = validLatLng(lat, lng)
    if (!coordinates) throw new Error('Invalid coordinates returned by geolocation')

    locationMessage.value = null
    return { coordinates, showUserMarker: true }
  } catch {
    locationMessage.value = t('radar.locationUnavailable')
    return { coordinates: HK_CENTER, showUserMarker: false }
  }
}

// Pet coordinates are stored as GeoJSON [lng, lat]; Leaflet expects [lat, lng].
function petLatLng(pet: Pet): [number, number] | null {
  if (pet.coordinates && pet.coordinates.length === 2) {
    return validLatLng(pet.coordinates[1], pet.coordinates[0])
  }
  return null
}

function petIcon(pet: Pet): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="pawradar-pin ${esc(pet.status)}">${imageMarkup(pet.photo, t('pets.photoAlt', { name: pet.name }), 'pawradar-pin-media')}</div>`,
    iconSize: [48, 54],
    iconAnchor: [24, 54],
    popupAnchor: [0, -46],
  })
}

function popupHtml(pet: Pet): string {
  const status = petStatusLabel(pet.status)
  const breed = pet.breed ? `${esc(pet.breed)} · ` : ''
  return `<div class="pawradar-popup">
      ${imageMarkup(pet.photo, t('pets.photoAlt', { name: pet.name }), 'pawradar-popup-media')}
      <div class="pawradar-popup-body">
        <strong>${esc(pet.name)}</strong>
        <span class="pawradar-popup-status ${esc(pet.status)}">${status}</span>
        <p>${breed}${esc(t('radar.distanceAway', { distance: pet.distanceKm }))}</p>
        <button class="pawradar-view" data-id="${esc(pet.id)}">${esc(t('radar.viewDetails'))}</button>
      </div>
    </div>`
}

function renderPets() {
  if (!map || !markersLayer) return
  markersLayer.clearLayers()
  for (const pet of props.pets) {
    const coordinates = petLatLng(pet)
    if (!coordinates) continue

    const marker = L.marker(coordinates, { icon: petIcon(pet) })
    marker.bindPopup(popupHtml(pet), { closeButton: true })
    marker.on('popupopen', () => {
      const popupElement = marker.getPopup()?.getElement()
      bindImageFallback(popupElement)
      const btn = popupElement?.querySelector<HTMLButtonElement>('.pawradar-view')
      if (btn) btn.onclick = () => emit('open', pet)
    })
    marker.on('popupclose', () => {
      const btn = marker.getPopup()?.getElement()?.querySelector<HTMLButtonElement>('.pawradar-view')
      if (btn) btn.onclick = null
    })
    markersLayer.addLayer(marker)
    bindImageFallback(marker.getElement())
  }
}

function strayLatLng(stray: StrayReport): [number, number] | null {
  if (!stray.coordinates) return null
  return validLatLng(stray.coordinates[1], stray.coordinates[0])
}

function strayIcon(stray: StrayReport): L.DivIcon {
  const animal = strayAnimalLabel(stray.species, stray.animalType)
  return L.divIcon({
    className: '',
    html: `<div class="pawradar-stray-pin ${esc(stray.condition)} ${esc(stray.rescueStatus)}">
      ${imageMarkup(stray.photo, t('strays.reportedAlt', { species: animal }), 'pawradar-stray-media')}
      <span>${esc(t('strays.rescuePin'))}</span>
    </div>`,
    iconSize: [50, 62],
    iconAnchor: [25, 62],
    popupAnchor: [0, -54],
  })
}

function strayPopup(stray: StrayReport): string {
  const rescueLabel = rescueStatusLabel(stray.rescueStatus)
  const animal = strayAnimalLabel(stray.species, stray.animalType)
  return `<div class="pawradar-popup">
    ${imageMarkup(stray.photo, t('strays.reportedAlt', { species: animal }), 'pawradar-popup-media')}
    <div class="pawradar-popup-body">
      <strong>${esc(t('strays.needsHelp', { species: animal }))}</strong>
      <span class="pawradar-popup-status ${esc(stray.condition)}">${esc(strayConditionLabel(stray.condition))}</span>
      <p>${esc(stray.location)} · ${esc(rescueLabel)}</p>
      <button class="pawradar-view" data-stray-id="${esc(stray.id)}">${esc(t('strays.viewReport'))}</button>
    </div>
  </div>`
}

function renderStrays() {
  if (!map || !straysLayer) return
  const layer = straysLayer
  layer.clearLayers()
  for (const stray of props.strays ?? []) {
    const coordinates = strayLatLng(stray)
    if (!coordinates) continue
    const marker = L.marker(coordinates, { icon: strayIcon(stray), zIndexOffset: 600 })
    marker.bindPopup(strayPopup(stray), { closeButton: true })
    marker.on('popupopen', () => {
      const popupElement = marker.getPopup()?.getElement()
      bindImageFallback(popupElement)
      const button = popupElement?.querySelector<HTMLButtonElement>('[data-stray-id]')
      if (button) button.onclick = () => emit('open-stray', stray)
    })
    marker.on('popupclose', () => {
      const button = marker.getPopup()?.getElement()?.querySelector<HTMLButtonElement>('[data-stray-id]')
      if (button) button.onclick = null
    })
    marker.addTo(layer)
    bindImageFallback(marker.getElement())
  }
}

function sightingLatLng(sighting: Sighting): [number, number] | null {
  return validLatLng(sighting.coordinates?.[1], sighting.coordinates?.[0])
}

function hotspotLatLng(cell: HotspotCell): [number, number, number] | null {
  const coordinates = validLatLng(cell.coordinates?.[1], cell.coordinates?.[0])
  if (!coordinates) return null
  const intensity = Number(cell.intensity)
  return [coordinates[0], coordinates[1], Number.isFinite(intensity) ? Math.min(1, Math.max(0.1, intensity)) : 0.5]
}

async function ensureHeatPlugin() {
  if (typeof L.heatLayer === 'function') return
  if (!heatPluginPromise) {
    heatPluginPromise = (async () => {
      ;(window as Window & { L?: typeof L }).L = L
      await import('leaflet.heat')
      if (typeof L.heatLayer !== 'function') {
        throw new Error(t('errors.heatmap'))
      }
    })()
  }
  await heatPluginPromise
}

async function renderHeatmap() {
  const request = ++heatRenderRequest
  heatLayer?.remove()
  heatLayer = null
  heatmapError.value = ''
  if (map) {
    for (const layer of [markersLayer, straysLayer]) {
      if (!layer) continue
      if (props.showHeatmap && map.hasLayer(layer)) map.removeLayer(layer)
      if (!props.showHeatmap && !map.hasLayer(layer)) layer.addTo(map)
    }
  }
  if (!map || !props.showHeatmap) return

  const points = (props.heatCells ?? [])
    .map(hotspotLatLng)
    .filter((point): point is [number, number, number] => Boolean(point))
  if (points.length === 0) return

  try {
    await ensureHeatPlugin()
    if (disposed || request !== heatRenderRequest || !map || !props.showHeatmap) return
    heatLayer = L.heatLayer(points, {
      minOpacity: 0.3,
      max: 1,
      maxZoom: 17,
      radius: 28,
      blur: 22,
      gradient: {
        0.2: '#79b7ae',
        0.45: '#1d6360',
        0.7: '#f2a65a',
        1: '#ef6351',
      },
    }).addTo(map)
  } catch (error) {
    if (request !== heatRenderRequest || disposed) return
    if (map) {
      for (const layer of [markersLayer, straysLayer]) {
        if (layer && !map.hasLayer(layer)) layer.addTo(map)
      }
    }
    heatmapError.value = translateApiError(error, 'errors.heatmap')
  }
}

function trajectoryPopup(sighting: Sighting, number: number): string {
  const reportTime = sighting.sightedAt || sighting.createdAt
  const recordedAt = reportTime ? formatDateTime(reportTime) : t('common.unknown')
  return `<div class="pawradar-trajectory-popup">
    <strong>${esc(t('sightings.numbered', { number }))}</strong>
    <span>${esc(sighting.locationName || t('sightings.locationNotProvided'))}</span>
    <time>${esc(recordedAt)}</time>
    ${sighting.note ? `<p>${esc(sighting.note)}</p>` : ''}
  </div>`
}

function renderTrajectory() {
  if (!map || !trajectoryLayer || !trajectoryRouteLayer) return
  const layer = trajectoryLayer
  layer.clearLayers()
  trajectoryRouteLayer.clearLayers()
  trajectoryMarkers.clear()

  const ordered = [...(props.sightings ?? [])]
    .filter((sighting) => sightingLatLng(sighting))
    .sort((a, b) => {
      const aValue = a.sightedAt || a.createdAt
      const bValue = b.sightedAt || b.createdAt
      const aTime = aValue ? new Date(aValue).getTime() : 0
      const bTime = bValue ? new Date(bValue).getTime() : 0
      return aTime - bTime
    })
  const points = ordered.map((sighting) => sightingLatLng(sighting) as [number, number])
  trajectoryPointCount.value = points.length
  if (points.length === 0) trajectoryFitKey = ''

  if (points.length > 1) {
    L.polyline(points, {
      color: '#ef6351',
      weight: 3,
      opacity: 0.72,
      dashArray: '8 10',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(trajectoryRouteLayer)
  }

  ordered.forEach((sighting, index) => {
    const marker = L.marker(points[index], {
      icon: L.divIcon({
        className: '',
        html: `<span class="pawradar-trajectory-marker">${index + 1}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
      }),
      zIndexOffset: 1200,
    })
      .bindPopup(trajectoryPopup(sighting, index + 1))
      .on('click', () => emit('sighting-open', sighting.id))
    trajectoryMarkers.set(sighting.id, marker)
    layer.addLayer(marker)
  })

  const fitKey = ordered
    .map((sighting) => `${sighting.id || sighting.createdAt || ''}:${sighting.coordinates.join(',')}`)
    .join('|')
  if (points.length > 1 && fitKey && fitKey !== trajectoryFitKey) {
    trajectoryFitKey = fitKey
    map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 15 })
  } else if (points.length === 1 && fitKey && fitKey !== trajectoryFitKey) {
    trajectoryFitKey = fitKey
    map.setView(points[0], 15)
  }

  focusSightingMarker(props.focusedSightingId)
}

function focusSightingMarker(sightingId?: string) {
  if (!map || !trajectoryLayer || !sightingId) return
  const marker = trajectoryMarkers.get(sightingId)
  if (!marker) return
  trajectoryLayer.zoomToShowLayer(marker, () => {
    marker.openPopup()
    map?.panTo(marker.getLatLng())
  })
}

function radiusMeters(): number {
  const radiusKm = props.radiusKm ?? 3
  return (Number.isFinite(radiusKm) && radiusKm >= 0 ? radiusKm : 3) * 1000
}

function renderRadius() {
  if (!radiusCircle) return
  radiusCircle.setRadius(radiusMeters())
}

function renderUserMarker(center: [number, number]) {
  if (!map) return
  if (userMarker) userMarker.remove()
  userMarker = L.marker(center, {
    icon: L.divIcon({
      className: '',
      html: '<div class="pawradar-you"><span></span></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
    zIndexOffset: 1000,
  }).addTo(map)
}

function removeUserMarker() {
  userMarker?.remove()
  userMarker = null
}

function applyCenter(center: [number, number], showUserMarker: boolean) {
  if (!map) return
  map.setView(center)
  radiusCircle?.setLatLng(center)
  if (showUserMarker) renderUserMarker(center)
  else removeUserMarker()
}

function scheduleInvalidateSize() {
  if (!map || invalidateFrame !== null) return
  invalidateFrame = window.requestAnimationFrame(() => {
    invalidateFrame = null
    if (!disposed) map?.invalidateSize()
  })
}

async function initialiseMap() {
  const request = ++centerRequest
  const resolved = await resolveCenter()

  // Permission prompts can outlive this component or a newer center update.
  if (disposed || request !== centerRequest || !mapEl.value) return

  const latestSuppliedCenter = propCenter()
  const center = latestSuppliedCenter ?? resolved.coordinates
  const showUserMarker = Boolean(latestSuppliedCenter) || resolved.showUserMarker
  if (latestSuppliedCenter) locationMessage.value = null

  map = L.map(mapEl.value, { center, zoom: 13 })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  markersLayer = L.layerGroup().addTo(map)
  trajectoryRouteLayer = L.layerGroup().addTo(map)
  trajectoryLayer = L.markerClusterGroup({
    maxClusterRadius: 26,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    removeOutsideVisibleBounds: false,
    iconCreateFunction: (cluster) =>
      L.divIcon({
        className: '',
        html: `<span class="pawradar-sighting-cluster" aria-label="${esc(t('sightings.overlapping', { count: cluster.getChildCount() }))}">${cluster.getChildCount()}</span>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      }),
  }).addTo(map)
  straysLayer = props.strays !== undefined
    ? L.markerClusterGroup({
        maxClusterRadius: 42,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster) => L.divIcon({
          className: '',
          html: `<span class="pawradar-sighting-cluster" aria-label="${esc(t('strays.clusterPosts', { count: cluster.getChildCount() }))}">${cluster.getChildCount()}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
      }).addTo(map)
    : L.layerGroup().addTo(map)
  radiusCircle = L.circle(center, {
    radius: radiusMeters(),
    color: '#1d6360',
    weight: 1.5,
    fillColor: '#1d6360',
    fillOpacity: 0.08,
  }).addTo(map)

  if (showUserMarker) renderUserMarker(center)
  renderPets()
  renderTrajectory()
  renderStrays()
  void renderHeatmap()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleInvalidateSize)
    resizeObserver.observe(mapEl.value)
  }
  scheduleInvalidateSize()
}

onMounted(() => {
  void initialiseMap()
})

watch(() => props.pets, () => renderPets(), { deep: true })
watch(() => props.sightings, () => renderTrajectory(), { deep: true })
watch(() => props.focusedSightingId, (id) => focusSightingMarker(id))
watch(() => props.strays, () => renderStrays(), { deep: true })
watch(locale, () => {
  renderPets()
  renderTrajectory()
  renderStrays()
})
watch([() => props.heatCells, () => props.showHeatmap], () => void renderHeatmap(), { deep: true })
watch(() => props.radiusKm, () => renderRadius())
watch(
  () => props.center,
  (c) => {
    const center = c ? validLatLng(c.lat, c.lng) : null
    if (!center) return

    locationMessage.value = null
    // initialiseMap re-reads the prop after geolocation resolves.
    if (!map) return

    centerRequest += 1
    applyCenter(center, true)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  disposed = true
  centerRequest += 1
  heatRenderRequest += 1
  resizeObserver?.disconnect()
  resizeObserver = null
  if (invalidateFrame !== null) {
    window.cancelAnimationFrame(invalidateFrame)
    invalidateFrame = null
  }
  map?.remove()
  map = null
  markersLayer = null
  trajectoryLayer = null
  trajectoryRouteLayer = null
  trajectoryMarkers.clear()
  straysLayer = null
  radiusCircle = null
  userMarker = null
  heatLayer = null
})
</script>

<style scoped>
.map-wrap {
  position: relative;
  z-index: 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

.location-notice {
  position: absolute;
  z-index: 500;
  right: 12px;
  bottom: 12px;
  left: 12px;
  margin: 0;
  padding: 9px 12px;
  border: 1px solid rgba(239, 99, 81, 0.35);
  border-radius: var(--radius-lg);
  background: rgba(252, 249, 242, 0.96);
  color: var(--color-text-accent);
  font-size: 12px;
  font-weight: 700;
  box-shadow: var(--shadow-card);
}

.heatmap-notice {
  position: absolute;
  z-index: 500;
  top: 12px;
  right: 12px;
  left: 12px;
  margin: 0;
  padding: 9px 12px;
  border: 1px solid rgba(239, 99, 81, 0.35);
  border-radius: var(--radius-lg);
  background: rgba(252, 249, 242, 0.96);
  color: var(--color-text-urgent);
  font-size: 12px;
  font-weight: 700;
  box-shadow: var(--shadow-card);
}

.trajectory-empty {
  position: absolute;
  z-index: 500;
  right: 12px;
  bottom: 12px;
  left: 12px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(252, 249, 242, 0.96);
  color: var(--color-text-accent);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  box-shadow: var(--shadow-card);
}

.leaflet-map {
  width: 100%;
  height: 420px;
  position: relative;
  z-index: 0;
  background: #e8f0ec;
}
</style>

<style>
/* Leaflet injects marker/popup HTML dynamically, so scoped styles can't reach it. */
.pawradar-pin {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pawradar-pin-media {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #ef6351;
  box-shadow: 0 4px 10px rgba(61, 56, 53, 0.3);
  background: #fcf9f2;
}

.pawradar-pin-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pawradar-pin::after {
  content: '';
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #ef6351;
  margin-top: -2px;
}

.pawradar-pin.sighted .pawradar-pin-media {
  border-color: #1d6360;
}

.pawradar-pin.sighted::after {
  border-top-color: #1d6360;
}

.pawradar-stray-pin {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pawradar-stray-media {
  position: relative;
  width: 46px;
  height: 46px;
  overflow: hidden;
  border: 3px solid #ef6351;
  border-radius: 16px;
  background: #fcf9f2;
  box-shadow: 0 5px 14px rgba(61, 56, 53, 0.3);
}

.pawradar-stray-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pawradar-stray-pin > span {
  margin-top: -2px;
  padding: 2px 7px;
  border: 2px solid #fcf9f2;
  border-radius: 999px;
  background: #ef6351;
  color: var(--color-text-on-coral);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.05em;
}

.pawradar-stray-pin.rescued .pawradar-stray-media {
  border-color: #1d6360;
}

.pawradar-stray-pin.rescued > span {
  background: #1d6360;
}

.pawradar-popup-status.healthy,
.pawradar-popup-status.unknown {
  background: #1d6360;
}

.pawradar-popup-status.injured,
.pawradar-popup-status.critical {
  background: #ef6351;
  color: var(--color-text-on-coral);
}

.pawradar-you {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1d6360;
  border: 3px solid #fff;
  box-shadow: 0 0 0 4px rgba(29, 99, 96, 0.25);
  display: grid;
  place-items: center;
}

.pawradar-you span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}

.pawradar-popup {
  display: flex;
  gap: 10px;
  min-width: 180px;
}

.pawradar-popup-media {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
  background: #fcf9f2;
  flex-shrink: 0;
}

.pawradar-popup-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pawradar-image-fallback {
  position: absolute;
  inset: 0;
  display: none;
  place-items: center;
  background:
    radial-gradient(circle at 50% 42%, rgba(29, 99, 96, 0.14), transparent 40%),
    #fcf9f2;
  color: rgba(29, 99, 96, 0.58);
}

.pawradar-media.is-placeholder .pawradar-image-fallback {
  display: grid;
}

.pawradar-image-fallback svg {
  width: 58%;
  height: 58%;
  fill: currentColor;
}

.pawradar-popup-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pawradar-popup-body strong {
  font-size: 14px;
  color: var(--color-text-primary);
}

.pawradar-popup-status {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  align-self: flex-start;
  padding: 1px 8px;
  border-radius: 999px;
  color: #fff;
}

.pawradar-popup-status.lost {
  background: #ef6351;
  color: var(--color-text-on-coral);
}

.pawradar-popup-status.sighted {
  background: #1d6360;
}

.pawradar-popup-body p {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 2px 0 6px;
}

.pawradar-view {
  padding: 7px 12px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  border: none;
}

.pawradar-view:hover {
  background: #16504e;
}

.pawradar-trajectory-marker {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 3px solid #fcf9f2;
  border-radius: 50%;
  background: #ef6351;
  color: var(--color-text-on-coral);
  box-shadow: 0 4px 12px rgba(61, 56, 53, 0.28);
  font-size: 12px;
  font-weight: 800;
}

.pawradar-sighting-cluster {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 4px solid #fcf9f2;
  border-radius: 50%;
  background: #1d6360;
  color: #fff;
  box-shadow: 0 5px 15px rgba(29, 99, 96, 0.34);
  font-size: 13px;
  font-weight: 900;
}

.pawradar-trajectory-popup {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 160px;
  color: var(--color-text-primary);
}

.pawradar-trajectory-popup strong {
  color: var(--color-text-urgent);
  font-size: 13px;
}

.pawradar-trajectory-popup span,
.pawradar-trajectory-popup time,
.pawradar-trajectory-popup p {
  font-size: 12px;
}

.pawradar-trajectory-popup time {
  color: var(--color-text-muted);
}

.pawradar-trajectory-popup p {
  margin: 3px 0 0;
  line-height: 1.4;
}
</style>
