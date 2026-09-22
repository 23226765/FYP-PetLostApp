<template>
  <div class="detail-page">
    <header class="detail-header">
      <button type="button" :aria-label="t('common.back')" @click="router.back()"><AppIcon name="back" :size="21" /></button>
      <strong>{{ t('strays.reportTitle') }}</strong>
      <button v-if="stray" type="button" :aria-label="stray.isSaved ? t('strays.removeBookmark') : t('strays.savePost')" @click="toggleSaved">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" :fill="stray.isSaved ? 'currentColor' : 'none'" /></svg>
      </button>
      <span v-else />
    </header>

    <main v-if="loading" class="page-state" role="status"><span class="spinner" />{{ t('strays.loadingPost') }}</main>
    <main v-else-if="error || !stray" class="page-state error" role="alert">
      <AppIcon name="paw" :size="35" /><h1>{{ t('strays.postUnavailable') }}</h1><p>{{ error }}</p>
      <button type="button" @click="router.back()">{{ t('common.back') }}</button>
    </main>
    <main v-else class="post">
      <section class="post-card">
        <div class="author-row">
          <span class="avatar"><img v-if="stray.author.avatar" :src="imageUrl(stray.author.avatar)" alt="" /><AppIcon v-else name="user" :size="21" /></span>
          <div><strong>{{ stray.author.name }}</strong><small>{{ stray.reportedAgo }} · {{ districtLabel(stray.district) }}</small></div>
          <span class="status" :class="stray.rescueStatus">{{ statusLabel(stray.rescueStatus) }}</span>
        </div>
        <div class="hero">
          <img v-if="stray.photo && !imageFailed" :src="imageUrl(stray.photo)" :alt="t('strays.reportedIn', { species: animalLabel, district: districtLabel(stray.district) })" @error="imageFailed = true" />
          <span v-else><AppIcon name="paw" :size="42" /></span>
        </div>
        <div class="post-copy">
          <p class="species">{{ animalLabel }} · {{ conditionLabel(stray.condition) }}</p>
          <p>{{ stray.description }}</p>
          <p class="location"><AppIcon name="pin" :size="15" />{{ stray.location }}, {{ districtLabel(stray.district) }}</p>
          <time :datetime="stray.observedAt">{{ t('strays.observed', { date: formatDateTime(stray.observedAt) }) }}</time>
        </div>
        <div class="post-actions">
          <button type="button" @click="focusComment"><AppIcon name="message" :size="20" />{{ t('strays.comment') }}</button>
          <button type="button" @click="toggleSaved"><span aria-hidden="true">🔖</span>{{ stray.isSaved ? t('strays.unsave') : t('strays.save') }}</button>
          <button type="button" @click="openShare"><AppIcon name="send" :size="20" />{{ t('strays.share') }}</button>
        </div>
      </section>

      <section v-if="stray.coordinates" class="map-card" :aria-label="t('strays.mapLocation')">
        <MapView :pets="[]" :strays="[stray]" :center="{ lat: stray.coordinates[1], lng: stray.coordinates[0] }" :radius-km="1" />
      </section>

      <section v-if="stray.canManage" class="manage-card">
        <h2>{{ t('strays.managePost') }}</h2>
        <div class="status-buttons">
          <button v-for="option in rescueOptions" :key="option.value" type="button" :class="{ active: stray.rescueStatus === option.value }" :disabled="savingStatus" @click="changeStatus(option.value)">{{ option.label }}</button>
        </div>
        <label v-if="stray.species === 'Other'"><span>{{ t('strayAnimal.typeLabel') }}</span><input v-model.trim="editAnimalType" required maxlength="80" :placeholder="t('strayAnimal.typePlaceholder')" /></label>
        <label><span>{{ t('strays.editCaption') }}</span><textarea v-model="editCaption" maxlength="2000" rows="3" /></label>
        <div class="manage-actions"><button type="button" @click="saveEdit">{{ t('strays.saveChanges') }}</button><button class="danger" type="button" @click="removePost">{{ t('strays.deletePost') }}</button></div>
      </section>

      <section class="comments" aria-labelledby="comments-title">
        <h2 id="comments-title">{{ t('strays.comments') }} <span>{{ stray.commentCount }}</span></h2>
        <form class="comment-form" @submit.prevent="submitComment">
          <input ref="commentInput" v-model="draft" maxlength="500" :placeholder="t('strays.commentPlaceholder')" :aria-label="t('strays.commentText')" />
          <button type="submit" :disabled="commenting || !draft.trim()">{{ t('strays.postComment') }}</button>
        </form>
        <p v-if="commentError" class="inline-error" role="alert">{{ commentError }}</p>
        <p v-if="commentsLoading" class="comment-state">{{ t('strays.loadingComments') }}</p>
        <p v-else-if="!comments.length" class="comment-state">{{ t('strays.noComments') }}</p>
        <article v-for="comment in comments" :key="comment.id" class="comment">
          <span class="avatar small"><img v-if="comment.author.avatar" :src="imageUrl(comment.author.avatar)" alt="" /><AppIcon v-else name="user" :size="16" /></span>
          <div><p><strong>{{ comment.author.name }}</strong> {{ comment.text }}</p><small>{{ relativeDate(comment.createdAt) }}</small></div>
          <button v-if="comment.author.id === user?.id" type="button" :aria-label="t('strays.deleteComment')" @click="removeComment(comment.id)"><AppIcon name="close" :size="15" /></button>
        </article>
      </section>
    </main>

    <div v-if="shareOpen" class="share-scrim" @click.self="shareOpen = false">
      <section class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="share-head"><h2 id="share-title">{{ t('strays.sendPost') }}</h2><button type="button" :aria-label="t('common.close')" @click="shareOpen = false"><AppIcon name="close" :size="19" /></button></div>
        <p v-if="shareLoading">{{ t('messages.loading') }}</p>
        <p v-else-if="shareError" class="inline-error">{{ shareError }}</p>
        <p v-else-if="!conversations.length">{{ t('strays.shareEmpty') }}</p>
        <button v-for="conversation in conversations" :key="conversation.id" class="conversation" type="button" :disabled="sharing" @click="shareTo(conversation)">
          <img :src="imageUrl(conversation.pet.photo)" alt="" /><span><strong>{{ conversation.pet.participantName || conversation.pet.owner }}</strong><small>{{ t('strays.conversationAbout', { name: conversation.pet.name }) }}</small></span><AppIcon name="send" :size="18" />
        </button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import MapView from '../components/MapView.vue'
import {
  addStrayComment, deleteStray, getChatInbox, getStrayById, getStrayComments,
  removeStrayComment, sendMessage, setStraySaved, updateStray, updateStrayStatus,
  type ChatConversation,
} from '../services/api'
import type { User } from '../types/user'
import type { RescueStatus, StrayComment, StrayReport } from '../types/stray'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, formatDateTime, formatRelativeDate, rescueStatusLabel, strayAnimalLabel, strayConditionLabel } from '../i18n/formatters'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ 'auth-needed': [] }>()
const route = useRoute(); const router = useRouter()
const { t } = useAppI18n()
const stray = ref<StrayReport | null>(null); const comments = ref<StrayComment[]>([])
const loading = ref(true); const commentsLoading = ref(false); const error = ref(''); const commentError = ref('')
const draft = ref(''); const commenting = ref(false); const commentInput = ref<HTMLInputElement | null>(null); const imageFailed = ref(false)
const editCaption = ref(''); const editAnimalType = ref(''); const savingStatus = ref(false)
const shareOpen = ref(false); const shareLoading = ref(false); const shareError = ref(''); const sharing = ref(false); const conversations = ref<ChatConversation[]>([])
const rescueOptions = computed(() => ([{ value: 'reported' as const, label: rescueStatusLabel('reported') }, { value: 'rescue_dispatched' as const, label: rescueStatusLabel('rescue_dispatched') }, { value: 'rescued' as const, label: rescueStatusLabel('rescued') }]))
const uniqueId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

function id() { const value = route.params.id; return Array.isArray(value) ? value[0] : String(value || '') }
function imageUrl(value: string) { try { const api = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin); return new URL(value, `${api.origin}/`).href } catch { return '' } }
function statusLabel(value: RescueStatus) { return rescueStatusLabel(value) }
function conditionLabel(value: StrayReport['condition']) { return strayConditionLabel(value) }
const animalLabel = computed(() => stray.value ? strayAnimalLabel(stray.value.species, stray.value.animalType) : '')
const relativeDate = formatRelativeDate
function requireUser() { if (props.user) return true; emit('auth-needed'); return false }

async function load() {
  loading.value = true; error.value = ''
  try { stray.value = await getStrayById(id()); editCaption.value = stray.value.description; editAnimalType.value = stray.value.animalType; await loadComments() }
  catch (cause) { error.value = translateApiError(cause, 'errors.loadPost') }
  finally { loading.value = false }
}
async function loadComments() { commentsLoading.value = true; try { comments.value = await getStrayComments(id()) } catch (cause) { commentError.value = translateApiError(cause, 'errors.loadComments') } finally { commentsLoading.value = false } }
function focusComment() { commentInput.value?.focus() }
async function submitComment() {
  if (!requireUser() || commenting.value || !draft.value.trim()) return
  commenting.value = true; commentError.value = ''
  try { const comment = await addStrayComment(id(), draft.value, uniqueId()); if (!comments.value.some((item) => item.id === comment.id)) comments.value.push(comment); draft.value = ''; if (stray.value) stray.value.commentCount = comments.value.length }
  catch (cause) { commentError.value = translateApiError(cause, 'errors.postComment') }
  finally { commenting.value = false }
}
async function removeComment(commentId: string) { if (!requireUser()) return; await removeStrayComment(id(), commentId); comments.value = comments.value.filter((item) => item.id !== commentId); if (stray.value) stray.value.commentCount = comments.value.length }
async function toggleSaved() { if (!stray.value || !requireUser()) return; const target = !stray.value.isSaved; try { stray.value.isSaved = await setStraySaved(stray.value.id, target) } catch { stray.value.isSaved = !target } }
async function changeStatus(status: RescueStatus) { if (!stray.value || savingStatus.value) return; savingStatus.value = true; try { stray.value = await updateStrayStatus(stray.value.id, status) } finally { savingStatus.value = false } }
async function saveEdit() { if (!stray.value || !editCaption.value.trim() || (stray.value.species === 'Other' && !editAnimalType.value.trim())) return; stray.value = await updateStray(stray.value.id, { description: editCaption.value, species: stray.value.species, animalType: editAnimalType.value.trim(), condition: stray.value.condition }) }
async function removePost() { if (!stray.value || !window.confirm('Delete this stray post? Shared links will show that it is unavailable.')) return; await deleteStray(stray.value.id); await router.replace('/') }
async function openShare() { if (!requireUser()) return; shareOpen.value = true; shareLoading.value = true; shareError.value = ''; try { conversations.value = await getChatInbox() } catch (cause) { shareError.value = translateApiError(cause, 'errors.loadConversations') } finally { shareLoading.value = false } }
async function shareTo(conversation: ChatConversation) { if (!stray.value || sharing.value) return; sharing.value = true; shareError.value = ''; try { await sendMessage(conversation.pet.id, { text: `Shared a ${strayAnimalLabel(stray.value.species, stray.value.animalType).toLowerCase()} rescue post.`, participantId: conversation.pet.participantId, sharedStrayId: stray.value.id, clientRequestId: uniqueId() }); shareOpen.value = false } catch (cause) { shareError.value = translateApiError(cause, 'errors.sharePost') } finally { sharing.value = false } }
onMounted(load)
</script>

<style scoped>
.detail-page{position:fixed;inset:0;z-index:48;max-width:480px;margin:auto;overflow-y:auto;background:var(--page-bg);color:var(--color-text-primary)}.detail-header{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:calc(var(--safe-top) + 10px) 16px 10px;background:color-mix(in srgb,var(--page-bg) 94%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--color-border);text-align:center}.detail-header button{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;color:var(--color-icon-primary)}.detail-header svg{width:22px;stroke:currentColor;stroke-width:2}.post{padding:14px 14px calc(var(--safe-bottom) + 45px)}.post-card,.map-card,.manage-card,.comments{margin-bottom:14px;overflow:hidden;border:1px solid var(--color-border);border-radius:18px;background:var(--color-surface);box-shadow:var(--shadow-card)}.author-row{display:flex;align-items:center;gap:10px;padding:13px}.avatar{width:42px;height:42px;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:var(--color-surface-selected);color:var(--color-icon-primary);flex:none}.avatar img,.conversation img{width:100%;height:100%;object-fit:cover}.avatar.small{width:34px;height:34px}.author-row div{min-width:0;flex:1}.author-row strong,.author-row small{display:block}.author-row small{margin-top:2px;color:var(--color-text-muted);font-size:11px}.status{padding:5px 9px;border-radius:999px;background:var(--status-coral-bg);color:var(--color-text-urgent);font-size:10px;font-weight:800}.status.rescued{background:var(--teal);color:var(--color-text-on-accent)}.status.rescue_dispatched{background:var(--color-surface-selected);color:var(--color-text-accent)}.hero{aspect-ratio:4/3;display:grid;place-items:center;background:var(--color-surface-selected);color:var(--color-icon-primary)}.hero img{width:100%;height:100%;object-fit:cover}.post-copy{padding:15px}.post-copy>p{margin-bottom:9px;line-height:1.5}.post-copy .species{color:var(--color-text-accent);font-weight:850}.location{display:flex;align-items:center;gap:5px;color:var(--color-text-muted);font-size:12px}.post-copy time{color:var(--color-text-muted);font-size:11px}.post-actions{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--color-border)}.post-actions button{min-height:48px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--color-text-accent);font-weight:800}.post-actions button:active{transform:scale(.98)}.map-card{height:260px;padding:8px}.map-card :deep(.map-wrap){height:244px;border-radius:14px}.manage-card,.comments{padding:16px}.manage-card h2,.comments h2{font-size:17px}.comments h2 span{color:var(--color-text-muted);font-size:13px}.status-buttons{display:flex;gap:6px;margin:12px 0}.status-buttons button{min-height:40px;padding:0 10px;border:1px solid var(--color-border);border-radius:999px;font-size:11px;font-weight:750}.status-buttons button.active{background:var(--teal);color:var(--color-text-on-accent)}.manage-card label{display:grid;gap:6px;font-size:12px;font-weight:800}.manage-card textarea{padding:11px;border:1px solid var(--color-border);border-radius:12px;resize:vertical}.manage-actions{display:flex;gap:8px;margin-top:10px}.manage-actions button,.comment-form button,.page-state button{min-height:44px;padding:0 15px;border-radius:12px;background:var(--teal);color:var(--color-text-on-accent);font-weight:800}.manage-actions .danger{background:var(--coral);color:var(--color-text-on-coral)}.comment-form{display:flex;gap:8px;margin-top:13px}.comment-form input{min-width:0;flex:1;min-height:44px;padding:0 12px;border:1px solid var(--color-border);border-radius:12px}.comment{display:grid;grid-template-columns:34px 1fr 32px;gap:9px;padding:13px 0;border-top:1px solid var(--color-border);font-size:12.5px;line-height:1.45}.comment small,.comment>button,.comment-state{color:var(--color-text-muted)}.comment-state,.inline-error{padding:16px 0;font-size:12px}.inline-error{color:var(--color-text-urgent)}.page-state{min-height:80dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:30px;text-align:center;color:var(--color-text-muted)}.spinner{width:30px;height:30px;border:3px solid var(--color-surface-selected);border-top-color:var(--color-icon-primary);border-radius:50%;animation:spin .7s linear infinite}.share-scrim{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:var(--overlay)}.share-sheet{width:100%;max-width:480px;max-height:70dvh;overflow-y:auto;padding:20px 16px calc(var(--safe-bottom) + 22px);border-radius:24px 24px 0 0;background:var(--color-surface-elevated)}.share-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.share-head button{width:40px;height:40px}.conversation{width:100%;display:grid;grid-template-columns:46px 1fr 30px;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--color-border);text-align:left}.conversation img{width:46px;height:46px;border-radius:50%}.conversation small{display:block;color:var(--color-text-muted)}@keyframes spin{to{transform:rotate(360deg)}}
.manage-card input{min-height:44px;padding:11px;border:1px solid var(--color-border);border-radius:12px;background:var(--input-bg);color:var(--color-text-primary)}
</style>
