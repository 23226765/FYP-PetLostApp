<template>
  <section id="profile-panel-saved" class="tab-panel" role="tabpanel" aria-labelledby="profile-tab-saved">
    <div v-if="loading && !posts.length" class="panel-state" role="status"><span class="spinner" />{{ t('profile.loadingSavedPosts') }}</div>
    <div v-else-if="error && !posts.length && !unavailableCount && !hasMore" class="panel-state error" role="alert"><p>{{ error }}</p><button type="button" @click="loadPage(1)">{{ t('common.retry') }}</button></div>
    <div v-else-if="!posts.length && !unavailableCount && !hasMore" class="panel-state">
      <span class="state-icon"><AppIcon name="bookmark" :size="29" /></span>
      <h2>{{ t('profile.noSavedPostsTitle') }}</h2><p>{{ t('profile.noSavedPosts') }}</p>
      <button type="button" @click="emit('explore-rescue')">{{ t('profile.exploreRescuePosts') }}</button>
    </div>
    <template v-else>
      <div class="panel-heading"><h2>{{ t('profile.savedPosts') }}</h2></div>
      <p v-if="unavailableCount" class="unavailable" role="status">{{ t('profile.postsUnavailable', { count: unavailableCount }) }}</p>
      <div class="post-list">
        <ProfileStrayCard v-for="post in posts" :key="post.id" :stray="post" removable :removing="removingId === post.id" @open="emit('open-stray', $event)" @unsave="unsave" />
      </div>
      <div v-if="error" class="inline-error" role="alert"><p>{{ error }}</p><button type="button" :disabled="loading || loadingMore || Boolean(removingId)" @click="loadPage(failedPage || 1)">{{ t('common.retry') }}</button></div>
      <button v-if="hasMore || refreshRequired" class="load-more" type="button" :disabled="loading || loadingMore || Boolean(removingId)" @click="loadPage(refreshRequired ? 1 : page + 1)">{{ loadingMore || loading ? t('profile.loadingMore') : refreshRequired ? t('common.retry') : t('profile.loadMore') }}</button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import ProfileStrayCard from './ProfileStrayCard.vue'
import { getSavedStraysPage, setStraySaved } from '../../services/api'
import { captureAuthContext, isAuthContextCurrent } from '../../services/authSession'
import { useSavedPets } from '../../composables/useSavedPets'
import type { StrayReport } from '../../types/stray'
import { translateApiError, useAppI18n } from '../../i18n'

const props = defineProps<{ userId: string; active: boolean; refreshKey: number }>()
const emit = defineEmits<{ 'open-stray': [id: string]; 'explore-rescue': [] }>()
const { t } = useAppI18n()
const { savedContext } = useSavedPets()
const posts = ref<StrayReport[]>([]); const loading = ref(false); const loadingMore = ref(false); const error = ref('')
const loaded = ref(false); const page = ref(1); const hasMore = ref(false); const unavailableCount = ref(0); const removingId = ref('')
const unavailableByPage = new Map<number, number>()
const refreshRequired = ref(false); const failedPage = ref<number | null>(null)
let sequence = 0, epoch = 0; let controller: AbortController | null = null

function mergeUnique(current: StrayReport[], incoming: StrayReport[]) { const map = new Map(current.map((item) => [item.id, item])); incoming.forEach((item) => map.set(item.id, item)); return [...map.values()] }
async function loadPage(nextPage: number) {
  if (removingId.value) return
  if (refreshRequired.value) nextPage = 1
  const current = ++sequence, userId = props.userId, auth = captureAuthContext()
  const active = () => current === sequence && props.userId === userId && isAuthContextCurrent(auth)
  controller?.abort(); controller = new AbortController(); error.value = ''
  loading.value = nextPage === 1; loadingMore.value = nextPage > 1
  try {
    const result = await getSavedStraysPage({ page: nextPage, limit: 20 }, controller.signal)
    if (!active()) return
    posts.value = nextPage === 1 ? result.strays : mergeUnique(posts.value, result.strays)
    if (nextPage === 1) unavailableByPage.clear()
    unavailableByPage.set(nextPage, result.unavailableCount)
    unavailableCount.value = [...unavailableByPage.values()].reduce((sum, count) => sum + count, 0)
    page.value = result.pagination.page; hasMore.value = result.pagination.hasMore; loaded.value = true
    failedPage.value = null; refreshRequired.value = false
  } catch (cause) { if (active()) { error.value = translateApiError(cause, 'errors.loadSaved'); failedPage.value = nextPage } }
  finally { if (active()) { loading.value = false; loadingMore.value = false } }
}
async function unsave(id: string) {
  if (removingId.value || loading.value || loadingMore.value) return
  const currentEpoch = epoch, userId = props.userId, auth = captureAuthContext()
  const active = () => epoch === currentEpoch && props.userId === userId && isAuthContextCurrent(auth)
  removingId.value = id; error.value = ''
  try {
    await setStraySaved(id, false)
    if (!active()) return
    posts.value = posts.value.filter(post => post.id !== id)
    refreshRequired.value = true
    removingId.value = ''
    // Offset pages shifted after removal: refresh page one rather than skip a save.
    await loadPage(1)
  } catch (cause) { if (active()) error.value = translateApiError(cause, 'errors.updateSaved') }
  finally { if (active()) removingId.value = '' }
}
function reset() {
  epoch++; sequence++; controller?.abort()
  posts.value = []; loaded.value = false; page.value = 1; hasMore.value = false
  unavailableByPage.clear(); unavailableCount.value = 0; error.value = ''; removingId.value = ''
  refreshRequired.value = false; failedPage.value = null
  loading.value = false; loadingMore.value = false
}
watch(() => props.userId, () => { reset(); if (props.active) void loadPage(1) }, { flush: 'sync' })
watch(() => props.active, (active) => { if (active && !loaded.value) void loadPage(1) }, { immediate: true })
watch(() => props.refreshKey, (value, previous) => { if (value !== previous && props.active) void loadPage(1) })
function handleAuthChange() {
  reset()
  if (props.active && savedContext.value.ready && savedContext.value.accountId === props.userId) void loadPage(1)
}
window.addEventListener('auth:changed', handleAuthChange)
onBeforeUnmount(() => { reset(); window.removeEventListener('auth:changed', handleAuthChange) })
</script>

<style scoped>
.tab-panel{min-height:230px}.panel-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}.panel-heading h2{font-size:16px}.post-list{display:flex;flex-direction:column;gap:12px}.panel-state{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:24px;border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface);color:var(--color-text-muted);text-align:center}.panel-state h2{color:var(--color-text-primary);font-size:17px}.panel-state p{font-size:13px}.panel-state button,.load-more{min-height:44px;padding:0 18px;border-radius:12px;background:var(--teal);color:var(--color-text-on-accent);font-weight:850}.state-icon{width:62px;height:62px;display:grid;place-items:center;border-radius:50%;background:var(--color-surface-selected);color:var(--color-icon-primary)}.spinner{width:26px;height:26px;border:3px solid var(--color-surface-selected);border-top-color:var(--color-icon-primary);border-radius:50%;animation:spin .7s linear infinite}.unavailable{margin-bottom:10px;padding:9px 11px;border-radius:12px;background:var(--color-surface-subtle);color:var(--color-text-muted);font-size:11.5px}.load-more{width:100%;margin-top:12px}.inline-error,.panel-state.error{color:var(--color-text-urgent)}.inline-error{margin-top:10px;font-size:12px;text-align:center}@keyframes spin{to{transform:rotate(360deg)}}
</style>
