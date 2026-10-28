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
          <span class="avatar"><ManagedImage v-if="stray.author.avatar" :src="imageUrl(stray.author.avatar)" alt="" /><AppIcon v-else name="user" :size="21" /></span>
          <div><strong>{{ stray.author.name }}</strong><small>{{ relativeDate(stray.createdAt) }} · {{ districtLabel(stray.district) }}</small></div>
          <span class="status" :class="stray.rescueStatus">{{ statusLabel(stray.rescueStatus) }}</span>
        </div>
        <div class="hero">
          <ManagedImage v-if="stray.photo && !imageFailed" :src="imageUrl(stray.photo)" :alt="t('strays.reportedIn', { species: animalLabel, district: districtLabel(stray.district) })" @error="imageFailed = true" />
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

      <section v-if="canEdit || canDelete || canUpdateStatus" class="manage-card" :aria-busy="manageBusy">
        <ContentImageEditor v-if="canEdit" type="stray" :id="stray.id" :allow-remove="false" @updated="updatePhotos" />
        <h2>{{ t('strays.managePost') }}</h2>
        <div v-if="canUpdateStatus" class="status-buttons">
          <button v-for="option in rescueOptions" :key="option.value" type="button" :class="{ active: stray.rescueStatus === option.value }" :disabled="manageBusy" @click="changeStatus(option.value)">{{ option.label }}</button>
        </div>
        <p v-if="savingStatus" role="status">{{ t('common.saving') }}</p>
        <p v-if="statusError" class="inline-error" role="alert">{{ statusError }}</p>
        <label v-if="canEdit && stray.species === 'Other'"><span>{{ t('strayAnimal.typeLabel') }}</span><input v-model.trim="editAnimalType" :disabled="manageBusy" required maxlength="80" :placeholder="t('strayAnimal.typePlaceholder')" /></label>
        <label v-if="canEdit"><span>{{ t('strays.editCaption') }}</span><textarea v-model="editCaption" :disabled="manageBusy" maxlength="2000" rows="3" /></label>
        <div class="manage-actions"><button v-if="canEdit" class="save-edit" type="button" :disabled="manageBusy || !editCaption.trim() || (stray.species === 'Other' && !editAnimalType.trim())" @click="saveEdit">{{ savingEdit ? t('common.saving') : t('strays.saveChanges') }}</button><button v-if="canDelete" class="danger" type="button" :disabled="manageBusy" @click="removePost">{{ deleting ? t('common.loading') : t('strays.deletePost') }}</button></div>
        <p v-if="editError" class="inline-error" role="alert">{{ editError }}</p>
        <p v-if="deleteError" class="inline-error" role="alert">{{ deleteError }}</p>
        <p v-if="manageSuccess" role="status">{{ manageSuccess }}</p>
      </section>

      <SafetyActions
        v-if="stray.reportedBy !== user?.id && stray.reportedBy"
        target-type="stray"
        :target-id="stray.id"
        :subject-user-id="stray.reportedBy"
        :subject-label="stray.author.name"
        :user="user"
        :blocked="blockedAuthor"
        @auth-needed="emit('auth-needed')"
        @blocked="handleBlockedAuthor"
      />

      <section class="comments" aria-labelledby="comments-title">
        <h2 id="comments-title">{{ t('strays.comments') }} <span>{{ stray.commentCount }}</span></h2>
        <form v-if="!blockedAuthor" class="comment-form" @submit.prevent="submitComment">
          <input ref="commentInput" v-model="draft" :disabled="commenting" maxlength="500" :placeholder="t('strays.commentPlaceholder')" :aria-label="t('strays.commentText')" />
          <button type="submit" :disabled="commenting || !draft.trim()">{{ t('strays.postComment') }}</button>
        </form>
        <p v-if="blockedAuthor" class="comment-state">{{ t('safety.blockedInteraction') }}</p>
        <p v-if="commentError" class="inline-error" role="alert">{{ commentError }}</p>
        <p v-if="commentsLoading" class="comment-state">{{ t('strays.loadingComments') }}</p>
        <p v-else-if="!comments.length" class="comment-state">{{ t('strays.noComments') }}</p>
        <article v-for="comment in comments" :key="comment.id" class="comment">
          <span class="avatar small"><ManagedImage v-if="comment.author.avatar" :src="imageUrl(comment.author.avatar)" alt="" /><AppIcon v-else name="user" :size="16" /></span>
          <div><p><strong>{{ comment.author.name }}</strong> {{ comment.text }}</p><small>{{ relativeDate(comment.createdAt) }}</small></div>
          <button v-if="comment.author.id === user?.id" type="button" :disabled="Boolean(removingComment)" :aria-label="t('strays.deleteComment')" @click="removeComment(comment.id)"><AppIcon name="close" :size="15" /></button>
          <SafetyActions
            v-else
            compact
            report-only
            class="comment-safety"
            target-type="comment"
            :target-id="comment.id"
            :user="user"
            @auth-needed="emit('auth-needed')"
          />
        </article>
        <button v-if="commentsHasMore" class="load-comments" type="button" :disabled="commentsLoading || commenting || Boolean(removingComment)" @click="loadComments(loadSequence, true)">{{ commentsLoading ? t('common.loading') : t('rescueRepair.moreComments') }}</button>
      </section>
    </main>

    <div v-if="shareOpen" class="share-scrim" @click.self="shareOpen = false">
      <section class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="share-head"><h2 id="share-title">{{ t('strays.sendPost') }}</h2><button type="button" :aria-label="t('common.close')" @click="shareOpen = false"><AppIcon name="close" :size="19" /></button></div>
        <p v-if="shareLoading">{{ t('messages.loading') }}</p>
        <p v-else-if="shareError" class="inline-error">{{ shareError }}</p>
        <p v-else-if="!conversations.length">{{ t('strays.shareEmpty') }}</p>
        <button v-for="conversation in conversations" :key="conversation.id" class="conversation" type="button" :disabled="sharing" @click="shareTo(conversation)">
          <ManagedImage :src="imageUrl(conversation.pet.photo)" alt="" /><span><strong>{{ conversation.pet.participantName || conversation.pet.owner }}</strong><small>{{ t('strays.conversationAbout', { name: conversation.pet.name }) }}</small></span><AppIcon name="send" :size="18" />
        </button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "../components/ManagedImage.vue"
import ContentImageEditor from '../components/ContentImageEditor.vue'
import type { ManagedImage as ManagedImageData } from '../services/api'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import MapView from '../components/MapView.vue'
import SafetyActions from '../components/SafetyActions.vue'
import {
  addStrayComment, deleteStray, getChatInbox, getStrayById, getStrayComments,
  removeStrayComment, sendMessage, setStraySaved, updateStray, updateStrayStatus,
  type ChatConversation,
} from '../services/api'
import type { User } from '../types/user'
import type { RescueStatus, StrayComment, StrayReport } from '../types/stray'
import { translateApiError, useAppI18n } from '../i18n'
import { districtLabel, formatDateTime, formatRelativeDate, rescueStatusLabel, strayAnimalLabel, strayConditionLabel } from '../i18n/formatters'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ 'auth-needed': [] }>()
const route = useRoute(); const router = useRouter()
const { t } = useAppI18n()
const stray = ref<StrayReport | null>(null); const comments = ref<StrayComment[]>([])
const loading = ref(true); const commentsLoading = ref(false); const error = ref(''); const commentError = ref('')
const draft = ref(''); const commenting = ref(false); const commentInput = ref<HTMLInputElement | null>(null); const imageFailed = ref(false)
const editCaption = ref(''); const editAnimalType = ref(''); const savingStatus = ref(false)
const savingEdit = ref(false); const deleting = ref(false)
const statusError = ref(''); const editError = ref(''); const deleteError = ref(''); const manageSuccess = ref('')
const commentsPage = ref(0); const commentsHasMore = ref(false); const removingComment = ref('')
let commentSubmission: { signature: string; id: string } | null = null
const canEdit = computed(() => Boolean(props.user && stray.value?.canEdit && stray.value.reportedBy === props.user.id))
const canDelete = computed(() => Boolean(props.user && stray.value?.canDelete && stray.value.reportedBy === props.user.id))
const canUpdateStatus = computed(() => Boolean(props.user && stray.value?.canUpdateStatus))
const manageBusy = computed(() => savingStatus.value || savingEdit.value || deleting.value)
const blockedAuthor = ref(false)
const shareOpen = ref(false); const shareLoading = ref(false); const shareError = ref(''); const sharing = ref(false); const conversations = ref<ChatConversation[]>([])
let loadSequence = 0
let commentLoadSequence = 0
const rescueOptions = computed(() => ([{ value: 'reported' as const, label: rescueStatusLabel('reported') }, { value: 'rescue_dispatched' as const, label: rescueStatusLabel('rescue_dispatched') }, { value: 'rescued' as const, label: rescueStatusLabel('rescued') }]))
const uniqueId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

function id() { const value = route.params.id; return Array.isArray(value) ? value[0] : String(value || '') }
function updatePhotos(images: ManagedImageData[]) {
  if (!stray.value) return
  stray.value.photo = images[0]?.url || ''; stray.value.photos = images.map((image) => image.url)
  imageFailed.value = false
}
function imageUrl(value: string) { try { const api = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin); return new URL(value, `${api.origin}/`).href } catch { return '' } }
function statusLabel(value: RescueStatus) { return rescueStatusLabel(value) }
function conditionLabel(value: StrayReport['condition']) { return strayConditionLabel(value) }
const animalLabel = computed(() => stray.value ? strayAnimalLabel(stray.value.species, stray.value.animalType) : '')
const relativeDate = formatRelativeDate
function requireUser() { if (props.user) return true; emit('auth-needed'); return false }

async function load() {
  const sequence = ++loadSequence
  stray.value = null; comments.value = []; conversations.value = []; shareOpen.value = false; blockedAuthor.value = false
  draft.value = ''; commentSubmission = null; commenting.value = false; removingComment.value = ''
  commentsPage.value = 0; commentsHasMore.value = false; commentsLoading.value = false; commentError.value = ''
  savingStatus.value = false; savingEdit.value = false; deleting.value = false
  statusError.value = ''; editError.value = ''; deleteError.value = ''; manageSuccess.value = ''
  loading.value = true; error.value = ''
  try {
    const nextStray = await getStrayById(id())
    if (sequence !== loadSequence) return
    stray.value = nextStray; blockedAuthor.value = Boolean(nextStray.interactionBlocked); editCaption.value = nextStray.description; editAnimalType.value = nextStray.animalType; await loadComments(sequence)
    if (sequence === loadSequence && route.query.share === '1' && props.user) await openShare()
  }
  catch (cause) { if (sequence === loadSequence) error.value = translateApiError(cause, 'errors.loadPost') }
  finally { if (sequence === loadSequence) loading.value = false }
}
async function loadComments(expectedSequence = loadSequence, append = false, preserve: StrayComment[] = []) {
  if (append && commentsLoading.value) return
  const request = ++commentLoadSequence, contextActive = requestGuard(expectedSequence)
  const active = () => request === commentLoadSequence && contextActive()
  commentError.value = ''
  commentsLoading.value = true
  try {
    const result = await getStrayComments(id(), append ? commentsPage.value + 1 : 1)
    if (!active()) return
    comments.value = [...new Map([...(append ? comments.value : []), ...result.comments, ...preserve].map((item) => [item.id, item])).values()]
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
    commentsPage.value = result.pagination.page; commentsHasMore.value = result.pagination.hasMore
    if (stray.value) stray.value.commentCount = result.pagination.total
  } catch (cause) {
    if (active()) commentError.value = translateApiError(cause, 'errors.loadComments')
  } finally {
    if (active()) commentsLoading.value = false
  }
}
function requestGuard(sequence = loadSequence) {
  const context = captureAuthContext(), userId = props.user?.id
  return () => sequence === loadSequence && props.user?.id === userId && isAuthContextCurrent(context)
}
function focusComment() { commentInput.value?.focus() }
async function handleBlockedAuthor() {
  blockedAuthor.value = true
  draft.value = ''; commentSubmission = null
  await loadComments()
}
async function submitComment() {
  if (blockedAuthor.value || !requireUser() || commenting.value || !draft.value.trim()) return
  const text = draft.value.trim(), target = id(), sequence = loadSequence, active = requestGuard(sequence)
  const signature = JSON.stringify([props.user?.id, target, text])
  if (commentSubmission?.signature !== signature) commentSubmission = { signature, id: uniqueId() }
  const submissionId = commentSubmission.id
  commenting.value = true; commentError.value = ''
  try {
    const comment = await addStrayComment(target, text, submissionId)
    if (!active()) return
    if (!comments.value.some((item) => item.id === comment.id)) comments.value.push(comment)
    draft.value = ''; commentSubmission = null
    await loadComments(sequence, false, [comment])
  } catch (cause) { if (active()) commentError.value = translateApiError(cause, 'errors.postComment') }
  finally { if (active()) commenting.value = false }
}
async function removeComment(commentId: string) {
  if (!requireUser() || removingComment.value) return
  const active = requestGuard(), sequence = loadSequence
  removingComment.value = commentId; commentError.value = ''
  try {
    await removeStrayComment(id(), commentId)
    if (!active()) return
    comments.value = comments.value.filter((item) => item.id !== commentId)
    await loadComments(sequence)
  } catch (cause) { if (active()) commentError.value = translateApiError(cause, 'rescueRepair.deleteCommentFailed') }
  finally { if (active()) removingComment.value = '' }
}
async function toggleSaved() { if (!stray.value || !requireUser()) return; const target = !stray.value.isSaved; try { stray.value.isSaved = await setStraySaved(stray.value.id, target) } catch { stray.value.isSaved = !target } }
async function changeStatus(status: RescueStatus) {
  if (!stray.value || !canUpdateStatus.value || manageBusy.value) return
  const active = requestGuard(); savingStatus.value = true; statusError.value = ''; manageSuccess.value = ''
  try {
    const updated = await updateStrayStatus(stray.value.id, status)
    if (active() && stray.value) {
      Object.assign(stray.value, { rescueStatus: updated.rescueStatus, statusUpdatedAt: updated.statusUpdatedAt, updatedAt: updated.updatedAt })
      manageSuccess.value = t('rescueRepair.statusSaved')
    }
  }
  catch (cause) { if (active()) statusError.value = translateApiError(cause, 'rescueRepair.statusFailed') }
  finally { if (active()) savingStatus.value = false }
}
async function saveEdit() {
  if (!stray.value || !canEdit.value || manageBusy.value || !editCaption.value.trim() || (stray.value.species === 'Other' && !editAnimalType.value.trim())) return
  const active = requestGuard(); savingEdit.value = true; editError.value = ''; manageSuccess.value = ''
  try {
    const updated = await updateStray(stray.value.id, { description: editCaption.value, species: stray.value.species, animalType: editAnimalType.value.trim(), condition: stray.value.condition })
    if (active() && stray.value) {
      Object.assign(stray.value, { description: updated.description, species: updated.species, animalType: updated.animalType, condition: updated.condition, updatedAt: updated.updatedAt })
      manageSuccess.value = t('rescueRepair.editSaved')
    }
  } catch (cause) { if (active()) editError.value = translateApiError(cause, 'rescueRepair.editFailed') }
  finally { if (active()) savingEdit.value = false }
}
async function removePost() {
  if (!stray.value || !canDelete.value || manageBusy.value || !window.confirm(t('strays.deleteConfirmation'))) return
  const active = requestGuard(); deleting.value = true; deleteError.value = ''; manageSuccess.value = ''
  try { await deleteStray(stray.value.id); if (active()) await router.replace('/') }
  catch (cause) { if (active()) deleteError.value = translateApiError(cause, 'rescueRepair.deleteFailed') }
  finally { if (active()) deleting.value = false }
}
async function openShare() {
  if (!requireUser()) return
  const active = requestGuard()
  shareOpen.value = true; shareLoading.value = true; shareError.value = ''
  try { const inbox = await getChatInbox(); if (active()) conversations.value = inbox }
  catch (cause) { if (active()) shareError.value = translateApiError(cause, 'errors.loadConversations') }
  finally { if (active()) shareLoading.value = false }
}
async function shareTo(conversation: ChatConversation) { if (!stray.value || sharing.value) return; sharing.value = true; shareError.value = ''; try { await sendMessage(conversation.pet.id, { text: t('messages.sharedRescueText', { species: strayAnimalLabel(stray.value.species, stray.value.animalType) }), participantId: conversation.pet.participantId, sharedStrayId: stray.value.id, clientRequestId: uniqueId() }); shareOpen.value = false } catch (cause) { shareError.value = translateApiError(cause, 'errors.sharePost') } finally { sharing.value = false } }
watch([id, () => props.user?.id, () => props.user?.role], () => void load(), { immediate: true })
const onAuthChange = () => void load()
window.addEventListener('auth:changed', onAuthChange)
onBeforeUnmount(() => { loadSequence += 1; window.removeEventListener('auth:changed', onAuthChange) })
</script>

<style scoped>
.detail-page { font-family: var(--font-feed); }
.detail-page{position:fixed;inset:0;z-index:48;max-width:480px;margin:auto;overflow-y:auto;background:var(--page-bg);color:var(--color-text-primary)}.detail-header{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:calc(var(--safe-top) + 10px) 16px 10px;background:color-mix(in srgb,var(--page-bg) 94%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--color-border);text-align:center}.detail-header button{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;color:var(--color-icon-primary)}.detail-header svg{width:22px;stroke:currentColor;stroke-width:2}.post{padding:0 16px calc(var(--safe-bottom) + 45px)}.post-card,.map-card,.manage-card,.comments{margin-bottom:14px;overflow:hidden;border:1px solid var(--color-border);border-radius:18px;background:var(--color-surface);box-shadow:var(--shadow-card)}.author-row{display:flex;align-items:center;gap:10px;padding:13px}.avatar{width:42px;height:42px;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:var(--color-surface-selected);color:var(--color-icon-primary);flex:none}.avatar img,.conversation img{width:100%;height:100%;object-fit:cover}.avatar.small{width:34px;height:34px}.author-row div{min-width:0;flex:1}.author-row strong,.author-row small{display:block}.author-row small{margin-top:2px;color:var(--color-text-muted);font-size:11px}.status{padding:5px 9px;border-radius:999px;background:var(--status-coral-bg);color:var(--color-text-urgent);font-size:10px;font-weight:800}.status.rescued{background:var(--teal);color:var(--color-text-on-accent)}.status.rescue_dispatched{background:var(--color-surface-selected);color:var(--color-text-accent)}.hero{aspect-ratio:4/3;display:grid;place-items:center;background:var(--color-surface-selected);color:var(--color-icon-primary)}.hero img{width:100%;height:100%;object-fit:cover}.post-copy{padding:15px}.post-copy>p{margin-bottom:9px;line-height:1.5}.post-copy .species{color:var(--color-text-accent);font-weight:850}.location{display:flex;align-items:center;gap:5px;color:var(--color-text-muted);font-size:12px}.post-copy time{color:var(--color-text-muted);font-size:11px}.post-actions{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--color-border)}.post-actions button{min-height:48px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--color-text-accent);font-weight:800}.post-actions button:active{transform:scale(.98)}.map-card{height:260px;padding:8px}.map-card :deep(.map-wrap){height:244px;border-radius:14px}.manage-card,.comments{padding:16px}.manage-card h2,.comments h2{font-size:17px}.comments h2 span{color:var(--color-text-muted);font-size:13px}.status-buttons{display:flex;gap:6px;margin:12px 0}.status-buttons button{min-height:40px;padding:0 10px;border:1px solid var(--color-border);border-radius:999px;font-size:11px;font-weight:750}.status-buttons button.active{background:var(--teal);color:var(--color-text-on-accent)}.manage-card label{display:grid;gap:6px;font-size:12px;font-weight:800}.manage-card textarea{padding:11px;border:1px solid var(--color-border);border-radius:12px;resize:vertical}.manage-actions{display:flex;gap:8px;margin-top:10px}.manage-actions button,.comment-form button,.page-state button{min-height:44px;padding:0 15px;border-radius:12px;background:var(--teal);color:var(--color-text-on-accent);font-weight:800}.manage-actions .danger{background:var(--coral);color:var(--color-text-on-coral)}.comment-form{display:flex;gap:8px;margin-top:13px}.comment-form input{min-width:0;flex:1;min-height:44px;padding:0 12px;border:1px solid var(--color-border);border-radius:12px}.comment{display:grid;grid-template-columns:34px 1fr 32px;gap:9px;padding:13px 0;border-top:1px solid var(--color-border);font-size:12.5px;line-height:1.45}.comment small,.comment>button,.comment-state{color:var(--color-text-muted)}.comment-state,.inline-error{padding:16px 0;font-size:12px}.inline-error{color:var(--color-text-urgent)}.page-state{min-height:80dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:30px;text-align:center;color:var(--color-text-muted)}.spinner{width:30px;height:30px;border:3px solid var(--color-surface-selected);border-top-color:var(--color-icon-primary);border-radius:50%;animation:spin .7s linear infinite}.share-scrim{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:var(--overlay)}.share-sheet{width:100%;max-width:480px;max-height:70dvh;overflow-y:auto;padding:20px 16px calc(var(--safe-bottom) + 22px);border-radius:24px 24px 0 0;background:var(--color-surface-elevated)}.share-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.share-head button{width:40px;height:40px}.conversation{width:100%;display:grid;grid-template-columns:46px 1fr 30px;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--color-border);text-align:left}.conversation img{width:46px;height:46px;border-radius:50%}.conversation small{display:block;color:var(--color-text-muted)}@keyframes spin{to{transform:rotate(360deg)}}
.manage-card input{min-height:44px;padding:11px;border:1px solid var(--color-border);border-radius:12px;background:var(--input-bg);color:var(--color-text-primary)}
.comment-safety{grid-column:2/-1}
.post-card { border: 0; border-bottom: 1px solid var(--color-border); border-radius: 0; margin-inline: -16px; }
.post-card .hero { aspect-ratio: auto; min-height: 220px; }
.post-card .hero img { width: 100%; height: auto; object-fit: contain; }
.manage-card button:disabled,.comment-form button:disabled,.load-comments:disabled{opacity:.6;cursor:wait}.load-comments{min-height:44px;padding:8px 14px;border-radius:14px;background:var(--color-surface-selected);color:var(--color-text-accent)}
</style>
