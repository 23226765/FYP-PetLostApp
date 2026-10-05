<template>
  <div class="moderation-page">
    <header class="moderation-header">
      <button class="icon-button" type="button" :aria-label="t('moderation.back')" @click="router.back()">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div><h1>{{ t('moderation.title') }}</h1><p>{{ t('moderation.subtitle') }}</p></div>
      <button class="icon-button" type="button" :aria-label="t('common.refresh')" :disabled="loading" @click="loadReports()">
        <svg :class="{ spinning: loading }" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 1 0 2 5.3" /><path d="M20 4v7h-7" /></svg>
      </button>
    </header>

    <main class="moderation-content">
      <section v-if="!user" class="state-card">
        <span class="state-icon" aria-hidden="true">🔐</span>
        <h2>{{ t('moderation.signInTitle') }}</h2>
        <p>{{ t('moderation.signInHelp') }}</p>
        <button class="primary-button" type="button" @click="emit('auth-needed')">{{ t('authentication.signIn') }}</button>
      </section>

      <section v-else-if="user.role !== 'shelter_admin'" class="state-card" role="alert">
        <span class="state-icon" aria-hidden="true">🛡️</span>
        <h2>{{ t('moderation.deniedTitle') }}</h2>
        <p>{{ t('moderation.deniedHelp') }}</p>
      </section>

      <template v-else>
        <div class="queue-toolbar">
          <div class="filter-tabs" role="group" :aria-label="t('moderation.filterLabel')">
            <button
              v-for="option in statusOptions"
              :key="option"
              type="button"
              :class="{ active: statusFilter === option }"
              :aria-pressed="statusFilter === option"
              @click="setFilter(option)"
            >{{ t(`moderation.status.${option}`) }}</button>
          </div>
          <p class="queue-count">{{ t('moderation.reportCount', { count: total }, total) }}</p>
        </div>

        <div v-if="loading && !reports.length" class="skeleton-list" aria-live="polite" :aria-label="t('moderation.loading')">
          <div v-for="index in 3" :key="index" class="skeleton-card" />
        </div>
        <p v-else-if="loadError" class="error-card" role="alert">{{ loadError }}</p>
        <section v-else-if="!reports.length" class="state-card compact">
          <span class="state-icon" aria-hidden="true">✓</span>
          <h2>{{ t('moderation.emptyTitle') }}</h2>
          <p>{{ t('moderation.emptyHelp') }}</p>
        </section>

        <article v-for="report in reports" :key="report.id" class="report-card">
          <header class="report-heading">
            <div class="target-photo" aria-hidden="true">
              <ManagedImage v-if="report.target.photo" :src="report.target.photo" alt="" @error="hideBrokenImage" />
              <span>!</span>
            </div>
            <div class="target-copy">
              <p class="eyebrow">{{ t(`moderation.targets.${report.targetType}`) }}</p>
              <h2>{{ report.target.available ? (report.target.title || t('moderation.untitled')) : t('moderation.unavailable') }}</h2>
              <p v-if="report.target.subtitle">{{ report.target.subtitle }}</p>
            </div>
            <span class="status-badge" :class="`status-${report.status}`">{{ t(`moderation.status.${report.status}`) }}</span>
          </header>

          <p v-if="report.target.excerpt" class="content-excerpt">{{ report.target.excerpt }}</p>
          <dl class="report-meta">
            <div><dt>{{ t('moderation.reason') }}</dt><dd>{{ t(`safety.reasons.${report.reason}`) }}</dd></div>
            <div><dt>{{ t('moderation.reporter') }}</dt><dd>{{ report.reporter?.name || t('moderation.unavailable') }}</dd></div>
            <div><dt>{{ t('moderation.submitted') }}</dt><dd>{{ d(new Date(report.createdAt), 'dateTime') }}</dd></div>
          </dl>
          <div v-if="report.details" class="evidence"><strong>{{ t('moderation.details') }}</strong><p>{{ report.details }}</p></div>

          <section v-if="report.target.moderatable && report.target.moderation" class="visibility-panel">
            <div class="visibility-heading">
              <strong>{{ t('moderation.visibilityTitle') }}</strong>
              <span :class="`visibility-${report.target.moderation.status}`">
                {{ t(`moderation.visibility.${report.target.moderation.status}`) }}
              </span>
            </div>
            <p v-if="report.target.moderation.moderatedAt" class="visibility-audit">
              {{ t('moderation.visibilityAudit', {
                name: report.target.moderation.moderatedBy?.name || t('moderation.unavailable'),
                date: d(new Date(report.target.moderation.moderatedAt), 'dateTime'),
              }) }}
            </p>
            <p v-if="report.target.moderation.reason" class="visibility-reason">
              {{ report.target.moderation.reason }}
            </p>
            <label class="visibility-field">
              <span>{{ t('moderation.visibilityReason') }}</span>
              <textarea
                v-model="visibilityReasons[report.id]"
                rows="2"
                maxlength="1000"
                :placeholder="t('moderation.visibilityReasonPlaceholder')"
                :disabled="updatingId === report.id"
              />
            </label>
            <button
              v-if="report.target.moderation.status === 'visible'"
              class="visibility-action hide-content"
              type="button"
              :disabled="Boolean(updatingId)"
              @click="setVisibility(report, 'hidden')"
            >{{ t('moderation.hideContent') }}</button>
            <button
              v-else
              class="visibility-action restore-content"
              type="button"
              :disabled="Boolean(updatingId)"
              @click="setVisibility(report, 'visible')"
            >{{ t('moderation.restoreContent') }}</button>
          </section>

          <label class="note-field">
            <span>{{ t('moderation.note') }}</span>
            <textarea
              v-model="notes[report.id]"
              rows="2"
              maxlength="1000"
              :placeholder="t('moderation.notePlaceholder')"
              :disabled="updatingId === report.id"
            />
          </label>
          <p v-if="actionErrors[report.id]" class="inline-error" role="alert">{{ actionErrors[report.id] }}</p>
          <div class="review-actions">
            <button type="button" :disabled="Boolean(updatingId)" @click="decide(report, 'reviewed')">{{ t('moderation.markReviewed') }}</button>
            <button type="button" :disabled="Boolean(updatingId)" @click="decide(report, 'dismissed')">{{ t('moderation.dismiss') }}</button>
            <button class="actioned" type="button" :disabled="Boolean(updatingId)" @click="decide(report, 'actioned')">
              <span v-if="updatingId === report.id" class="button-spinner" aria-hidden="true" />
              {{ t('moderation.markActioned') }}
            </button>
          </div>
          <p v-if="report.review.reviewedAt" class="review-audit">
            {{ t('moderation.reviewedBy', { name: report.review.reviewedBy?.name || t('moderation.unavailable'), date: d(new Date(report.review.reviewedAt), 'dateTime') }) }}
          </p>
        </article>

        <button v-if="reports.length < total" class="load-more" type="button" :disabled="loading" @click="loadMore">
          {{ loading ? t('common.loading') : t('moderation.loadMore') }}
        </button>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import ManagedImage from "../components/ManagedImage.vue"
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { User } from '../types/user'
import type { ContentModerationStatus, ModerationReport, ModerationReportStatus } from '../types/safety'
import { getModerationReports, updateContentVisibility, updateModerationReport } from '../services/api'
import { translateApiError, useAppI18n } from '../i18n'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ (event: 'auth-needed'): void }>()
const router = useRouter()
const { t, d } = useAppI18n()
const statusOptions = ['pending', 'reviewed', 'dismissed', 'actioned', 'all'] as const
type StatusFilter = typeof statusOptions[number]

const reports = ref<ModerationReport[]>([])
const statusFilter = ref<StatusFilter>('pending')
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadError = ref('')
const updatingId = ref('')
const notes = reactive<Record<string, string>>({})
const visibilityReasons = reactive<Record<string, string>>({})
const actionErrors = reactive<Record<string, string>>({})
let requestSequence = 0

watch(
  () => `${props.user?.id || ''}:${props.user?.role || ''}`,
  () => {
    requestSequence += 1
    reports.value = []
    total.value = 0
    page.value = 1
    updatingId.value = ''
    for (const key of Object.keys(notes)) delete notes[key]
    for (const key of Object.keys(visibilityReasons)) delete visibilityReasons[key]
    for (const key of Object.keys(actionErrors)) delete actionErrors[key]
    if (props.user?.role === 'shelter_admin') void loadReports()
  },
  { immediate: true },
)

async function loadReports(append = false) {
  if (props.user?.role !== 'shelter_admin' || loading.value) return
  const sequence = ++requestSequence
  const requestedPage = append ? page.value + 1 : 1
  loading.value = true
  loadError.value = ''
  try {
    const result = await getModerationReports({ status: statusFilter.value, page: requestedPage, limit: 20 })
    if (sequence !== requestSequence) return
    reports.value = append ? [...reports.value, ...result.reports] : result.reports
    page.value = requestedPage
    total.value = result.pagination.total
    for (const report of result.reports) {
      notes[report.id] = report.review.note || ''
      visibilityReasons[report.id] = ''
    }
  } catch (error) {
    if (sequence === requestSequence) loadError.value = translateApiError(error, 'moderation.loadError')
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function setFilter(status: StatusFilter) {
  if (status === statusFilter.value) return
  requestSequence += 1
  loading.value = false
  statusFilter.value = status
  reports.value = []
  total.value = 0
  page.value = 1
  void loadReports()
}

function loadMore() {
  void loadReports(true)
}

async function decide(report: ModerationReport, status: ModerationReportStatus) {
  if (updatingId.value) return
  const actingUserId = props.user?.id
  updatingId.value = report.id
  actionErrors[report.id] = ''
  try {
    const updated = await updateModerationReport(report.id, { status, note: notes[report.id] || '' })
    if (!actingUserId || props.user?.id !== actingUserId || props.user.role !== 'shelter_admin') return
    if (statusFilter.value !== 'all' && statusFilter.value !== status) {
      reports.value = reports.value.filter((item) => item.id !== report.id)
      total.value = Math.max(0, total.value - 1)
    } else {
      reports.value = reports.value.map((item) => item.id === report.id ? updated : item)
      notes[updated.id] = updated.review.note || ''
    }
  } catch (error) {
    actionErrors[report.id] = translateApiError(error, 'moderation.updateError')
  } finally {
    updatingId.value = ''
  }
}

async function setVisibility(report: ModerationReport, status: ContentModerationStatus) {
  if (updatingId.value || !report.target.moderatable || !report.target.moderation) return
  const supportedTypes = ['pet', 'sighting', 'stray', 'comment'] as const
  type SupportedType = typeof supportedTypes[number]
  if (!supportedTypes.includes(report.targetType as SupportedType)) return
  const reason = (visibilityReasons[report.id] || '').trim()
  if (status === 'hidden' && !reason) {
    actionErrors[report.id] = t('moderation.visibilityReasonRequired')
    return
  }
  const actingUserId = props.user?.id
  updatingId.value = report.id
  actionErrors[report.id] = ''
  try {
    const updated = await updateContentVisibility(
      report.targetType as SupportedType,
      report.targetId,
      { moderationStatus: status, reason: reason || undefined },
    )
    if (!actingUserId || props.user?.id !== actingUserId || props.user.role !== 'shelter_admin') return
    report.target.moderation = updated.moderation
    visibilityReasons[report.id] = ''
  } catch (error) {
    actionErrors[report.id] = translateApiError(error, 'moderation.visibilityError')
  } finally {
    updatingId.value = ''
  }
}

function hideBrokenImage(event: Event) {
  ;(event.currentTarget as HTMLImageElement).hidden = true
}
</script>

<style scoped>
.moderation-page { position: fixed; inset: 0; z-index: 45; width: 100%; max-width: 480px; margin: 0 auto; overflow-y: auto; background: var(--page-bg); color: var(--text-primary); }
.moderation-header { position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 10px; padding: calc(var(--safe-top) + 10px) 16px 11px; border-bottom: 1px solid var(--divider); background: color-mix(in srgb, var(--page-bg) 94%, transparent); backdrop-filter: blur(16px); }
.moderation-header div { min-width: 0; text-align: center; }
.moderation-header h1 { margin: 0; font-size: 17px; font-weight: 850; }
.moderation-header p { margin: 2px 0 0; color: var(--text-secondary); font-size: 10.5px; font-weight: 650; }
.icon-button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--surface); color: var(--color-icon-primary); box-shadow: var(--shadow-card); }
.icon-button:focus-visible, button:focus-visible, textarea:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.icon-button:disabled { color: var(--color-disabled-text); box-shadow: none; }
.spinning { animation: spin .75s linear infinite; }
.moderation-content { padding: 16px 14px calc(var(--safe-bottom) + 40px); }
.queue-toolbar { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.filter-tabs { display: flex; gap: 6px; padding-bottom: 3px; overflow-x: auto; scrollbar-width: none; }
.filter-tabs button { min-height: 40px; flex: 0 0 auto; padding: 0 13px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text-secondary); font-size: 12px; font-weight: 800; }
.filter-tabs button.active { border-color: var(--color-border-accent); background: var(--color-surface-selected); color: var(--color-text-accent); }
.queue-count { margin: 0 3px; color: var(--text-secondary); font-size: 11.5px; font-weight: 700; }
.report-card, .state-card, .error-card { margin-bottom: 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-card); }
.report-card { padding: 15px; }
.report-heading { display: flex; align-items: flex-start; gap: 11px; }
.target-photo { position: relative; width: 48px; height: 48px; display: grid; place-items: center; flex: 0 0 48px; overflow: hidden; border-radius: 14px; background: var(--color-surface-selected); color: var(--color-text-accent); font-size: 19px; font-weight: 900; }
.target-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.target-copy { min-width: 0; flex: 1; }
.target-copy h2 { overflow: hidden; margin: 1px 0 0; font-size: 15px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.target-copy p { overflow: hidden; margin: 3px 0 0; color: var(--text-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.target-copy .eyebrow { margin: 0; color: var(--color-text-accent); font-size: 9.5px; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
.status-badge { flex: 0 0 auto; padding: 5px 8px; border-radius: 999px; background: var(--color-surface-subtle); color: var(--text-secondary); font-size: 9.5px; font-weight: 850; }
.status-pending { background: color-mix(in srgb, var(--warning) 14%, var(--surface)); color: var(--warning); }
.status-reviewed { background: var(--color-surface-selected); color: var(--color-text-accent); }
.status-actioned { background: color-mix(in srgb, var(--success) 14%, var(--surface)); color: var(--success); }
.content-excerpt, .evidence { margin: 12px 0 0; padding: 11px 12px; border-radius: 12px; background: var(--surface-soft); color: var(--text-primary); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.report-meta { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin: 13px 0 0; }
.report-meta div { min-width: 0; }
.report-meta dt { color: var(--text-secondary); font-size: 9.5px; font-weight: 800; text-transform: uppercase; }
.report-meta dd { overflow: hidden; margin: 3px 0 0; color: var(--text-primary); font-size: 11px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.evidence strong, .note-field span { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 850; }
.evidence p { margin: 0; white-space: pre-wrap; }
.visibility-panel { margin-top: 13px; padding: 12px; border: 1px solid var(--border); border-radius: 13px; background: var(--surface-soft); }
.visibility-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; }
.visibility-heading span { padding: 4px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 850; }
.visibility-visible { background: color-mix(in srgb, var(--success) 14%, var(--surface)); color: var(--success); }
.visibility-hidden { background: color-mix(in srgb, var(--error) 12%, var(--surface)); color: var(--error); }
.visibility-audit,.visibility-reason { margin: 7px 0 0; color: var(--text-secondary); font-size: 10.5px; line-height: 1.4; }
.visibility-reason { color: var(--text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.visibility-field { display: block; margin-top: 10px; color: var(--text-primary); }
.visibility-field span { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 850; }
.visibility-field textarea { width: 100%; min-height: 64px; padding: 10px 11px; resize: vertical; border: 1px solid var(--border); border-radius: 11px; background: var(--input-bg); color: var(--text-primary); font: inherit; font-size: 12px; line-height: 1.45; }
.visibility-action { width: 100%; min-height: 42px; margin-top: 9px; border-radius: 11px; font-size: 11px; font-weight: 850; }
.hide-content { background: var(--coral); color: var(--color-text-on-coral); }
.restore-content { background: var(--teal); color: var(--color-text-on-accent); }
.visibility-action:disabled { background: var(--color-disabled-surface); color: var(--color-disabled-text); }
.note-field { display: block; margin-top: 13px; color: var(--text-primary); }
.note-field textarea { width: 100%; min-height: 68px; padding: 10px 11px; resize: vertical; border: 1px solid var(--border); border-radius: 12px; background: var(--input-bg); color: var(--text-primary); font: inherit; font-size: 12px; line-height: 1.45; }
.review-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
.review-actions button { min-height: 44px; padding: 6px; border: 1px solid var(--border); border-radius: 11px; background: var(--surface-soft); color: var(--text-primary); font-size: 10.5px; font-weight: 800; }
.review-actions .actioned { border-color: var(--color-border-accent); background: var(--teal); color: var(--color-text-on-accent); }
.review-actions button:disabled { border-color: var(--color-disabled-border); background: var(--color-disabled-surface); color: var(--color-disabled-text); cursor: wait; }
.inline-error, .review-audit { margin: 8px 1px 0; font-size: 10.5px; font-weight: 700; }
.inline-error { color: var(--error); }
.review-audit { color: var(--text-secondary); }
.state-card { padding: 34px 24px; text-align: center; }
.state-card.compact { margin-top: 28px; }
.state-icon { width: 56px; height: 56px; display: grid; place-items: center; margin: 0 auto 12px; border-radius: 50%; background: var(--color-surface-selected); color: var(--color-text-accent); font-size: 24px; }
.state-card h2 { margin: 0; font-size: 18px; }
.state-card p { margin: 7px auto 0; max-width: 310px; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.primary-button, .load-more { min-height: 46px; border-radius: 13px; background: var(--teal); color: var(--color-text-on-accent); font-weight: 850; }
.primary-button { margin-top: 18px; padding: 0 22px; }
.load-more { width: 100%; margin-top: 2px; }
.error-card { padding: 14px; color: var(--error); font-size: 12.5px; font-weight: 750; }
.skeleton-card { height: 270px; margin-bottom: 14px; border-radius: 16px; background: linear-gradient(100deg, var(--surface) 35%, var(--surface-soft) 50%, var(--surface) 65%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
.button-spinner { display: inline-block; width: 12px; height: 12px; margin-right: 4px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; vertical-align: -2px; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position-x: -200%; } }
@media (max-width: 365px) { .report-meta { grid-template-columns: 1fr; } .review-actions { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .spinning, .skeleton-card, .button-spinner { animation-duration: .01ms; animation-iteration-count: 1; } }
</style>
