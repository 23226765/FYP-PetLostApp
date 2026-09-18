<template>
  <section class="location-picker" aria-labelledby="sighting-location-title">
    <header class="location-heading">
      <div>
        <span class="required-label">Required</span>
        <h3 id="sighting-location-title">{{ title }}</h3>
      </div>
      <button
        v-if="modelValue"
        class="change-location"
        type="button"
        @click="changeLocation"
      >
        Change location
      </button>
    </header>

    <p class="location-guidance">
      Select the exact sighting point—not a location mentioned in your description. Avoid
      selecting your home unless the pet was genuinely seen there.
    </p>

    <div
      ref="mapElement"
      class="picker-map"
      role="application"
      aria-label="Select the pet sighting location on the map"
    />

    <button
      class="current-location"
      type="button"
      :disabled="locating"
      @click="useCurrentLocation"
    >
      <AppIcon name="pin" :size="18" />
      {{ locating ? 'Finding your location…' : 'Use my current location' }}
    </button>

    <div class="coordinate-fields" aria-label="Fine tune sighting coordinates">
      <label>
        <span>Latitude</span>
        <input
          v-model="latitudeInput"
          inputmode="decimal"
          autocomplete="off"
          placeholder="22.3193"
          @change="applyCoordinateInputs"
        />
      </label>
      <label>
        <span>Longitude</span>
        <input
          v-model="longitudeInput"
          inputmode="decimal"
          autocomplete="off"
          placeholder="114.1694"
          @change="applyCoordinateInputs"
        />
      </label>
    </div>

    <p v-if="locationError" class="location-message error" role="alert">
      {{ locationError }}
    </p>
    <p v-else-if="draftLocation" class="location-summary" role="status">
      <strong>{{ modelValue ? 'Confirmed sighting point' : 'Selected point—confirm to continue' }}</strong>
      <span>{{ formattedCoordinates }}</span>
    </p>
    <p v-else class="location-message" role="status">
      Tap the map, use your current location, or enter coordinates. The map centre is not
      submitted automatically.
    </p>

    <button
      class="confirm-location"
      type="button"
      :disabled="!draftLocation || Boolean(modelValue)"
      @click="confirmLocation"
    >
      <AppIcon name="check" :size="18" />
      {{ modelValue ? 'Location confirmed' : 'Confirm sighting location' }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getCurrentLocation } from '../services/geolocation'
import AppIcon from './AppIcon.vue'

type CoordinatePair = [number, number]

const props = defineProps<{
  modelValue: CoordinatePair | null
  initialCenter?: CoordinatePair | null
  title?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [coordinates: CoordinatePair | null]
}>()

const HONG_KONG_CENTER: CoordinatePair = [114.1694, 22.3193]
const title = computed(() => props.title || 'Where did you see the pet?')
const mapElement = ref<HTMLElement | null>(null)
const draftLocation = ref<CoordinatePair | null>(props.modelValue)
const longitudeInput = ref(props.modelValue ? String(props.modelValue[0]) : '')
const latitudeInput = ref(props.modelValue ? String(props.modelValue[1]) : '')
const locating = ref(false)
const locationError = ref('')

let map: L.Map | null = null
let marker: L.Marker | null = null

const formattedCoordinates = computed(() => {
  if (!draftLocation.value) return ''
  return `${draftLocation.value[1].toFixed(5)}, ${draftLocation.value[0].toFixed(5)}`
})

function validCoordinates(value: unknown): value is CoordinatePair {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  )
}

function markerIcon() {
  return L.divIcon({
    className: '',
    html: '<span class="pawradar-sighting-picker-pin" aria-hidden="true"></span>',
    iconSize: [34, 42],
    iconAnchor: [17, 42],
  })
}

function renderMarker(centerMap = false) {
  if (!map || !draftLocation.value) return
  const latLng: L.LatLngExpression = [draftLocation.value[1], draftLocation.value[0]]
  if (!marker) {
    marker = L.marker(latLng, { draggable: true, icon: markerIcon() }).addTo(map)
    marker.on('dragend', () => {
      const position = marker?.getLatLng()
      if (position) selectDraft([position.lng, position.lat], false)
    })
  } else {
    marker.setLatLng(latLng)
  }
  if (centerMap) map.setView(latLng, Math.max(map.getZoom(), 16))
}

function selectDraft(coordinates: CoordinatePair, centerMap = true) {
  if (!validCoordinates(coordinates)) return
  draftLocation.value = coordinates
  longitudeInput.value = coordinates[0].toFixed(6)
  latitudeInput.value = coordinates[1].toFixed(6)
  locationError.value = ''
  if (props.modelValue) emit('update:modelValue', null)
  renderMarker(centerMap)
}

function applyCoordinateInputs() {
  const longitude = Number(longitudeInput.value)
  const latitude = Number(latitudeInput.value)
  const coordinates: CoordinatePair = [longitude, latitude]
  if (
    !longitudeInput.value.trim() ||
    !latitudeInput.value.trim() ||
    !validCoordinates(coordinates)
  ) {
    locationError.value = 'Enter a valid longitude and latitude before confirming.'
    return
  }
  selectDraft(coordinates)
}

async function useCurrentLocation() {
  if (locating.value) return
  locating.value = true
  locationError.value = ''
  try {
    const { lng, lat } = await getCurrentLocation()
    const coordinates: CoordinatePair = [lng, lat]
    if (!validCoordinates(coordinates)) throw new Error('Invalid location coordinates')
    selectDraft(coordinates)
  } catch {
    locationError.value =
      'Current location is unavailable or permission was denied. Select the point manually on the map.'
  } finally {
    locating.value = false
  }
}

function confirmLocation() {
  if (!draftLocation.value) {
    locationError.value = 'Select a sighting location before continuing.'
    return
  }
  emit('update:modelValue', [...draftLocation.value] as CoordinatePair)
}

function changeLocation() {
  emit('update:modelValue', null)
  locationError.value = ''
  marker?.dragging?.enable()
}

function initializeMap() {
  if (!mapElement.value) return
  const displayCenter = validCoordinates(props.modelValue)
    ? props.modelValue
    : validCoordinates(props.initialCenter)
      ? props.initialCenter
      : HONG_KONG_CENTER
  map = L.map(mapElement.value, {
    center: [displayCenter[1], displayCenter[0]],
    zoom: props.modelValue ? 16 : 13,
  })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  map.on('click', (event: L.LeafletMouseEvent) => {
    selectDraft([event.latlng.lng, event.latlng.lat], false)
  })
  renderMarker()
  window.requestAnimationFrame(() => map?.invalidateSize())
}

watch(
  () => props.modelValue,
  (coordinates) => {
    if (!validCoordinates(coordinates)) return
    draftLocation.value = [...coordinates]
    longitudeInput.value = coordinates[0].toFixed(6)
    latitudeInput.value = coordinates[1].toFixed(6)
    renderMarker()
  },
)

onMounted(initializeMap)

onBeforeUnmount(() => {
  marker?.off()
  marker = null
  map?.remove()
  map = null
})
</script>

<style scoped>
.location-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(29, 99, 96, 0.16);
  border-radius: 16px;
  background: rgba(252, 249, 242, 0.72);
}

.location-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.location-heading h3 {
  margin-top: 3px;
  color: #3d3835;
  font-size: 15px;
  line-height: 1.3;
}

.required-label {
  color: #ef6351;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.change-location {
  min-height: 38px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(29, 99, 96, 0.1);
  color: #1d6360;
  font-size: 11.5px;
  font-weight: 800;
}

.location-guidance,
.location-message,
.location-summary {
  margin: 0;
  color: #756e68;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.5;
}

.picker-map {
  width: 100%;
  height: 230px;
  overflow: hidden;
  border-radius: 14px;
  background: #e8f0ec;
}

.current-location,
.confirm-location {
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
}

.current-location {
  border: 1px solid rgba(29, 99, 96, 0.18);
  background: #fff;
  color: #1d6360;
}

.confirm-location {
  background: #1d6360;
  color: #fff;
  box-shadow: 0 7px 18px rgba(29, 99, 96, 0.2);
}

.current-location:not(:disabled):active,
.confirm-location:not(:disabled):active,
.change-location:active {
  transform: scale(0.98);
}

.current-location:disabled,
.confirm-location:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
}

.coordinate-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.coordinate-fields label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #756e68;
  font-size: 10.5px;
  font-weight: 800;
}

.coordinate-fields input {
  width: 100%;
  min-height: 42px;
  padding: 0 10px;
  border: 1.5px solid rgba(29, 99, 96, 0.16);
  border-radius: 11px;
  background: #fff;
  color: #3d3835;
  font: inherit;
}

.coordinate-fields input:focus {
  border-color: #1d6360;
  outline: 3px solid rgba(29, 99, 96, 0.14);
}

.location-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(29, 99, 96, 0.08);
  color: #1d6360;
}

.location-summary strong {
  font-size: 12px;
}

.location-message.error {
  color: #ef6351;
}
</style>

<style>
.pawradar-sighting-picker-pin {
  position: relative;
  display: block;
  width: 34px;
  height: 34px;
  border: 4px solid #fcf9f2;
  border-radius: 50% 50% 50% 0;
  background: #ef6351;
  box-shadow: 0 6px 16px rgba(61, 56, 53, 0.3);
  transform: rotate(-45deg);
}

.pawradar-sighting-picker-pin::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: #fff;
}
</style>
