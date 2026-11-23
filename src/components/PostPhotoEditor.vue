<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { usePostPhotos } from '../composables/usePostPhotos'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import { replacePostImages } from '../services/api'
import { translateApiError, useAppI18n } from '../i18n'
import PostPhotoPicker from './PostPhotoPicker.vue'
const props = defineProps<{type:'pet'|'stray'; id:string; photos:string[]}>()
const emit = defineEmits<{updated:[images:{url:string}[]]}>()
const { t } = useAppI18n()
const draft = usePostPhotos(props.type)
const dialog = ref<HTMLDialogElement>(), trigger = ref<HTMLButtonElement>()
const saving = ref(false), error = ref(''), saved = ref(false)
let sequence = 0
function open() {
  draft.reset(props.photos)
  saved.value = false
  error.value = ''
  dialog.value?.showModal()
}
function close() {
  ++sequence
  draft.reset()
  saving.value = false
  if (dialog.value?.open) { dialog.value.close(); void nextTick(() => trigger.value?.focus()) }
}
function sessionChanged(event: Event) {
  if (event instanceof StorageEvent && event.key !== null && event.key !== 'token') return
  close()
  saved.value = false
}
const events = ['auth:changed','auth:unauthorized','storage']
for (const event of events) window.addEventListener(event,sessionChanged)
watch(() => props.id, () => { close(); saved.value = false })
onBeforeUnmount(() => { sequence++; for (const event of events) window.removeEventListener(event,sessionChanged) })
async function save() {
  if (saving.value || (props.type === 'stray' && !draft.items.value.length)) return
  const version = ++sequence, context = captureAuthContext(), id = props.id
  const current = () => version === sequence && id === props.id && isAuthContextCurrent(context)
  saving.value = true
  error.value = ''
  try {
    const attachments = await draft.attachments()
    if (!current()) return
    const images = await replacePostImages(props.type,id,attachments)
    if (!current()) return
    draft.finish()
    emit('updated',images)
    close()
    saved.value = true
  } catch (cause) {
    if (current() && (cause as {apiCode?:string})?.apiCode !== 'IMAGE_CANCELLED') error.value = translateApiError(cause,'media.saveFailed')
  } finally { if (current()) saving.value = false }
}
</script>
<template>
  <button ref="trigger" class="edit" type="button" @click="open">{{ t('postPhotos.edit') }}</button>
  <small v-if="saved" role="status">{{ t('postPhotos.saved') }}</small>
  <dialog ref="dialog" :aria-label="t('postPhotos.edit')" @cancel.prevent="!saving && close()" @click="!saving && $event.target === dialog && close()">
    <div class="panel">
      <header><h2>{{ t('postPhotos.edit') }}</h2></header>
      <main>
        <PostPhotoPicker :draft="draft" :disabled="saving" />
        <p v-if="type === 'stray' && !draft.items.value.length">{{ t('validation.rescuePhotoRequired') }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
      </main>
      <footer>
        <button type="button" :disabled="saving" @click="close">{{ t('common.cancel') }}</button>
        <button class="save" type="button" :disabled="saving || (type === 'stray' && !draft.items.value.length)" @click="save">{{ t(saving ? 'common.saving' : 'postPhotos.save') }}</button>
      </footer>
    </div>
  </dialog>
</template>
<style scoped>
.edit,footer button { min-height:44px; padding:6px 12px; border-radius:10px; background:var(--color-surface-selected); color:var(--color-text-accent); font-weight:700; }
dialog { position:fixed; inset:auto 0 0; width:min(100%,480px); max-width:100%; margin:0 auto; padding:0; border:1px solid var(--color-border); border-radius:16px 16px 0 0; background:var(--color-surface); color:var(--color-text-primary); }
dialog::backdrop { background:var(--overlay); }
.panel { max-height:85dvh; display:flex; flex-direction:column; }
header,main,footer { padding:12px 16px; }
header h2 { font-size:1.15rem; margin:0; }
main { overflow:auto; overscroll-behavior:contain; }
footer { display:flex; flex-wrap:wrap; gap:8px; border-top:1px solid var(--color-border); padding-bottom:calc(12px + env(safe-area-inset-bottom)); }
footer button { flex:1; min-width:0; overflow-wrap:anywhere; }
.save { background:var(--button-primary); color:var(--button-primary-text); }
</style>

