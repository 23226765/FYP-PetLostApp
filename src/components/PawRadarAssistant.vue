<template>
  <div v-if="active" class="assistant-root" :style="geometry">
    <button v-if="!opened" ref="launcher" class="assistant-launcher" type="button" :aria-label="t('assistant.open')" :aria-controls="panelId" :aria-expanded="opened" @click="open">
      <AppIcon name="message" :size="25" />
    </button>
    <section v-else :id="panelId" ref="panel" class="assistant-panel" :class="{ 'assistant-compact': viewportHeight - navigationHeight < 420 }" role="dialog" aria-modal="false" :aria-labelledby="titleId" tabindex="-1" @keydown.esc.stop="close">
      <header class="assistant-header">
        <h2 :id="titleId">{{ t('assistant.title') }}</h2>
        <button type="button" class="assistant-clear" @click="chat.clear()">{{ t('assistant.clear') }}</button>
        <button type="button" :aria-label="t('common.close')" @click="close"><AppIcon name="close" :size="22" /></button>
      </header>
      <div ref="transcript" class="assistant-transcript" role="log" :aria-label="t('assistant.conversation')" aria-live="polite" aria-relevant="additions text">
        <p class="assistant-intro">{{ t('assistant.intro') }}</p>
        <p v-if="chat.enabled.value === false" class="assistant-availability" role="status">{{ t('assistant.disabled') }}</p>
        <div class="assistant-suggestions" :aria-label="t('assistant.suggestions')">
          <button v-for="topic in chat.topics.value" :key="topic.id" type="button" @click="chat.chooseTopic(topic.id)">{{ topic.question }}</button>
        </div>
        <article v-for="message in chat.messages.value" :key="message.id" class="assistant-message" :class="{ 'from-user': message.role === 'user' }">
          <span class="assistant-message-label">{{ message.role === 'user' ? t('assistant.you') : message.mode === 'reviewed' ? t('assistant.reviewed') : t('assistant.generated') }}</span>
          <p>{{ chat.messageText(message) }}</p>
          <button v-if="message.mode === 'reviewed' && topicAction(message.topicId)" type="button" class="assistant-topic-action" @click="navigate(message.topicId)">{{ t('assistant.openFeature') }}</button>
        </article>
        <p v-if="chat.busy.value" class="assistant-feedback" role="status"><span class="assistant-spinner" aria-hidden="true" />{{ t('assistant.loading') }}</p>
        <p v-if="chat.notice.value" class="assistant-feedback" role="status">{{ t('assistant.stopped') }}</p>
        <div v-if="chat.error.value" class="assistant-error" role="alert">
          <p>{{ errorText }}</p>
          <button v-if="chat.pending.value && chat.consent.value" type="button" :disabled="chat.busy.value" @click="chat.retry()">{{ t('common.retry') }}</button>
        </div>
      </div>
      <form class="assistant-composer" @submit.prevent="chat.send()">
        <div v-if="chat.consent.value" class="assistant-consent-status">
          <span role="status">{{ t('assistant.sharingEnabled') }}</span><span aria-hidden="true"> · </span>
          <button ref="consentChange" type="button" :aria-expanded="consentExpanded" :aria-controls="consentNoticeId" @click="toggleConsentNotice">{{ t('assistant.changeConsent') }}</button>
        </div>
        <label v-if="!chat.consent.value || consentExpanded" :id="consentNoticeId" class="assistant-consent"><input ref="consentInput" v-model="chat.consent.value" type="checkbox" @change="onConsentChanged" /> <span>{{ t('assistant.consent') }}</span></label>
        <label :for="inputId" class="sr-only">{{ t('assistant.question') }}</label>
        <textarea :id="inputId" v-model="chat.draft.value" rows="2" :maxlength="ASSISTANT_LIMITS.text" :disabled="chat.busy.value" :placeholder="t('assistant.placeholder')" :aria-describedby="disclaimerId" @compositionstart="composing = true" @compositionend="composing = false" @keydown="onInputKeydown" />
        <div class="assistant-send-row">
          <small :id="disclaimerId">{{ t('assistant.disclaimer') }}</small>
          <button v-if="chat.busy.value" type="button" class="assistant-send" @click="chat.stop()">{{ t('assistant.stop') }}</button>
          <button v-else type="submit" class="assistant-send" :disabled="!chat.draft.value.trim()"><AppIcon name="send" :size="17" />{{ t('assistant.send') }}</button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { ASSISTANT_LIMITS, type AssistantAction } from '../../shared/assistantGuidance.js'
import { useAssistant } from '../composables/useAssistant'
import { useAppI18n } from '../i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ active: boolean; navigationElement?: HTMLElement | null }>()
const emit = defineEmits<{ navigate: [action: AssistantAction] }>()
const { t } = useAppI18n()
const chat = useAssistant()
const id = useId(), panelId = `assistant-${id}`, titleId = `${panelId}-title`, inputId = `${panelId}-question`, disclaimerId = `${panelId}-disclaimer`, consentNoticeId = `${panelId}-consent`
const opened = ref(false), composing = ref(false)
const consentExpanded = ref(true)
const consentInput = ref<HTMLInputElement | null>(null), consentChange = ref<HTMLButtonElement | null>(null)
let consentFocusSequence = 0
const launcher = ref<HTMLButtonElement | null>(null), panel = ref<HTMLElement | null>(null), transcript = ref<HTMLElement | null>(null)
const viewportHeight = ref(0), viewportTop = ref(0), navigationHeight = ref(84)
let resizeObserver: ResizeObserver | null = null
const geometry = computed(() => ({ '--assistant-height': viewportHeight.value ? `${viewportHeight.value}px` : '100dvh', '--assistant-top': `${viewportTop.value}px`, '--assistant-nav': `${navigationHeight.value}px` }))
const errorText = computed(() => {
  const code = chat.error.value
  const key = code === 'ASSISTANT_DISABLED' ? 'disabled' : code === 'ASSISTANT_CONSENT_REQUIRED' ? 'consentRequired' : code === 'ASSISTANT_INVALID_REQUEST' ? 'invalid'
    : code === 'ASSISTANT_QUOTA' || code === 'RATE_LIMITED' ? 'quota' : code === 'ASSISTANT_BUSY' ? 'busy' : code === 'ASSISTANT_TIMEOUT' ? 'timeout' : 'unavailable'
  return t(`assistant.${key}`)
})
function measure() {
  viewportHeight.value = window.visualViewport?.height || window.innerHeight
  viewportTop.value = window.visualViewport?.offsetTop || 0
  navigationHeight.value = props.navigationElement?.getBoundingClientRect().height || 84
}
async function open() {
  if (!props.active) return
  opened.value = true; measure(); void chat.checkStatus()
  await nextTick()
  if (props.active && opened.value) panel.value?.focus({ preventScroll: true })
}
async function close() {
  consentFocusSequence++
  opened.value = false; composing.value = false; chat.stop()
  await nextTick()
  if (props.active) launcher.value?.focus({ preventScroll: true })
}
async function toggleConsentNotice() {
  consentExpanded.value = !consentExpanded.value
  const sequence = ++consentFocusSequence
  await nextTick()
  if (sequence !== consentFocusSequence || !props.active || !opened.value || !chat.consent.value) return
  const target = consentExpanded.value ? consentInput.value : consentChange.value
  target?.focus({ preventScroll: true })
}
async function onConsentChanged(event: Event) {
  const input = event.target as HTMLInputElement
  const wasFocused = document.activeElement === input
  const sequence = ++consentFocusSequence
  if (!input.checked) return
  consentExpanded.value = false
  await nextTick()
  if (wasFocused && sequence === consentFocusSequence && props.active && opened.value && chat.consent.value && !consentExpanded.value) consentChange.value?.focus({ preventScroll: true })
}
function topicAction(id?: string) { return chat.topics.value.find(topic => topic.id === id)?.action }
function navigate(id?: string) {
  const action = topicAction(id)
  if (!action) return
  void close()
  emit('navigate', action)
}
function onInputKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || composing.value || event.keyCode === 229) return
  event.preventDefault(); void chat.send()
}
watch(chat.consent, granted => {
  if (!granted) {
    consentFocusSequence++; consentExpanded.value = true
    // Acceptance and a session reset can happen before Vue's next render.
    // Keep the native checkbox aligned even when the batched model ends false.
    if (consentInput.value) consentInput.value.checked = false
  }
}, { flush: 'sync' })
watch(() => props.active, active => { if (!active) { consentFocusSequence++; opened.value = false; composing.value = false; chat.stop() } }, { flush: 'sync' })
watch(() => props.navigationElement, element => { resizeObserver?.disconnect(); if (element) resizeObserver?.observe(element); measure() })
watch(() => [chat.messages.value.at(-1)?.id, chat.error.value, chat.busy.value], async () => { await nextTick(); if (transcript.value) transcript.value.scrollTop = transcript.value.scrollHeight })
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure)
    if (props.navigationElement) resizeObserver.observe(props.navigationElement)
  }
  measure()
  window.addEventListener('resize', measure)
  window.visualViewport?.addEventListener('resize', measure)
  window.visualViewport?.addEventListener('scroll', measure)
})
onBeforeUnmount(() => {
  consentFocusSequence++
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measure)
  window.visualViewport?.removeEventListener('resize', measure)
  window.visualViewport?.removeEventListener('scroll', measure)
})
</script>

<style scoped>
.assistant-root { position: fixed; top: var(--assistant-top); left: 50%; transform: translateX(-50%); width: min(100%, 480px); height: var(--assistant-height); pointer-events: none; z-index: 42; font-family: var(--font-feed); color: var(--color-text-primary); }
.assistant-launcher { position: absolute; right: 16px; bottom: calc(var(--assistant-nav) + 12px); width: 48px; height: 48px; border-radius: 50%; background: var(--button-primary); color: var(--button-primary-text); border: 1px solid var(--color-border-accent); pointer-events: auto; display: grid; place-items: center; }
.assistant-panel { position: absolute; right: 8px; bottom: calc(var(--assistant-nav) + 8px); width: min(380px, calc(100% - 16px)); max-height: calc(100% - var(--assistant-nav) - max(16px, env(safe-area-inset-top, 0px))); height: 570px; min-height: 0; background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: var(--shadow-float); }
.assistant-panel.assistant-compact { overflow-y: auto; overscroll-behavior: contain; }
.assistant-compact .assistant-transcript { flex: none; max-height: 180px; }
.assistant-root button { font: inherit; cursor: pointer; min-height: 44px; }
.assistant-root button:focus-visible, .assistant-root textarea:focus-visible, .assistant-root input:focus-visible, .assistant-panel:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -3px; }
.assistant-root button:disabled { color: var(--color-disabled-text); background: var(--color-disabled-surface); cursor: default; }
.assistant-header { display: flex; align-items: center; gap: 6px; padding: 4px 8px 4px 12px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.assistant-header h2 { font-size: 16px; font-weight: 650; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.assistant-header button { background: transparent; color: var(--color-text-accent); border: 0; padding: 4px 6px; }
.assistant-header button:last-child { min-width: 44px; display: grid; place-items: center; }
.assistant-clear { font-size: 12px !important; max-width: 98px; }
.assistant-transcript { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px; font-size: 14px; line-height: 1.5; }
.assistant-intro, .assistant-availability { color: var(--color-text-secondary); margin-bottom: 10px; }
.assistant-suggestions { display: flex; flex-wrap: wrap; gap: 6px; }
.assistant-suggestions button, .assistant-topic-action, .assistant-error button { background: var(--color-surface-subtle); border: 1px solid var(--color-border); color: var(--color-text-accent); border-radius: 10px; padding: 6px 10px; text-align: start; font-size: 13px; max-width: 100%; white-space: normal; }
.assistant-message { margin-top: 12px; padding: 10px; border-radius: 10px; background: var(--color-surface-subtle); overflow-wrap: anywhere; }
.assistant-message.from-user { background: var(--color-surface-selected); }
.assistant-message-label { font-size: 11px; font-weight: 650; color: var(--color-text-secondary); }
.assistant-message p { white-space: pre-wrap; margin: 4px 0; }
.assistant-topic-action { margin-top: 4px; }
.assistant-feedback { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--color-text-secondary); }
.assistant-error { color: var(--error); margin-top: 10px; }
.assistant-error button { margin-top: 6px; }
.assistant-composer { flex-shrink: 0; padding: 10px 12px; border-top: 1px solid var(--color-border); display: grid; gap: 8px; }
.assistant-consent { font-size: 11px; color: var(--color-text-secondary); display: flex; gap: 7px; align-items: flex-start; cursor: pointer; }
.assistant-consent input { accent-color: var(--color-text-accent); min-width: 18px; min-height: 18px; margin: 2px 0; flex-shrink: 0; }
.assistant-consent-status { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--color-text-secondary); font-size: 12px; }
.assistant-consent-status button { min-width: 44px; padding: 4px; border: 0; background: transparent; color: var(--color-text-accent); text-decoration: underline; text-underline-offset: 3px; }
.assistant-composer textarea { resize: vertical; min-height: 44px; max-height: 110px; width: 100%; background: var(--input-bg); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: 10px; padding: 8px; font: inherit; font-size: 16px; }
.assistant-composer textarea::placeholder { color: var(--color-text-muted); }
.assistant-send-row { display: flex; align-items: center; gap: 8px; }
.assistant-send-row small { flex: 1; color: var(--color-text-secondary); font-size: 10px; }
.assistant-send { display: flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 10px; padding: 8px 12px; background: var(--button-primary); color: var(--button-primary-text); }
.assistant-spinner { width: 14px; height: 14px; border: 2px solid var(--color-border); border-top-color: var(--color-text-accent); border-radius: 50%; animation: assistant-spin .8s linear infinite; }
@keyframes assistant-spin { to { transform: rotate(360deg); } }
@media (max-height: 560px) { .assistant-panel { max-height: calc(100% - var(--assistant-nav) - 8px); } .assistant-composer { padding: 6px 10px; gap: 4px; } .assistant-consent, .assistant-send-row small { font-size: 10px; } }
@media (prefers-reduced-motion: reduce) { .assistant-spinner { animation: none; } }
</style>
