<template>
  <div class="map-wrap">
    <div
      ref="mapEl"
      class="leaflet-map"
      role="application"
      aria-label="Interactive map of nearby missing pets"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Pet } from '../data/pets'

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

const HK_CENTER: [number, number] = [22.2825, 114.1897]

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resolveCenter(): Promise<[number, number]> {
  return new Promise((resolve) => {
    if (props.center) return resolve([props.center.lat, props.center.lng])
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
        () => resolve(HK_CENTER),
        { timeout: 5000 },
      )
    } else {
      resolve(HK_CENTER)
    }
  })
}

// Pet coordinates are stored as GeoJSON [lng, lat]; Leaflet expects [lat, lng].
function petLatLng(pet: Pet): [number, number] {
  if (pet.coordinates && pet.coordinates.length === 2) {
    return [pet.coordinates[1], pet.coordinates[0]]
  }
  return HK_CENTER
}

function petIcon(pet: Pet): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="pawradar-pin ${esc(pet.status)}"><img src="${esc(pet.photo)}" alt="${esc(pet.name)}" /></div>`,
    iconSize: [48, 54],
    iconAnchor: [24, 54],
    popupAnchor: [0, -46],
  })
}

function popupHtml(pet: Pet): string {
  const status = pet.status === 'lost' ? 'LOST' : 'SIGHTED'
  return `<div class="pawradar-popup">
      <img src="${esc(pet.photo)}" alt="${esc(pet.name)}" />
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
    const marker = L.marker(petLatLng(pet), { icon: petIcon(pet) })
    marker.bindPopup(popupHtml(pet), { closeButton: true })
    marker.on('popupopen', () => {
      const btn = mapEl.value?.querySelector(`.pawradar-view[data-id="${esc(pet.id)}"]`)
      btn?.addEventListener('click', () => emit('open', pet))
    })
    markersLayer.addLayer(marker)
  }
}

function renderRadius() {
  if (!radiusCircle) return
  radiusCircle.setRadius((props.radiusKm ?? 3) * 1000)
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

onMounted(async () => {
  if (!mapEl.value) return
  const center = await resolveCenter()

  map = L.map(mapEl.value, { center, zoom: 13 })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  markersLayer = L.layerGroup().addTo(map)
  radiusCircle = L.circle(center, {
    radius: (props.radiusKm ?? 3) * 1000,
    color: '#1d6360',
    weight: 1.5,
    fillColor: '#1d6360',
    fillOpacity: 0.08,
  }).addTo(map)

  renderUserMarker(center)
  renderPets()

  setTimeout(() => map?.invalidateSize(), 0)
})

watch(() => props.pets, () => renderPets())
watch(() => props.radiusKm, () => renderRadius())
watch(
  () => props.center,
  (c) => {
    if (!c || !map) return
    const latlng: [number, number] = [c.lat, c.lng]
    map.setView(latlng)
    renderUserMarker(latlng)
    radiusCircle?.setLatLng(latlng)
  },
)

onBeforeUnmount(() => {
  map?.remove()
  map = null
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

.pawradar-pin img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #ef6351;
  box-shadow: 0 4px 10px rgba(61, 56, 53, 0.3);
  background: #fff;
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

.pawradar-pin.sighted img {
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

.pawradar-popup img {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
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
