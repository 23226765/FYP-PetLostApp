<template>
  <section id="profile-panel-rescue" class="tab-panel" role="tabpanel" aria-labelledby="profile-tab-rescue">
    <div v-if="loading && !posts.length" class="panel-state" role="status"><span class="spinner" />{{ t('profile.loadingRescuePosts') }}</div>
    <div v-else-if="error && !posts.length" class="panel-state error" role="alert"><p>{{ error }}</p><button type="button" @click="loadPage(1)">{{ t('common.retry') }}</button></div>
    <div v-else-if="!posts.length" class="panel-state">
      <span class="state-icon"><AppIcon name="grid" :size="29" /></span>
      <h2>{{ t('profile.noRescuePostsTitle') }}</h2><p>{{ t('profile.noRescuePosts') }}</p>
      <button type="button" @click="emit('create-rescue')">{{ t('profile.createRescuePost') }}</button>
    </div>
    <template v-else>
      <div class="panel-heading"><h2>{{ t('profile.rescuePosts') }}</h2><button type="button" @click="emit('create-rescue')"><AppIcon name="plus" :size="17" />{{ t('profile.createRescuePost') }}</button></div>
      <div class="post-list"><ProfileStrayCard v-for="post in posts" :key="post.id" :stray="post" @open="emit('open-stray', $event)" /></div>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <button v-if="hasMore" class="load-more" type="button" :disabled="loadingMore" @click="loadPage(page + 1)">{{ loadingMore ? t('profile.loadingMore') : t('profile.loadMore') }}</button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import ProfileStrayCard from './ProfileStrayCard.vue'
import { getMyStraysPage } from '../../services/api'
import type { StrayReport } from '../../types/stray'
import { translateApiError, useAppI18n } from '../../i18n'

const props = defineProps<{ userId: string; active: boolean; refreshKey: number }>()
const emit = defineEmits<{ 'open-stray': [id: string]; 'create-rescue': [] }>()
const { t } = useAppI18n()
const posts = ref<StrayReport[]>([]); const loading = ref(false); const loadingMore = ref(false); const error = ref('')
const loaded = ref(false); const page = ref(1); const hasMore = ref(false)
let sequence = 0; let controller: AbortController | null = null

function mergeUnique(current: StrayReport[], incoming: StrayReport[]) { const map = new Map(current.map((item) => [item.id, item])); incoming.forEach((item) => map.set(item.id, item)); return [...map.values()] }
async function loadPage(nextPage: number) {
  const current = ++sequence; controller?.abort(); controller = new AbortController(); error.value = ''
  loading.value = nextPage === 1; loadingMore.value = nextPage > 1
  try {
    const result = await getMyStraysPage({ page: nextPage, limit: 20 }, controller.signal)
    if (current !== sequence) return
    posts.value = nextPage === 1 ? result.strays : mergeUnique(posts.value, result.strays)
    page.value = result.pagination.page; hasMore.value = result.pagination.hasMore; loaded.value = true
  } catch (cause) { if (current === sequence) error.value = translateApiError(cause, 'errors.loadStrays') }
  finally { if (current === sequence) { loading.value = false; loadingMore.value = false } }
}
watch(() => props.userId, () => { posts.value = []; loaded.value = false; if (props.active) void loadPage(1) })
watch(() => props.active, (active) => { if (active && !loaded.value) void loadPage(1) }, { immediate: true })
watch(() => props.refreshKey, (value, previous) => { if (value !== previous && props.active) void loadPage(1) })
onBeforeUnmount(() => { sequence += 1; controller?.abort() })
</script>

<style scoped>
.tab-panel{min-height:230px}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.panel-heading h2{font-size:16px}.panel-heading button{min-height:40px;display:inline-flex;align-items:center;gap:5px;padding:0 11px;border-radius:999px;background:var(--color-surface-selected);color:var(--color-text-accent);font-size:11px;font-weight:850}.post-list{display:flex;flex-direction:column;gap:12px}.panel-state{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:24px;border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);color:var(--color-text-muted);text-align:center}.panel-state h2{color:var(--color-text-primary);font-size:17px}.panel-state p{font-size:13px}.panel-state button,.load-more{min-height:44px;padding:0 18px;border-radius:12px;background:var(--teal);color:var(--color-text-on-accent);font-weight:850}.state-icon{width:62px;height:62px;display:grid;place-items:center;border-radius:50%;background:var(--color-surface-selected);color:var(--color-icon-primary)}.spinner{width:26px;height:26px;border:3px solid var(--color-surface-selected);border-top-color:var(--color-icon-primary);border-radius:50%;animation:spin .7s linear infinite}.load-more{width:100%;margin-top:12px}.inline-error,.panel-state.error{color:var(--color-text-urgent)}.inline-error{margin-top:10px;font-size:12px;text-align:center}@keyframes spin{to{transform:rotate(360deg)}}
</style>
