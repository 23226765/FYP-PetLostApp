<template>
  <section class="area-insights" :aria-labelledby="titleId" :aria-busy="loading">
    <h2 :id="titleId">{{ t('areaInsights.title') }}</h2>
    <p class="scope">{{ t('areaInsights.scope') }}</p>
    <p v-if="loading" role="status">{{ t('areaInsights.loading') }}</p>
    <div v-else-if="failed || !insights" class="unavailable" role="status"><p>{{ t('areaInsights.unavailable') }}</p></div>
    <template v-else>
      <p v-if="insights.total === 0" class="empty">{{ t('areaInsights.empty') }}</p>
      <dl v-else>
        <div class="district-stat">
          <dt>{{ t('areaInsights.district') }}</dt>
          <dd v-if="insights.unknownIsTop && !insights.topDistricts.length">{{ t('areaInsights.unknownLeader', { count: number(insights.unknownDistrictCount) }) }}</dd>
          <dd v-else-if="leaders.length > 1"><details><summary>{{ t('areaInsights.tied', { groups: number(leaders.length), count: number(insights.topDistrictCount) }) }}</summary><ul><li v-for="leader in leaders" :key="leader">{{ leader }}</li></ul></details></dd>
          <dd v-else>{{ leaders[0] || t('areaInsights.unknownDistrict') }} · {{ t('areaInsights.reportCount', { count: number(insights.topDistrictCount) }, insights.topDistrictCount) }}</dd>
        </div>
        <div><dt>{{ t('areaInsights.animals') }}</dt><dd class="species-counts"><span>{{ speciesLabel('Dog') }} {{ number(insights.speciesCounts.dog) }}</span><span>{{ speciesLabel('Cat') }} {{ number(insights.speciesCounts.cat) }}</span><span>{{ speciesLabel('Other') }} {{ number(insights.speciesCounts.other) }}</span><span v-if="insights.unclassifiedSpeciesCount">{{ t('areaInsights.unclassified', { count: number(insights.unclassifiedSpeciesCount) }) }}</span></dd></div>
        <div><dt>{{ t('areaInsights.recent') }}</dt><dd>{{ t('areaInsights.reportCount', { count: number(insights.recentCount) }, insights.recentCount) }}</dd></div>
      </dl>
      <p v-if="insights.total > 0 && insights.total < 5" class="quality">{{ t('areaInsights.sparse', { count: number(insights.total) }) }}</p>
      <p v-if="insights.unknownDistrictCount" class="quality">{{ t('areaInsights.unknownDistrictCount', { count: number(insights.unknownDistrictCount) }) }}</p>
      <p v-if="insights.unknownDateCount || insights.futureDateCount" class="quality">{{ t('areaInsights.dateQuality', { unknown: number(insights.unknownDateCount), future: number(insights.futureDateCount) }) }}</p>
      <p class="updated">{{ t('areaInsights.updated', { time: formatDateTime(insights.windowEnd) }) }}</p>
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
</script>
<style scoped>
.area-insights { flex-shrink: 0; margin: 10px 12px 4px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); color: var(--color-text-primary); font-size: 12px; line-height: 1.45; }
h2 { font-size: 16px; margin: 0 0 2px; }
.scope,.quality,.updated,.disclaimer { color: var(--color-text-secondary); font-size: 11px; }
.scope { margin-bottom: 8px; }
dl { display: grid; gap: 7px; margin: 0; }
dl > div { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 10px; }
dt { color: var(--color-text-secondary); }
dd { margin: 0; min-width: 0; font-weight: 700; overflow-wrap: anywhere; }
.species-counts { display: flex; flex-wrap: wrap; gap: 3px 10px; }
.quality,.updated { margin-top: 6px; }
.disclaimer { border-top: 1px solid var(--color-border); margin-top: 9px; padding-top: 7px; }
summary { min-height: 36px; padding: 6px 0; cursor: pointer; border-radius: 6px; }
summary:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
ul { padding-left: 18px; margin-top: 5px; }
.empty { color: var(--color-text-secondary); }
</style>
