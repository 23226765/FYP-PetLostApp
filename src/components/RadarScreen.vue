<template>
  <div class="radar feed-theme">
    <header class="top">
      <div>
        <p class="greeting">{{ t('radar.community') }}</p>
        <h1>
          <AppIcon name="pin" :size="18" />
          {{ t('radar.locationRadius', { location: district ? districtLabel(district) : 'Hong Kong', radius: radiusKm }) }}
        </h1>
      </div>
      <div class="header-actions">
        <button class="smart-match" type="button" @click="emit('smart-match')">
          {{ t('radar.smartMatch') }}
        </button>
        <button
          class="bell"
          type="button"
          :aria-label="t('navigation.unreadMessages', { count: unreadCount })"
          @click="emit('notifications')"
        >
          <AppIcon name="bell" :size="21" />
          <span v-if="unreadCount" class="dot">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        </button>
      </div>
    </header>

    <div class="toggle theme-segmented-control" role="tablist" :aria-label="t('radar.feedView')">
      <button
        class="theme-segmented-option"
        role="tab"
        :aria-selected="view === 'list'"
        :class="{ active: view === 'list' }"
        @click="view = 'list'"
      >
        <AppIcon name="list" :size="17" />
        {{ t('radar.list') }}
      </button>
      <button
        class="theme-segmented-option"
        role="tab"
        :aria-selected="view === 'map'"
        :class="{ active: view === 'map' }"
        @click="view = 'map'"
      >
        <AppIcon name="map" :size="17" />
        {{ t('radar.map') }}
      </button>
    </div>

    <div class="detail-filters" :aria-label="t('compactFilters.title')">
      <label>
        <span>{{ t('compactFilters.animal') }}</span>
        <select :value="species" @change="emit('species-change', ($event.target as HTMLSelectElement).value as typeof species)">
          <option v-for="animal in animals" :key="animal" :value="animal">{{ speciesLabel(animal) }}</option>
        </select>
      </label>
      <label>
        <span>{{ t('radar.district') }}</span>
        <select :value="district" @change="handleDistrict">
          <option value="">{{ t('radar.allDistricts') }}</option>
          <option v-for="item in HK_DISTRICTS" :key="item" :value="item">{{ districtLabel(item) }}</option>
        </select>
      </label>
      <div class="radius-compact">
        <button class="radius-trigger" type="button" aria-haspopup="dialog" :aria-label="t('radar.radiusA11y')" @click="radiusOpen = true">
          <AppIcon name="radar" :size="19" />{{ t('common.kilometres', { count: radiusKm }) }}<AppIcon name="chevron" :size="14" />
        </button>
      </div>
    </div>
    <FilterSheet :open="radiusOpen" :title="t('compactFilters.radius')" @close="radiusOpen = false">
      <fieldset class="radius-options"><legend class="sr-only">{{ t('compactFilters.radius') }}</legend>
        <label v-for="radius in radiusOptions" :key="radius" :class="{ selected: radiusKm === radius }"><input type="radio" name="radar-radius" :value="radius" :checked="radiusKm === radius" @change="emit('radius-change', radius); radiusOpen = false" />{{ t('common.kilometres', { count: radius }) }}</label>
      </fieldset>
    </FilterSheet>

    <p class="count">{{ t('radar.petsNearby', { count: pets.length }, pets.length) }}</p>

    <div v-if="view === 'map'" class="map-layer-control" :aria-label="t('radar.mapLayerA11y')">
      <div>
        <strong>{{ t('radar.mapLayer') }}</strong>
        <span>{{ mapLayer === 'heatmap' ? t('radar.recentActivity') : t('radar.individualReports') }}</span>
      </div>
      <div class="layer-buttons" role="group" :aria-label="t('radar.chooseLayer')">
        <button
          type="button"
          :class="{ active: mapLayer === 'pins' }"
          :aria-pressed="mapLayer === 'pins'"
          @click="mapLayer = 'pins'"
        >
          {{ t('radar.pins') }}
        </button>
        <button
          type="button"
          :class="{ active: mapLayer === 'heatmap' }"
          :aria-pressed="mapLayer === 'heatmap'"
          @click="mapLayer = 'heatmap'"
        >
          {{ t('radar.hotspots') }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="state" :class="{ 'feed-loading': view === 'list' }">
      <p role="status" class="loading-copy">{{ t('radar.loadingPets') }}</p>
      <template v-if="view === 'list'"><div v-for="index in 2" :key="index" class="feed-skeleton" aria-hidden="true"><div class="feed-skeleton-head"><span class="feed-skeleton-line" /><span class="feed-skeleton-line short" /></div><div class="feed-skeleton-photo" /><div class="feed-skeleton-foot"><span class="feed-skeleton-line" /><span class="feed-skeleton-line short" /></div></div></template>
      <span v-else class="spinner" aria-hidden="true" />
    </div>
    <div v-else-if="error" class="state error">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="emit('retry')">{{ t('common.retry') }}</button>
    </div>
    <div v-else-if="view === 'list' && pets.length === 0" class="state">
      {{ t('radar.emptyNearby') }}
    </div>
    <template v-else-if="view === 'list'">
      <div class="feed">
        <PetCard
          v-for="pet in pets"
          :key="pet.id"
          :pet="pet"
          :feed="true"
          @open="emit('open', pet)"
          @found="emit('found', pet)"
        />
      </div>
    </template>
    <div v-else class="map-section">
      <div v-if="mapLayer === 'heatmap'" class="analytics-card" aria-live="polite">
        <template v-if="hotspotLoading">
          <span class="analytics-spinner" aria-hidden="true" />
          <span>{{ t('radar.calculatingHotspots') }}</span>
        </template>
        <template v-else-if="hotspotError">
          <span>{{ hotspotError }}</span>
          <button type="button" @click="loadHotspots">{{ t('common.retry') }}</button>
        </template>
        <template v-else-if="hotspotSummary && hotspotSummary.total > 0">
          <div>
            <strong>{{ t('radar.recentReports', { count: hotspotSummary.total }, hotspotSummary.total) }}</strong>
            <span>{{ t('radar.hotspotSummary', { sightings: hotspotSummary.sightings, strays: hotspotSummary.strays }) }}</span>
            <span v-if="hotspotSummary.cellsTruncated" class="hotspot-limit">{{ t('hotspotCoverage.limited', { shown: hotspotSummary.returnedCellCount, total: hotspotSummary.cellCount }) }}</span>
          </div>
          <span class="analytics-window">{{ t('radar.dayWindow', { count: hotspotSummary.windowDays }) }}</span>
        </template>
        <span v-else>{{ t('radar.noHotspots') }}</span>
      </div>
      <MapView
        :pets="pets"
        :center="userLocation"
        :radius-km="radiusKm"
        :heat-cells="hotspotCells"
        :show-heatmap="mapLayer === 'heatmap' && !hotspotLoading && !hotspotError"
        @open="(p) => emit('open', p)"
      />
      <div v-if="mapLayer === 'heatmap'" class="heat-legend" :aria-label="t('radar.hotspotLegend')">
        <span>{{ t('radar.lowerActivity') }}</span>
        <span class="legend-gradient" aria-hidden="true" />
        <span>{{ t('radar.higherUrgency') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Pet } from '../types/pet'
import type { HotspotCell, HotspotSummary } from '../types/analytics'
import { HK_DISTRICTS } from '../types/pet'
import { getHotspots } from '../services/api'
import AppIcon from './AppIcon.vue'
import PetCard from './PetCard.vue'
import MapView from './MapView.vue'
import FilterSheet from './FilterSheet.vue'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, speciesLabel } from '../i18n/formatters'

const props = defineProps<{
  pets: Pet[]
  loading?: boolean
  error?: string
  radiusKm: number
  species: 'All' | 'Dogs' | 'Cats' | 'Other'
  breed: string
  district: string
  unreadCount: number
  userLocation: { lat: number; lng: number } | null
}>()

const emit = defineEmits<{
  open: [pet: Pet]
  found: [pet: Pet]
  retry: []
  'smart-match': []
  notifications: []
  'radius-change': [value: number]
  'species-change': [value: 'All' | 'Dogs' | 'Cats' | 'Other']
  'breed-change': [value: string]
  'district-change': [value: string]
}>()

const { t } = useAppI18n()

const view = ref<'list' | 'map'>('list')
const mapLayer = ref<'pins' | 'heatmap'>('pins')
const hotspotCells = ref<HotspotCell[]>([])
const hotspotSummary = ref<HotspotSummary | null>(null)
const hotspotLoading = ref(false)
const hotspotError = ref('')
const animals = ['All', 'Dogs', 'Cats', 'Other'] as const
const radiusOpen = ref(false)
const radiusOptions = [1, 5, 10, 15, 20]
const HK_CENTER = { lat: 22.3193, lng: 114.1694 }
let hotspotRequestSequence = 0
let hotspotAbortController: AbortController | null = null

async function loadHotspots() {
  if (view.value !== 'map' || mapLayer.value !== 'heatmap') {
    hotspotRequestSequence += 1
    hotspotAbortController?.abort()
    hotspotAbortController = null
    hotspotLoading.value = false
    return
  }

  const sequence = ++hotspotRequestSequence
  hotspotAbortController?.abort()
  const controller = new AbortController()
  hotspotAbortController = controller
  hotspotLoading.value = true
  hotspotError.value = ''
  const center = props.userLocation || HK_CENTER

  try {
    const result = await getHotspots(
      {
        lat: center.lat,
        lng: center.lng,
        radiusKm: props.radiusKm,
        days: 30,
        source: 'all',
      },
      controller.signal,
    )
    if (sequence !== hotspotRequestSequence) return
    hotspotCells.value = result.cells
    hotspotSummary.value = result.summary
  } catch (error) {
    if (sequence !== hotspotRequestSequence) return
    hotspotCells.value = []
    hotspotSummary.value = null
    hotspotError.value = translateApiError(error, 'errors.loadHotspots')
  } finally {
    if (sequence === hotspotRequestSequence) {
      hotspotLoading.value = false
      if (hotspotAbortController === controller) hotspotAbortController = null
    }
  }
}

watch(
  [
    view,
    mapLayer,
    () => props.radiusKm,
    () => props.userLocation?.lat,
    () => props.userLocation?.lng,
  ],
  () => void loadHotspots(),
)

onBeforeUnmount(() => {
  hotspotRequestSequence += 1
  hotspotAbortController?.abort()
  hotspotAbortController = null
})

function handleDistrict(event: Event) {
  emit('district-change', (event.target as HTMLSelectElement).value)
}
</script>

<style scoped>
.radius-compact { display: flex; flex: 0 0 auto; margin: 0 0 0 auto; }
.radius-trigger { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 4px; border-radius: 0; background: transparent; color: var(--color-text-accent); font-weight: 600; white-space: nowrap; }
.radius-options { border: 0; display: grid; gap: 8px; }
.radius-options label { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 10px 14px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); color: var(--color-text-primary); }
.radius-options label.selected { border-color: var(--color-border-accent); background: var(--color-surface-selected); }
.radius-options input { accent-color: var(--teal); }
.radius-options label:has(:focus-visible), .radius-trigger:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; }
.radar {
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: calc(var(--safe-top) + 12px) 0 calc(var(--safe-bottom) + 80px);
  max-width: 480px;
  margin: 0 auto;
}

.top {
  padding: 0 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 18px;
}
.top > div:first-child { min-width: 0; flex: 1; }

.greeting {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-muted);
  letter-spacing: normal;
}

h1 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
}

h1 svg {
  color: var(--color-text-accent);
}

.bell {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--ink);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 55%;
  flex-shrink: 0;
}
.bell { flex-shrink: 0; }

.smart-match {
  min-width: 0;
  min-height: 44px;
  padding: 0 13px;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-accent);
  font-size: 12.5px;
  font-weight: 600;
  box-shadow: none;
}

.bell .dot {
  position: absolute;
  top: 11px;
  right: 12px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 50%;
  background: var(--coral);
  border: 1.5px solid var(--surface);
  color: var(--color-text-on-coral);
  font-size: 9px;
  font-weight: 800;
  line-height: 14px;
  text-align: center;
}

.toggle {
  margin-bottom: 14px;
}

.toggle button {
  font-size: 14.5px;
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 14px;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  padding: 7px 16px;
  border-radius: 999px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
  white-space: nowrap;
  transition: all 0.15s ease;
}

.chip.active {
  background: var(--teal);
  border-color: var(--color-border-accent);
  color: #fff;
}

.detail-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 4px 8px;
  margin-bottom: 8px;
}

.detail-filters label {
  display: flex;
  flex: 1 1 112px;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.detail-filters span {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-muted);
}

.detail-filters input,
.detail-filters select {
  width: 100%;
  min-height: 44px;
  padding: 0 11px;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-size: 16px;
  font-weight: 400;
  outline: none;
}

.detail-filters input:focus,
.detail-filters select:focus {
  border-color: var(--color-border-accent);
}

.count {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-muted);
  margin-bottom: 12px;
}

.map-layer-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 11px 10px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.map-layer-control > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.map-layer-control strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}

.map-layer-control span {
  color: var(--ink-muted);
  font-size: 10.5px;
  font-weight: 650;
}

.layer-buttons {
  display: flex;
  flex-shrink: 0;
  gap: 3px;
  padding: 3px;
  border-radius: 999px;
  background: var(--line);
}

.layer-buttons button {
  min-height: 36px;
  padding: 0 11px;
  border-radius: 999px;
  color: var(--ink-muted);
  font-size: 11.5px;
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.layer-buttons button.active {
  background: #1d6360;
  color: #fff;
  box-shadow: 0 3px 10px rgba(29, 99, 96, 0.22);
}

.layer-buttons button:active {
  transform: scale(0.98);
}

.map-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.analytics-card {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  border: 1px solid rgba(29, 99, 96, 0.15);
  border-radius: 14px;
  background: rgba(29, 99, 96, 0.08);
  color: var(--color-text-accent);
  font-size: 12px;
  font-weight: 700;
}

.analytics-card > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.analytics-card strong {
  font-size: 13px;
  font-weight: 850;
}

.analytics-card button {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
}

.analytics-window {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  background: #fcf9f2;
  color: var(--color-text-on-light) !important;
  font-size: 10.5px !important;
  font-weight: 800 !important;
}

.analytics-spinner {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 2px solid rgba(29, 99, 96, 0.2);
  border-top-color: var(--color-icon-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.heat-legend {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  color: var(--ink-muted);
  font-size: 10.5px;
  font-weight: 700;
}

.legend-gradient {
  height: 7px;
  border-radius: 999px;
  background: linear-gradient(90deg, #79b7ae, #1d6360 45%, #f2a65a 72%, #ef6351);
}

.radius {
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 14px;
}

.radius-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--ink);
}

.radius-value {
  color: var(--color-text-accent);
  font-weight: 800;
}

.radius input[type='range'] {
  width: 100%;
  accent-color: var(--teal);
}

.radius-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-muted);
  margin-top: 2px;
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.state {
  padding: 40px 16px;
  text-align: center;
  color: var(--ink-muted);
  font-weight: 700;
  font-size: 14.5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.state.error {
  color: var(--color-text-urgent);
}

.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--teal-soft);
  border-top-color: var(--color-icon-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
.toggle,.detail-filters,.count,.map-layer-control,.map-section { margin-left: 16px; margin-right: 16px; }
.feed { gap: 0; }
.state.feed-loading { padding: 0; display: block; text-align: left; font-weight: 400; }
.loading-copy { padding: 8px 16px; font-size: 14px; color: var(--color-text-secondary); }
@media (prefers-reduced-motion: reduce) { .spinner,.analytics-spinner { animation: none; } }

.retry-btn {
  padding: 10px 22px;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
}
</style>
