<template>
  <section class="area-insights" :aria-labelledby="titleId" :aria-busy="loading">
    <h2 :id="titleId">{{ t('areaInsights.title') }}</h2>
    <p class="scope">{{ t('areaInsights.scope') }}</p>
    <p v-if="loading" role="status">{{ t('areaInsights.loading') }}</p>
    <div v-else-if="failed || !insights" class="unavailable" role="status"><p>{{ t('areaInsights.unavailable') }}</p></div>
    <template v-else>
      <dl class="headline-counts">
        <div><dt>{{ t('areaInsights.total') }}</dt><dd>{{ number(insights.total) }}</dd></div>
        <div><dt>{{ t('areaInsights.recentReports') }}</dt><dd>{{ number(insights.recentCount) }}</dd></div>
      </dl>
      <p v-if="insights.total === 0" class="empty">{{ t('areaInsights.empty') }}</p>
      <template v-else>
        <ul class="species-counts" :aria-label="t('areaInsights.animals')">
          <li v-for="species in speciesRows" :key="species.key" :aria-label="`${speciesLabel(species.label)}: ${t('areaInsights.reportCount', { count: number(species.count) }, species.count)}`">
            <span class="species-label">{{ speciesLabel(species.label) }}</span>
            <span class="species-track" aria-hidden="true"><span class="species-bar" :style="{ width: `${species.count / insights.total * 100}%` }"></span></span>
            <span class="species-count">{{ number(species.count) }}</span>
          </li>
        </ul>
        <dl class="district-stat"><div><dt>{{ t('areaInsights.district') }}</dt><dd>{{ districtSummary }}</dd></div></dl>
      </template>
      <details class="insight-details">
        <summary>{{ t('areaInsights.viewDetails') }}</summary>
        <div class="detail-content">
          <ul v-if="leaders.length > 1" class="district-leaders" :aria-label="t('areaInsights.district')"><li v-for="leader in leaders" :key="leader">{{ leader }}</li></ul>
          <p v-if="insights.unknownIsTop && !insights.topDistricts.length" class="quality">{{ t('areaInsights.unknownLeader', { count: number(insights.unknownDistrictCount) }) }}</p>
          <p v-if="insights.total > 0 && insights.total < 5" class="quality">{{ t('areaInsights.sparse', { count: number(insights.total) }, insights.total) }}</p>
          <p v-if="insights.unclassifiedSpeciesCount" class="quality">{{ t('areaInsights.unclassified', { count: number(insights.unclassifiedSpeciesCount) }) }}</p>
          <p v-if="insights.unknownDistrictCount" class="quality">{{ t('areaInsights.unknownDistrictCount', { count: number(insights.unknownDistrictCount) }) }}</p>
          <p v-if="insights.unknownDateCount || insights.futureDateCount" class="quality">{{ t('areaInsights.dateQuality', { unknown: number(insights.unknownDateCount), future: number(insights.futureDateCount) }) }}</p>
          <p class="updated">{{ t('areaInsights.updated', { time: formatDateTime(insights.windowEnd) }) }}</p>
        </div>
      </details>
    </template>
    <p class="disclaimer">{{ t('areaInsights.disclaimer') }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, useId } from 'vue'
import type { AreaInsights } from '../types/pet'
import { useAppI18n } from '../i18n'
import { districtLabel, formatDateTime, speciesLabel } from '../i18n/formatters'

const props = defineProps<{ insights: AreaInsights | null; loading: boolean; failed?: boolean }>()
const { t, locale } = useAppI18n()
const titleId = useId()
const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const leaders = computed(() => [...(props.insights?.topDistricts || []).map(districtLabel), ...(props.insights?.unknownIsTop ? [t('areaInsights.unknownDistrict')] : [])])
const districtSummary = computed(() => {
  const insights = props.insights
  if (!insights) return ''
  if (leaders.value.length > 1) return t('areaInsights.tied', { groups: number(leaders.value.length), count: number(insights.topDistrictCount) }, insights.topDistrictCount)
  return `${leaders.value[0] || t('areaInsights.unknownDistrict')} · ${t('areaInsights.reportCount', { count: number(insights.topDistrictCount) }, insights.topDistrictCount)}`
})
const speciesRows = computed(() => [
  { key: 'dog', label: 'Dog', count: props.insights?.speciesCounts.dog || 0 },
  { key: 'cat', label: 'Cat', count: props.insights?.speciesCounts.cat || 0 },
  { key: 'other', label: 'Other', count: props.insights?.speciesCounts.other || 0 },
])
</script>
<style scoped>
.area-insights { flex-shrink: 0; margin: 12px var(--page-padding) 4px; padding: 12px 0; border-block: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-primary); font-size: 13px; line-height: 1.5; }
h2 { margin: 0 0 2px; font-size: 16px; font-weight: 650; }
.scope,.quality,.updated,.disclaimer,.empty { color: var(--color-text-secondary); font-size: 12px; }
.scope { margin: 0 0 10px; }
dl,dd { margin: 0; }
dt { color: var(--color-text-secondary); }
.headline-counts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 12px; }
.headline-counts > div { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.headline-counts dt { font-size: 12px; }
.headline-counts dd { font-size: 27px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.species-counts { display: grid; gap: 5px; padding: 0; margin: 0 0 11px; list-style: none; }
.species-counts li { display: grid; grid-template-columns: minmax(36px, max-content) minmax(0, 1fr) minmax(3ch, max-content); align-items: center; gap: 10px; }
.species-label { font-size: 12px; }
.species-track { height: 7px; overflow: hidden; border-radius: 999px; background: var(--color-surface-selected); }
.species-bar { display: block; height: 100%; border-radius: inherit; background: var(--color-text-accent); }
.species-count { text-align: end; font-weight: 650; font-variant-numeric: tabular-nums; }
.district-stat > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 10px; }
.district-stat dt { font-size: 12px; }
.district-stat dd { font-weight: 600; overflow-wrap: anywhere; }
.insight-details { margin-top: 4px; }
summary { display: list-item; width: fit-content; min-height: 44px; padding: 12px 2px; color: var(--color-text-accent); font-size: 12px; cursor: pointer; border-radius: 6px; }
summary:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.detail-content { padding-bottom: 5px; }
.quality,.updated { margin: 0 0 5px; }
.district-leaders { padding-left: 18px; margin: 0 0 6px; }
.disclaimer { border-top: 1px solid var(--color-border); margin: 2px 0 0; padding-top: 7px; }
.empty { margin: 0 0 2px; }
@media (max-width: 350px) { .headline-counts { gap: 10px; } .headline-counts dd { font-size: 24px; } .species-counts li { gap: 7px; } }
@media (forced-colors: active) { .species-track { outline: 1px solid CanvasText; } .species-bar { background: CanvasText; forced-color-adjust: none; } }
</style>
