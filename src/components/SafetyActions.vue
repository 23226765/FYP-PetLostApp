<template>
  <div class="safety-actions" :class="{ compact }">
    <button class="safety-link" type="button" @click="openReport">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 21V4a1 1 0 0 1 1-1h10l-1 4 3 3H6" />
      </svg>
      {{ t('safety.report') }}
    </button>
    <button v-if="!reportOnly && subjectUserId && !blocked" class="safety-link" type="button" @click="openBlock">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" />
      </svg>
      {{ t('safety.block') }}
    </button>

    <Teleport to="body">
      <div v-if="mode" class="safety-scrim" @click.self="close" @keydown.esc="close">
        <section
          ref="dialog"
          class="safety-sheet"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="mode === 'report' ? 'safety-report-title' : 'safety-block-title'"
          tabindex="-1"
        >
          <button class="close-button" type="button" :aria-label="t('common.close')" @click="close">×</button>
          <template v-if="mode === 'report'">
            <h2 id="safety-report-title">{{ t('safety.reportTitle') }}</h2>
            <p>{{ t('safety.reportHelp') }}</p>
            <form @submit.prevent="submitReport">
              <label>
                <span>{{ t('safety.reason') }}</span>
                <select v-model="reason" required>
                  <option v-for="option in reasonOptions" :key="option" :value="option">
                    {{ t(`safety.reasons.${option}`) }}
                  </option>
                </select>
              </label>
              <label>
                <span>{{ t('safety.details') }}</span>
                <textarea v-model="details" maxlength="1000" rows="4" :placeholder="t('safety.detailsPlaceholder')" />
              </label>
              <p v-if="message" :class="{ error: failed }" :role="failed ? 'alert' : 'status'">{{ message }}</p>
              <button class="primary" type="submit" :disabled="busy">
                {{ busy ? t('common.saving') : t('safety.submitReport') }}
              </button>
            </form>
          </template>
          <template v-else>
            <h2 id="safety-block-title">{{ t('safety.blockTitle', { name: subjectLabel || t('safety.thisUser') }) }}</h2>
            <p>{{ t('safety.blockHelp') }}</p>
            <p v-if="message" :class="{ error: failed }" :role="failed ? 'alert' : 'status'">{{ message }}</p>
            <div class="sheet-actions">
              <button type="button" @click="close">{{ t('common.cancel') }}</button>
              <button class="danger" type="button" :disabled="busy" @click="confirmBlock">
                {{ busy ? t('common.saving') : t('safety.confirmBlock') }}
              </button>
            </div>
          </template>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { User } from '../types/user'
import type { ReportReason, ReportTargetType } from '../types/safety'
import { blockUser, reportContent } from '../services/api'
import { translateApiError, useAppI18n } from '../i18n'

const props = defineProps<{
  targetType: ReportTargetType
  targetId: string
  subjectUserId?: string
  subjectLabel?: string
  user?: User | null
  blocked?: boolean
  reportOnly?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ 'auth-needed': []; blocked: [userId: string] }>()
const { t } = useAppI18n()
const mode = ref<'report' | 'block' | null>(null)
const reason = ref<ReportReason>('spam')
const details = ref('')
const busy = ref(false)
const message = ref('')
const failed = ref(false)
const dialog = ref<HTMLElement | null>(null)
const reasonOptions: ReportReason[] = ['spam', 'scam', 'harassment', 'unsafe', 'misinformation', 'other']

async function show(nextMode: 'report' | 'block') {
  if (!props.user) {
    emit('auth-needed')
    return
  }
  mode.value = nextMode
  message.value = ''
  failed.value = false
  await nextTick()
  dialog.value?.focus()
}

function openReport() { void show('report') }
function openBlock() { void show('block') }
function close() { if (!busy.value) mode.value = null }

watch(() => props.user?.id, () => {
  mode.value = null
  message.value = ''
  failed.value = false
  details.value = ''
})

async function submitReport() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    const report = await reportContent({
      targetType: props.targetType,
      targetId: props.targetId,
      reason: reason.value,
      details: details.value,
    })
    message.value = report.duplicate ? t('safety.alreadyReported') : t('safety.reportSubmitted')
    details.value = ''
  } catch (error) {
    failed.value = true
    message.value = translateApiError(error, 'safety.submitError')
  } finally {
    busy.value = false
  }
}

async function confirmBlock() {
  if (!props.subjectUserId || busy.value) return
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    await blockUser(props.subjectUserId)
    emit('blocked', props.subjectUserId)
    mode.value = null
  } catch (error) {
    failed.value = true
    message.value = translateApiError(error, 'safety.blockError')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.safety-actions{display:flex;justify-content:flex-end;gap:8px;padding:8px 2px}.safety-actions.compact{padding:1px 0}.safety-link{min-height:44px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border-radius:999px;color:var(--color-text-muted);font-size:12px;font-weight:750}.compact .safety-link{min-height:36px;padding:0 8px;font-size:11px}.safety-link:hover{background:var(--color-surface-selected);color:var(--color-text-accent)}.safety-link:active{transform:scale(.98)}.safety-link svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.safety-scrim{position:fixed;inset:0;z-index:120;display:flex;align-items:flex-end;justify-content:center;background:var(--overlay)}.safety-sheet{position:relative;width:100%;max-width:480px;padding:24px 18px calc(var(--safe-bottom) + 22px);border-radius:24px 24px 0 0;background:var(--color-surface-elevated);color:var(--color-text-primary);box-shadow:var(--shadow-modal);outline:none}.safety-sheet:focus-visible{box-shadow:0 0 0 3px var(--focus-ring),var(--shadow-modal)}.safety-sheet h2{margin:0 42px 6px 0;font-size:20px}.safety-sheet>p{margin:0 0 18px;color:var(--color-text-muted);font-size:13px;line-height:1.5}.close-button{position:absolute;top:15px;right:15px;width:44px;height:44px;border-radius:50%;background:var(--color-surface-selected);color:var(--color-text-primary);font-size:24px}.safety-sheet form,.safety-sheet label{display:grid;gap:8px}.safety-sheet form{gap:15px}.safety-sheet label span{font-size:12px;font-weight:800}.safety-sheet select,.safety-sheet textarea{width:100%;padding:12px;border:1px solid var(--color-border);border-radius:12px;background:var(--input-bg);color:var(--color-text-primary)}.safety-sheet textarea{resize:vertical}.safety-sheet form>p,.safety-sheet .sheet-actions+p{margin:0;color:var(--success);font-size:12px}.safety-sheet p.error{color:var(--error)}.primary,.sheet-actions button{min-height:46px;padding:0 16px;border-radius:13px;font-weight:800}.primary{background:var(--teal);color:var(--color-text-on-accent)}.sheet-actions{display:flex;justify-content:flex-end;gap:9px}.sheet-actions button{background:var(--color-surface-selected);color:var(--color-text-primary)}.sheet-actions .danger{background:var(--coral);color:var(--color-text-on-coral)}button:disabled{opacity:.58;cursor:not-allowed}@media(prefers-reduced-motion:reduce){.safety-link{transition:none}}
</style>
