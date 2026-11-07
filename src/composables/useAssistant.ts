import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ASSISTANT_LIMITS, assistantTopics, findReviewedHelp, unknownReviewedHelp, type AssistantLocale } from '../../shared/assistantGuidance.js'
import { captureAuthContext, isAuthContextCurrent, type AuthContext } from '../services/authSession'
import { askAssistant, assistantStatus, AssistantRequestError, type AssistantRequest, type AssistantTurn } from '../services/assistant'
import { useAppI18n } from '../i18n'

export interface AssistantMessage { id: number; role: 'user' | 'assistant'; mode?: 'reviewed' | 'ai'; text: string; topicId?: string }
interface Pending { payload: AssistantRequest; context: AuthContext; userId: number; generation: number }

export function useAssistant() {
  const { locale } = useAppI18n()
  const messages = ref<AssistantMessage[]>([])
  const draft = ref(''), error = ref(''), notice = ref('')
  const busy = ref(false), consent = ref(false), enabled = ref<boolean | null>(null)
  const pending = ref<Pending | null>(null)
  const topics = computed(() => assistantTopics(locale.value))
  let history: AssistantTurn[] = []
  let nextId = 0, generation = 0, sequence = 0, statusSequence = 0
  let alive = true
  let controller: AbortController | null = null, statusController: AbortController | null = null

  function stop() {
    sequence++
    controller?.abort()
    controller = null
    busy.value = false
    if (pending.value) notice.value = 'stopped'
  }
  function clear() {
    stop(); generation++; statusSequence++
    statusController?.abort(); statusController = null
    messages.value = []; history = []; draft.value = ''; pending.value = null
    error.value = ''; notice.value = ''; consent.value = false; enabled.value = null
  }
  // Synchronous: do not leave a Vue render tick where another account sees old text.
  window.addEventListener('auth:changed', clear)
  watch(locale, () => { stop(); pending.value = null; error.value = ''; notice.value = ''; statusSequence++; statusController?.abort() }, { flush: 'sync' })
  // Revocation invalidates the operation immediately, including a quick
  // withdraw/reaccept cycle before a provider promise settles.
  watch(consent, granted => { if (!granted) { stop(); error.value = '' } }, { flush: 'sync' })

  function append(message: Omit<AssistantMessage, 'id'>) {
    const entry = { ...message, id: ++nextId }
    messages.value = [...messages.value, entry].slice(-ASSISTANT_LIMITS.transcript)
    return entry.id
  }
  function reviewed(text: string, topicId: string, answer: string) {
    stop(); pending.value = null; error.value = ''; notice.value = ''
    append({ role: 'user', text })
    append({ role: 'assistant', mode: 'reviewed', topicId, text: answer })
  }
  function chooseTopic(id: string) {
    const topic = topics.value.find(topic => topic.id === id)
    if (topic) reviewed(topic.question, topic.id, topic.answer)
  }
  function messageText(message: AssistantMessage) {
    return message.mode === 'reviewed' ? topics.value.find(topic => topic.id === message.topicId)?.answer || unknownReviewedHelp(locale.value).answer : message.text
  }
  function trimHistory() {
    history = history.slice(-ASSISTANT_LIMITS.history)
    while (history.reduce((size, turn) => size + turn.content.length, 0) > ASSISTANT_LIMITS.context) history.splice(0, 2)
  }
  async function run(operation: Pending) {
    if (!alive || !consent.value || operation.generation !== generation || operation.payload.locale !== locale.value || !isAuthContextCurrent(operation.context)) return
    stop()
    const requestSequence = ++sequence, requestController = new AbortController()
    controller = requestController
    busy.value = true; error.value = ''; notice.value = ''
    const current = () => alive && consent.value && sequence === requestSequence && generation === operation.generation
      && operation.payload.locale === locale.value && isAuthContextCurrent(operation.context) && !requestController.signal.aborted
    try {
      const response = await askAssistant(operation.payload, requestController.signal)
      if (!current()) return
      append({ role: 'assistant', mode: response.mode, text: response.text, topicId: response.topicId })
      if (response.mode === 'ai') {
        history.push({ role: 'user', content: operation.payload.text }, { role: 'assistant', content: response.text })
        trimHistory()
      }
      pending.value = null
      if (draft.value.trim() === operation.payload.text) draft.value = ''
    } catch (failure) {
      if (!current()) return
      error.value = failure instanceof AssistantRequestError ? failure.code : 'ASSISTANT_UNAVAILABLE'
    } finally {
      if (current()) { busy.value = false; controller = null }
    }
  }
  async function send() {
    if (busy.value) return
    const text = draft.value.trim()
    if (!text || text.length > ASSISTANT_LIMITS.text) { error.value = 'ASSISTANT_INVALID_REQUEST'; return }
    const help = findReviewedHelp(text, locale.value)
    if (help) { reviewed(text, help.id, help.answer); draft.value = ''; return }
    if (enabled.value === false) { error.value = 'ASSISTANT_DISABLED'; return }
    if (!consent.value) { error.value = 'ASSISTANT_CONSENT_REQUIRED'; return }
    if (pending.value?.payload.text === text && pending.value.payload.locale === locale.value) { await retry(); return }
    trimHistory()
    const operation: Pending = {
      payload: { text, locale: locale.value as AssistantLocale, history: history.map(turn => ({ ...turn })), consent: true },
      context: captureAuthContext(), generation, userId: append({ role: 'user', text }),
    }
    pending.value = operation
    await run(operation)
  }
  async function retry() {
    if (!busy.value && pending.value && consent.value) await run(pending.value)
  }
  async function checkStatus() {
    const requestSequence = ++statusSequence, context = captureAuthContext()
    statusController?.abort()
    const requestController = new AbortController()
    statusController = requestController
    try {
      const status = await assistantStatus(requestController.signal)
      if (alive && statusSequence === requestSequence && isAuthContextCurrent(context)) enabled.value = status
    } catch { /* Reviewed help remains available; an explicit send shows useful errors. */ }
  }
  onBeforeUnmount(() => { alive = false; clear(); window.removeEventListener('auth:changed', clear) })
  return { messages, draft, error, notice, busy, consent, enabled, pending, topics, chooseTopic, messageText, send, retry, stop, clear, checkStatus }
}
