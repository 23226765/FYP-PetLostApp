<template>
  <div class="map-wrap">
    <div
      ref="mapEl"
      class="leaflet-map"
      role="application"
      :aria-label="showHeatmap ? 'Interactive animal report hotspot heatmap' : strays?.length ? 'Interactive map of nearby stray rescue reports' : 'Interactive map of nearby missing pets'"
    ></div>
    <p v-if="heatmapError" class="heatmap-notice" role="alert">
      {{ heatmapError }}
    </p>
    <p v-if="locationMessage" class="location-notice" role="status">
      {{ locationMessage }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Pet, Sighting } from '../types/pet'
import type { StrayReport } from '../types/stray'
import type { HotspotPoint } from '../types/analytics'
import { getCurrentLocation } from '../services/geolocation'

const props = defineProps<{
  pets: Pet[]
  center?: { lat: number; lng: number } | null
  radiusKm?: number
  sightings?: Sighting[]
  strays?: StrayReport[]
  heatPoints?: HotspotPoint[]
  showHeatmap?: boolean
}>()

const emit = defineEmits<{ open: [pet: Pet]; 'open-stray': [stray: StrayReport] }>()

const mapEl = ref<HTMLElement | null>(null)

let map: L.Map | null = null
let markersLayer: L.LayerGroup | null = null
let trajectoryLayer: L.LayerGroup | null = null
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

const locationMessage = ref<string | null>(null)
const heatmapError = ref('')

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
    locationMessage.value = 'Location unavailable. Showing the default Hong Kong area.'
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
    html: `<div class="pawradar-pin ${esc(pet.status)}">${imageMarkup(pet.photo, `Photo of ${pet.name}`, 'pawradar-pin-media')}</div>`,
    iconSize: [48, 54],
    iconAnchor: [24, 54],
    popupAnchor: [0, -46],
  })
}

function popupHtml(pet: Pet): string {
  const status = pet.status === 'lost' ? 'LOST' : 'SIGHTED'
  return `<div class="pawradar-popup">
      ${imageMarkup(pet.photo, `Photo of ${pet.name}`, 'pawradar-popup-media')}
      <div class="pawradar-popup-body">
        <strong>${esc(pet.name)}</strong>
        <span class="pawradar-popup-status ${esc(pet.status)}">${status}</span>
        <p>${esc(pet.breed)} · ${pet.distanceKm} km away</p>
        <button class="pawradar-view" data-id="${esc(pet.id)}">View Details</button>
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
  return L.divIcon({
    className: '',
    html: `<div class="pawradar-stray-pin ${esc(stray.condition)} ${esc(stray.rescueStatus)}">
      ${imageMarkup(stray.photo, `Reported stray ${stray.species}`, 'pawradar-stray-media')}
      <span>RESCUE</span>
    </div>`,
    iconSize: [50, 62],
    iconAnchor: [25, 62],
    popupAnchor: [0, -54],
  })
}

function strayPopup(stray: StrayReport): string {
  const rescueLabel = stray.rescueStatus.replace(/_/g, ' ')
  return `<div class="pawradar-popup">
    ${imageMarkup(stray.photo, `Reported stray ${stray.species}`, 'pawradar-popup-media')}
    <div class="pawradar-popup-body">
      <strong>${esc(stray.species)} needs help</strong>
      <span class="pawradar-popup-status ${esc(stray.condition)}">${esc(stray.condition.toUpperCase())}</span>
      <p>${esc(stray.location)} · ${esc(rescueLabel)}</p>
      <button class="pawradar-view" data-stray-id="${esc(stray.id)}">View rescue report</button>
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

function hotspotLatLng(point: HotspotPoint): [number, number, number] | null {
  const coordinates = validLatLng(point.coordinates?.[1], point.coordinates?.[0])
  if (!coordinates) return null
  const intensity = Number(point.intensity)
  return [coordinates[0], coordinates[1], Number.isFinite(intensity) ? Math.min(1, Math.max(0.1, intensity)) : 0.5]
}

async function ensureHeatPlugin() {
  if (typeof L.heatLayer === 'function') return
  if (!heatPluginPromise) {
    heatPluginPromise = (async () => {
      ;(window as Window & { L?: typeof L }).L = L
      await import('leaflet.heat')
      if (typeof L.heatLayer !== 'function') {
        throw new Error('The heatmap renderer could not be initialized.')
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

  const points = (props.heatPoints ?? [])
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
    heatmapError.value =
      error instanceof Error ? error.message : 'The hotspot layer could not be displayed.'
  }
}

function trajectoryPopup(sighting: Sighting, number: number): string {
  const recordedAt = sighting.createdAt
    ? new Date(sighting.createdAt).toLocaleString()
    : 'Time unavailable'
  return `<div class="pawradar-trajectory-popup">
    <strong>Sighting ${number}</strong>
    <span>${esc(sighting.locationName || 'Location not provided')}</span>
    <time>${esc(recordedAt)}</time>
    ${sighting.note ? `<p>${esc(sighting.note)}</p>` : ''}
  </div>`
}

function renderTrajectory() {
  if (!map || !trajectoryLayer) return
  const layer = trajectoryLayer
  layer.clearLayers()

  const ordered = [...(props.sightings ?? [])]
    .filter((sighting) => sightingLatLng(sighting))
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return aTime - bTime
    })
  const points = ordered.map((sighting) => sightingLatLng(sighting) as [number, number])

  if (points.length > 1) {
    L.polyline(points, {
      color: '#ef6351',
      weight: 4,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer)
  }

  ordered.forEach((sighting, index) => {
    L.marker(points[index], {
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
      .addTo(layer)
  })

  const fitKey = ordered
    .map((sighting) => `${sighting.id || sighting.createdAt || ''}:${sighting.coordinates.join(',')}`)
    .join('|')
  if (points.length > 1 && fitKey && fitKey !== trajectoryFitKey) {
    trajectoryFitKey = fitKey
    map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 15 })
  }
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
  trajectoryLayer = L.layerGroup().addTo(map)
  straysLayer = L.layerGroup().addTo(map)
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
watch(() => props.strays, () => renderStrays(), { deep: true })
watch([() => props.heatPoints, () => props.showHeatmap], () => void renderHeatmap(), { deep: true })
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
  color: #1d6360;
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
  color: #ef6351;
  font-size: 12px;
  font-weight: 700;
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
  color: #fff;
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
  color: #3d3835;
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
}

.pawradar-popup-status.sighted {
  background: #1d6360;
}

.pawradar-popup-body p {
  font-size: 12px;
  color: #8b827a;
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
  color: #fff;
  box-shadow: 0 4px 12px rgba(61, 56, 53, 0.28);
  font-size: 12px;
  font-weight: 800;
}

.pawradar-trajectory-popup {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 160px;
  color: #3d3835;
}

.pawradar-trajectory-popup strong {
  color: #ef6351;
  font-size: 13px;
}

.pawradar-trajectory-popup span,
.pawradar-trajectory-popup time,
.pawradar-trajectory-popup p {
  font-size: 12px;
}

.pawradar-trajectory-popup time {
  color: #8b827a;
}

.pawradar-trajectory-popup p {
  margin: 3px 0 0;
  line-height: 1.4;
}
</style>
