<template>
  <div class="map-wrap">
    <div
      ref="mapEl"
      class="leaflet-map"
      role="application"
      aria-label="Interactive map of nearby missing pets"
    ></div>
    <p v-if="locationMessage" class="location-notice" role="status">
      {{ locationMessage }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Pet } from '../data/pets'
import { getCurrentLocation } from '../services/geolocation'

const props = defineProps<{
  pets: Pet[]
  center?: { lat: number; lng: number } | null
  radiusKm?: number
}>()

const emit = defineEmits<{ open: [pet: Pet] }>()

const mapEl = ref<HTMLElement | null>(null)

let map: L.Map | null = null
let markersLayer: L.LayerGroup | null = null
let radiusCircle: L.Circle | null = null
let userMarker: L.Marker | null = null
let resizeObserver: ResizeObserver | null = null
let invalidateFrame: number | null = null
let disposed = false
let centerRequest = 0

const locationMessage = ref<string | null>(null)

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
  radiusCircle = L.circle(center, {
    radius: radiusMeters(),
    color: '#1d6360',
    weight: 1.5,
    fillColor: '#1d6360',
    fillOpacity: 0.08,
  }).addTo(map)

  if (showUserMarker) renderUserMarker(center)
  renderPets()

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
  resizeObserver?.disconnect()
  resizeObserver = null
  if (invalidateFrame !== null) {
    window.cancelAnimationFrame(invalidateFrame)
    invalidateFrame = null
  }
  map?.remove()
  map = null
  markersLayer = null
  radiusCircle = null
  userMarker = null
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
</style>
