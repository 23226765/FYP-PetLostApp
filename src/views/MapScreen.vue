<template>
  <section class="discovery-map" :aria-label="t('discoveryMap.title')">
    <header class="map-heading" :inert="insightsOpen" :aria-hidden="insightsOpen || undefined">
      <div><h1>{{ t('discoveryMap.title') }}</h1><p>{{ t('mapViewport.coverage') }}</p></div>
      <button type="button" :disabled="loading" @click="load()"><AppIcon name="radar" :size="19" />{{ t('discoveryMap.refresh') }}</button>
    </header>
    <div class="map-canvas" :aria-busy="loading">
      <div class="map-background" :inert="insightsOpen" :aria-hidden="insightsOpen || undefined">
        <MapView v-if="active" :pets="[]" :discovery-pets="markers" :cluster-pets="true" :fill-height="true"
          :show-user-location="false" :show-radius="false" :center="cameraCenter" :initial-zoom="view.zoom"
          :initial-bounds="hasView ? undefined : SUPPORTED_MAP_BOUNDS"
          @view-change="changeView" @open-marker="emit('open-pet', $event)" />
        <button class="search-area" type="button" :disabled="loading" @click="searchHere"><AppIcon name="pin" :size="17" />{{ t('discoveryMap.searchHere') }}</button>
        <div class="map-summary">
          <button ref="insightsTrigger" class="insights-trigger" type="button" aria-haspopup="dialog" :aria-expanded="insightsOpen" :aria-controls="insightsId" @click="openInsights">
            <AppIcon name="radar" :size="18" /><span>{{ t('areaInsights.title') }}</span>
            <span v-if="insights && !loading && !error && queryBounds" class="insights-count">{{ t('areaInsights.reportCount', { count: number(insights.total) }, insights.total) }}</span>
            <AppIcon name="chevron" :size="16" />
          </button>
          <div class="map-feedback" aria-live="polite">
            <p v-if="loading" role="status">{{ t('discoveryMap.loading') }}</p>
            <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="load(page === 0)">{{ t('common.retry') }}</button></div>
            <p v-else-if="!queryBounds">{{ t('mapViewport.outside') }}</p>
            <p v-else-if="!markers.length">{{ t('mapStatus.empty') }}</p>
            <template v-else><p>{{ t('mapViewport.loaded', { count: markers.length, total }) }}</p><button v-if="hasMore && page < 10000" type="button" @click="load(false)">{{ t('discoveryMap.more') }}</button><p v-else-if="hasMore">{{ t('mapViewport.zoomIn') }}</p></template>
          </div>
        </div>
      </div>
      <!-- This layer never participates in the map's layout. Keep the top
           controls and the bottom attribution strip clear of the sheet. -->
      <div v-show="insightsOpen" class="insights-layer">
        <div class="insights-scrim" aria-hidden="true" @click="closeInsights()"></div>
        <section :id="insightsId" ref="insightsDialog" class="insights-sheet" role="dialog" aria-modal="true" :aria-label="t('areaInsights.title')" tabindex="-1">
          <header class="insights-sheet-heading">
            <span class="sheet-grip" aria-hidden="true"></span>
            <button ref="insightsClose" class="insights-close" type="button" :aria-label="t('common.close')" @click="closeInsights()"><AppIcon name="close" :size="21" /></button>
          </header>
          <div class="insights-body" tabindex="0">
            <AreaInsightsCard :insights="insights" :loading="loading" :failed="Boolean(error) || !queryBounds" />
            <p class="map-disclaimer">{{ t('discoveryMap.history') }}</p>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
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
const { t, locale } = useAppI18n()
const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const insightsId = `map-insights-${useId()}`
const insightsOpen = ref(false)
const insightsTrigger = ref<HTMLButtonElement | null>(null), insightsClose = ref<HTMLButtonElement | null>(null)
const insightsDialog = ref<HTMLElement | null>(null)
let sheetSequence = 0
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
async function openInsights() {
  if (!props.active || disposed || insightsOpen.value) return
  const request = ++sheetSequence
  insightsOpen.value = true
  document.addEventListener('keydown', handleSheetKeydown, true)
  document.addEventListener('focusin', containSheetFocus, true)
  await nextTick()
  if (request === sheetSequence && insightsOpen.value && props.active && !disposed) insightsClose.value?.focus({ preventScroll: true })
}
async function closeInsights(restoreFocus = true) {
  const wasOpen = insightsOpen.value, request = ++sheetSequence
  insightsOpen.value = false
  document.removeEventListener('keydown', handleSheetKeydown, true)
  document.removeEventListener('focusin', containSheetFocus, true)
  await nextTick()
  if (wasOpen && restoreFocus && request === sheetSequence && props.active && !disposed) insightsTrigger.value?.focus({ preventScroll: true })
}
function containSheetFocus(event: FocusEvent) {
  if (insightsOpen.value && insightsDialog.value && !insightsDialog.value.contains(event.target as Node)) insightsClose.value?.focus({ preventScroll: true })
}
function handleSheetKeydown(event: KeyboardEvent) {
  if (!insightsOpen.value || !insightsDialog.value) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void closeInsights(); return }
  if (event.key !== 'Tab') return
  const controls = [...insightsDialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.closest('[hidden], [inert]'))
  const first = controls[0] || insightsDialog.value, last = controls.at(-1) || first
  if (!insightsDialog.value.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
    event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true })
  }
}
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
  // Layout changes update the camera for explicit Search, but keep markers and
  // insights on their committed query. Otherwise panel resizing can query itself.
  if (next.initial || next.reason === 'resize') return
  const bounds = supportedViewport(next.bounds)
  if (sameMapBounds(bounds, queryBounds.value)) return
  clear(); queryBounds.value = bounds
  if (props.active && bounds) { loading.value = true; moveTimer = setTimeout(() => { moveTimer = undefined; void load() }, 300) }
}
watch(() => props.active, active => {
  if (!active) void closeInsights(false)
  invalidate()
  if (active) { cameraCenter.value = { lat: view.value.lat, lng: view.value.lng }; if (!hasLoaded.value && !error.value) void load() }
}, { immediate: true })
function refreshContext() { void closeInsights(false); clear(); if (props.active) void load() }
window.addEventListener('auth:changed', refreshContext)
window.addEventListener('auth:unauthorized', refreshContext)
onBeforeUnmount(() => { disposed = true; void closeInsights(false); invalidate(); window.removeEventListener('auth:changed', refreshContext); window.removeEventListener('auth:unauthorized', refreshContext) })
</script>
<style scoped>
.discovery-map { height: calc(100dvh - 90px - var(--safe-bottom)); min-height: 0; overflow: hidden; max-width: 480px; margin: auto; display: flex; flex-direction: column; background: var(--page-bg); }
.map-heading { display: flex; flex-shrink: 0; align-items: center; gap: 10px; justify-content: space-between; padding: calc(12px + var(--safe-top)) 16px 10px; }
h1 { font-size: var(--page-title-size); font-weight: var(--page-title-weight); color: var(--color-text-primary); }
.map-heading p,.map-disclaimer { font-size: 12px; color: var(--color-text-secondary); line-height: 1.4; }
button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--color-surface-selected); color: var(--color-text-accent); font-size: 13px; font-weight: 600; }
button:focus-visible { outline: 3px solid var(--color-border-accent); outline-offset: 2px; }
button:disabled { opacity: .6; cursor: wait; }
.map-canvas { position: relative; flex: 1; min-height: 0; isolation: isolate; }
.map-background { position: absolute; inset: 0; }
.map-background :deep(.full-height .leaflet-map) { min-height: 0; }
.map-background :deep(.map-wrap.full-height) { min-height: 0; }
.search-area { position: absolute; z-index: 600; top: 10px; left: 50%; transform: translateX(-50%); white-space: nowrap; box-shadow: var(--shadow-card); }
.map-heading > div { min-width: 0; }
.map-heading > button { flex-shrink: 0; }
.map-summary { position: absolute; z-index: 600; bottom: 28px; left: 12px; right: 12px; display: grid; justify-items: start; gap: 8px; }
.insights-trigger { max-width: 100%; flex-wrap: wrap; background: var(--color-surface-elevated); border: 1px solid var(--color-border-accent); box-shadow: var(--shadow-float); }
.insights-count { color: var(--color-text-secondary); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.map-feedback { width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-elevated); color: var(--color-text-primary); box-shadow: var(--shadow-card); font-size: 12px; }
.map-feedback button { margin-top: 5px; }
.insights-layer { position: absolute; z-index: 800; inset: 92px 0 28px; }
.insights-scrim { position: absolute; inset: 0; background: var(--overlay); }
.insights-sheet { position: absolute; right: 0; bottom: 0; left: 0; max-height: 100%; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border); border-radius: 18px 18px 0 0; background: var(--color-surface-elevated); color: var(--color-text-primary); box-shadow: var(--shadow-float); animation: insights-appear 160ms ease-out; }
.insights-sheet-heading { position: relative; flex-shrink: 0; min-height: 52px; display: flex; justify-content: flex-end; align-items: center; padding: 4px 12px; }
.sheet-grip { position: absolute; top: 12px; left: 50%; width: 34px; height: 4px; border-radius: 999px; background: var(--color-border); transform: translateX(-50%); }
.insights-close { width: 44px; padding: 8px; background: transparent; color: var(--color-text-primary); }
.insights-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.insights-body:focus-visible { outline: 3px solid var(--color-focus); outline-offset: -3px; }
.insights-body :deep(.area-insights) { margin: 0; padding: 0 16px 12px; border: 0; background: transparent; }
.map-disclaimer { padding: 0 16px 16px; }
@keyframes insights-appear { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .insights-sheet { animation: none; } }
</style>
