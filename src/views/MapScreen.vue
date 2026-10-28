<template>
  <section class="discovery-map" :aria-label="t('discoveryMap.title')">
    <header class="map-heading">
      <div><h1>{{ t('discoveryMap.title') }}</h1><p>{{ t('mapViewport.coverage') }}</p></div>
      <button type="button" :disabled="loading" @click="load()"><AppIcon name="radar" :size="19" />{{ t('discoveryMap.refresh') }}</button>
    </header>
    <div class="map-canvas" :aria-busy="loading">
      <MapView v-if="active" :pets="[]" :discovery-pets="markers" :cluster-pets="true" :fill-height="true"
        :show-user-location="false" :show-radius="false" :center="cameraCenter" :initial-zoom="view.zoom"
        :initial-bounds="hasView ? undefined : SUPPORTED_MAP_BOUNDS"
        @view-change="changeView" @open-marker="emit('open-pet', $event)" />
      <button class="search-area" type="button" :disabled="loading" @click="searchHere"><AppIcon name="pin" :size="17" />{{ t('discoveryMap.searchHere') }}</button>
      <div class="map-feedback" aria-live="polite">
        <p v-if="loading" role="status">{{ t('discoveryMap.loading') }}</p>
        <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="load(page === 0)">{{ t('common.retry') }}</button></div>
        <p v-else-if="!queryBounds">{{ t('mapViewport.outside') }}</p>
        <p v-else-if="!markers.length">{{ t('mapStatus.empty') }}</p>
        <template v-else><p>{{ t('mapViewport.loaded', { count: markers.length, total }) }}</p><button v-if="hasMore && page < 10000" type="button" @click="load(false)">{{ t('discoveryMap.more') }}</button><p v-else-if="hasMore">{{ t('mapViewport.zoomIn') }}</p></template>
      </div>
    </div>
    <AreaInsightsCard :insights="insights" :loading="loading" :failed="Boolean(error) || !queryBounds" />
    <p class="map-disclaimer">{{ t('discoveryMap.history') }}</p>
  </section>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import MapView from '../components/MapView.vue'
import AreaInsightsCard from '../components/AreaInsightsCard.vue'
import AppIcon from '../components/AppIcon.vue'
import { getMapPets } from '../services/api'
import type { AreaInsights, MapPetMarker, MapBounds, MapViewChange } from '../types/pet'
import { MAP_OVERVIEW_CENTER, SUPPORTED_MAP_BOUNDS, sameMapBounds, supportedViewport } from '../utils/mapViewport'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import { translateApiError, useAppI18n } from '../i18n'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ 'open-pet': [id: string] }>()
const { t } = useAppI18n()
const cameraCenter = ref({ ...MAP_OVERVIEW_CENTER })
const view = ref<MapViewChange>({ ...MAP_OVERVIEW_CENTER, zoom: 10, bounds: { ...SUPPORTED_MAP_BOUNDS } })
const hasView = ref(false), hasLoaded = ref(false)
const queryBounds = ref<MapBounds | null>({ ...SUPPORTED_MAP_BOUNDS })
const markers = ref<MapPetMarker[]>([])
const insights = ref<AreaInsights | null>(null)
const loading = ref(false), error = ref(''), page = ref(0), total = ref(0), hasMore = ref(false)
let sequence = 0, disposed = false
let controller: AbortController | null = null
let moveTimer: ReturnType<typeof setTimeout> | undefined
function invalidate() { sequence++; clearTimeout(moveTimer); moveTimer = undefined; controller?.abort(); controller = null; loading.value = false }
function clear() { invalidate(); markers.value = []; insights.value = null; page.value = 0; total.value = 0; hasMore.value = false; error.value = ''; hasLoaded.value = false }
async function load(reset = true) {
  if (!props.active || disposed || !queryBounds.value || (!reset && page.value >= 10000)) return
  invalidate()
  if (reset) { markers.value = []; insights.value = null; page.value = 0; total.value = 0; hasMore.value = false }
  const request = ++sequence, context = captureAuthContext()
  const active = () => !disposed && props.active && request === sequence && isAuthContextCurrent(context)
  const abort = new AbortController(); controller = abort
  loading.value = true; error.value = ''
  try {
    const result = await getMapPets({ ...queryBounds.value, page: page.value + 1, limit: 100 }, abort.signal)
    if (!active()) return
    const byId = new Map(markers.value.map(marker => [marker.id, marker]))
    result.markers.forEach(marker => byId.set(marker.id, marker))
    markers.value = [...byId.values()]; page.value = result.pagination.page
    total.value = result.pagination.total; hasMore.value = result.pagination.hasMore
    insights.value = result.insights || null
    hasLoaded.value = true
  } catch (cause) {
    if (active() && !abort.signal.aborted) {
      const summary = t('mapStatus.markersFailed')
      const detail = translateApiError(cause, 'mapStatus.markersFailed')
      error.value = detail === summary ? summary : `${summary} ${detail}`
    }
  }
  finally { if (active()) loading.value = false }
}
function searchHere() { clear(); queryBounds.value = supportedViewport(view.value.bounds); if (queryBounds.value) void load() }
function changeView(next: MapViewChange) {
  view.value = next; hasView.value = true
  // Initial fit/restore reports camera state; it must not reset retained pages.
  if (next.initial) return
  const bounds = supportedViewport(next.bounds)
  if (sameMapBounds(bounds, queryBounds.value)) return
  clear(); queryBounds.value = bounds
  if (props.active && bounds) { loading.value = true; moveTimer = setTimeout(() => { moveTimer = undefined; void load() }, 300) }
}
watch(() => props.active, active => {
  invalidate()
  if (active) { cameraCenter.value = { lat: view.value.lat, lng: view.value.lng }; if (!hasLoaded.value && !error.value) void load() }
}, { immediate: true })
function refreshContext() { clear(); if (props.active) void load() }
window.addEventListener('auth:changed', refreshContext)
window.addEventListener('auth:unauthorized', refreshContext)
onBeforeUnmount(() => { disposed = true; invalidate(); window.removeEventListener('auth:changed', refreshContext); window.removeEventListener('auth:unauthorized', refreshContext) })
</script>
<style scoped>
.discovery-map { height: calc(100dvh - 90px - var(--safe-bottom)); min-height: 0; overflow-y: auto; overscroll-behavior: contain; max-width: 480px; margin: auto; display: flex; flex-direction: column; background: var(--page-bg); }
.map-heading { display: flex; align-items: center; gap: 10px; justify-content: space-between; padding: calc(12px + var(--safe-top)) 16px 10px; }
h1 { font-size: 23px; color: var(--color-text-primary); }
.map-heading p,.map-disclaimer { font-size: 11px; color: var(--color-text-secondary); line-height: 1.4; }
button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border-radius: 14px; background: var(--color-surface-selected); color: var(--color-text-accent); font-weight: 750; }
button:focus-visible { outline: 3px solid var(--color-border-accent); outline-offset: 2px; }
button:disabled { opacity: .6; cursor: wait; }
.map-canvas { position: relative; flex: 1; min-height: 220px; }
.search-area { position: absolute; z-index: 600; top: 10px; left: 50%; transform: translateX(-50%); white-space: nowrap; box-shadow: var(--shadow-card); }
.map-feedback { position: absolute; z-index: 600; bottom: 12px; left: 12px; right: 12px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface-elevated); color: var(--color-text-primary); box-shadow: var(--shadow-card); font-size: 12px; }
.map-feedback button { margin-top: 5px; }
.map-disclaimer { padding: 7px 14px; flex-shrink: 0; }
</style>
