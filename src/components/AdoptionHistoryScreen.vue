<template>
  <!--
    AdoptionHistoryScreen.vue
    ─────────────────────────
    Displays the user's full activity history: sightings they reported,
    pets they posted, and any reunited outcomes.

    Navigation model:
      • Registered at /my-reports and opened from Profile/Settings activity links.

    Data is loaded from the authenticated activity APIs.

    Emits:
      close  – user tapped the back arrow
  -->
  <div class="history-screen">

    <!-- ── Sticky header ── -->
    <header class="top">
      <button class="back-btn" :aria-label="t('common.back')" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <h1>{{ t('profile.activityTitle') }}</h1>
      <span class="spacer" aria-hidden="true" />
    </header>

    <div v-if="celebrationMessage" class="celebration-banner" role="status">
      <span aria-hidden="true">🎉</span>
      <div>
        <strong>{{ t('profile.petsReunited') }}</strong>
        <p>{{ celebrationMessage }}</p>
      </div>
    </div>

    <!-- ── Summary stat strip ── -->
    <div class="stats">
      <div class="stat">
        <span class="num">{{ stats.sightings }}</span>
        <span class="lbl">{{ t('profile.sightingsReported') }}</span>
      </div>
      <div class="stat highlight">
        <span class="num">{{ stats.reunited }}</span>
        <span class="lbl">{{ t('profile.petsReunited') }}</span>
      </div>
      <div class="stat">
        <span class="num">{{ stats.posts }}</span>
        <span class="lbl">{{ t('profile.petsPosted') }}</span>
      </div>
    </div>

    <!-- ── Filter chips ── -->
    <div class="chips" role="group" :aria-label="t('profile.filterActivity')">
      <button
        v-for="chip in chips"
        :key="chip.value"
        class="chip"
        :class="{ active: activeFilter === chip.value }"
        @click="activeFilter = chip.value"
      >
        {{ chip.label }}
      </button>
    </div>

    <!-- ── Result count ── -->
    <p v-if="!loading && !loadError" class="count">{{ t('profile.activityEntries', { count: filtered.length }, filtered.length) }}</p>
    <div v-if="loading" class="load-state" role="status">{{ t('profile.loadingActivity') }}</div>
    <div v-else-if="loadError" class="load-state error" role="alert">
      <span>{{ loadError }}</span><button type="button" @click="loadEntries">{{ t('common.retry') }}</button>
    </div>

    <!-- ── Activity feed ── -->
    <div v-else-if="filtered.length > 0" class="feed">
      <article
        v-for="entry in filtered"
        :key="entry.id"
        class="entry-card"
        @click="selectedEntry = entry"
      >
        <!-- Pet thumbnail -->
        <div class="thumb-wrap">
          <ManagedImage :src="entry.petPhoto" :alt="t('pets.photoAlt', { name: entry.petName })" loading="lazy" />
          <!-- Outcome badge overlaid on thumbnail -->
          <span class="outcome-badge" :class="entry.outcome">
            {{ outcomeLabel(entry.outcome) }}
          </span>
        </div>

        <!-- Entry body -->
        <div class="entry-body">
          <div class="entry-row">
            <h3>{{ entry.petName }}</h3>
            <span class="entry-date">{{ entry.dateAgo }}</span>
          </div>
          <p class="entry-meta">{{ entry.breed }} · {{ entry.location }}</p>
          <div class="entry-type-row">
            <!-- Pill showing what the user did -->
            <span class="type-pill" :class="entry.type">
              <AppIcon :name="typePillIcon(entry.type)" :size="13" />
              {{ typePillLabel(entry.type) }}
            </span>
            <!-- Reward badge if applicable -->
            <span v-if="entry.reward" class="reward">{{ entry.reward }}</span>
          </div>
        </div>
      </article>
    </div>

    <!-- ── Empty state ── -->
    <div v-else-if="!loading" class="empty" role="status">
      <span class="empty-icon">
        <AppIcon name="paw" :size="32" />
      </span>
      <h2>{{ t('profile.nothingHere') }}</h2>
      <p>{{ t('profile.nothingHelp') }}</p>
    </div>

    <!-- ── Entry detail bottom sheet ── -->
    <Transition name="fade">
      <div v-if="selectedEntry" class="scrim" @click.self="selectedEntry = null">
        <div class="sheet" role="dialog" aria-modal="true" :aria-label="t('profile.activityDetails', { name: selectedEntry.petName })">
          <div class="grab" />

          <!-- Sheet header -->
          <div class="sheet-head">
            <ManagedImage :src="selectedEntry.petPhoto" :alt="t('pets.photoAlt', { name: selectedEntry.petName })" />
            <div>
              <h2>{{ selectedEntry.petName }}</h2>
              <p>{{ selectedEntry.breed }} · {{ selectedEntry.location }}</p>
            </div>
            <span class="outcome-badge lg" :class="selectedEntry.outcome">
              {{ outcomeLabel(selectedEntry.outcome) }}
            </span>
          </div>

          <!-- Detail rows -->
          <ul class="detail-rows">
            <li>
              <span class="detail-icon"><AppIcon name="pin" :size="16" /></span>
              <div>
                <span class="detail-label">{{ t('profile.location') }}</span>
                <span class="detail-value">{{ selectedEntry.location }}</span>
              </div>
            </li>
            <li>
              <span class="detail-icon"><AppIcon name="list" :size="16" /></span>
              <div>
                <span class="detail-label">{{ t('profile.activityType') }}</span>
                <span class="detail-value">{{ typePillLabel(selectedEntry.type) }}</span>
              </div>
            </li>
            <li v-if="selectedEntry.note">
              <span class="detail-icon"><AppIcon name="eye" :size="16" /></span>
              <div>
                <span class="detail-label">{{ t('profile.yourNote') }}</span>
                <span class="detail-value">{{ selectedEntry.note }}</span>
              </div>
            </li>
            <li v-if="selectedEntry.reward">
              <span class="detail-icon"><AppIcon name="check" :size="16" /></span>
              <div>
                <span class="detail-label">{{ t('pets.rewardLabel') }}</span>
                <span class="detail-value reward-text">{{ selectedEntry.reward }}</span>
              </div>
            </li>
          </ul>

          <section v-if="selectedEntry.type === 'sighting'" class="contact-panel">
            <div class="contact-copy">
              <span class="contact-title">{{ t('profile.contactOwner') }}</span>
              <span class="contact-sub">{{ t('profile.contactOwnerHelp') }}</span>
            </div>
            <div class="contact-actions">
              <button
                v-if="selectedEntry.petId"
                class="contact-action message"
                type="button"
                :aria-label="t('profile.messageOwnerAria', { name: selectedEntry.petName })"
                @click="messagePetOwner(selectedEntry)"
              >
                <AppIcon name="message" :size="18" />
                {{ t('messages.message') }}
              </button>
              <a
                v-if="selectedContactActions"
                class="contact-action call"
                :href="selectedContactActions.callHref"
                :aria-label="t('profile.callOwnerAria', { name: selectedEntry.petName })"
              >
                <AppIcon name="phone" :size="18" />
                {{ t('sightings.callReporter') }}
              </a>
              <a
                v-if="selectedContactActions"
                class="contact-action whatsapp"
                :href="selectedContactActions.whatsappHref"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="t('profile.whatsappOwnerAria', { name: selectedEntry.petName })"
              >
                WhatsApp
              </a>
            </div>
            <span v-if="!selectedContactActions" class="contact-unavailable">
              {{ t('profile.contactUnavailable') }}
            </span>
          </section>

          <button
            v-if="selectedEntry.type === 'post' && selectedEntry.outcome === 'lost'"
            class="reunited-action"
            type="button"
            @click="requestReunion(selectedEntry)"
          >
            <span aria-hidden="true">🎉</span>
            {{ t('pets.markReunited') }}
          </button>
          <p v-if="reunionError" class="reunion-error" role="alert">{{ reunionError }}</p>

          <button class="sheet-close" @click="selectedEntry = null">{{ t('common.done') }}</button>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="reunionTarget" class="reunion-scrim" @click.self="closeReunionConfirmation">
        <section
          class="reunion-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-reunion-title"
        >
          <span class="reunion-dialog-icon" aria-hidden="true">🎉</span>
          <h2 id="history-reunion-title">{{ t('pets.reunionQuestion') }}</h2>
          <p>
            {{ t('pets.reunionHelp', { name: reunionTarget.petName }) }}
          </p>
          <p v-if="reunionError" class="reunion-dialog-error" role="alert">
            {{ reunionError }}
          </p>
          <div class="reunion-dialog-actions">
            <button
              class="cancel-reunion"
              type="button"
              :disabled="reunionSaving"
              @click="closeReunionConfirmation"
            >
              {{ t('pets.notYet') }}
            </button>
            <button
              class="confirm-reunion"
              type="button"
              :disabled="reunionSaving"
              @click="confirmReunion"
            >
              {{ reunionSaving ? t('pets.updating') : t('pets.yesHome') }}
            </button>
          </div>
        </section>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import ManagedImage from "./ManagedImage.vue"
import { computed, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { getMyPets, getMySightings, updatePetStatus } from '../services/api'
import type { MySighting } from '../services/api'
import type { Pet } from '../types/pet'
import { createContactActions } from '../utils/contact'
import { translateApiError, useAppI18n } from '../i18n'
import { formatRelativeDate, petStatusLabel } from '../i18n/formatters'

/* ── Emits ── */
const emit = defineEmits<{
  close: []
  'message-pet': [petId: string]
}>()
const { t } = useAppI18n()

/* ── Types ── */
type Outcome = 'reunited' | 'sighted' | 'lost'
type ActivityType = 'sighting' | 'post'

interface HistoryEntry {
  id: string
  petId?: string
  petName: string
  breed: string
  petPhoto: string
  location: string
  dateAgo: string
  type: ActivityType
  outcome: Outcome
  note?: string
  reward?: string
  ownerPhone?: string
  canViewContact?: boolean
}

/* Activity data loaded from the authenticated pet and sighting APIs. */
const entries = ref<HistoryEntry[]>([])
const loading = ref(true)
const loadError = ref('')

function toHistoryEntry(pet: Pet): HistoryEntry {
  return {
    id: `post:${pet.id}`,
    petId: pet.id,
    petName: pet.name,
    breed: pet.breed || pet.species,
    petPhoto: pet.photo,
    location: pet.location,
    dateAgo: pet.createdAt ? formatRelativeDate(pet.createdAt) : pet.postedAgo,
    type: 'post',
    outcome: pet.status,
    note: pet.description,
    reward: pet.reward,
  }
}

function sightingToHistoryEntry(sighting: MySighting): HistoryEntry {
  return {
    id: `sighting:${sighting._id}`,
    petId: sighting.pet?._id,
    petName: sighting.pet?.name || t('profile.petSighting'),
    breed: t('profile.reportedSighting'),
    petPhoto: sighting.pet?.photo || sighting.photo || '',
    location: sighting.locationName || t('sightings.locationNotProvided'),
    dateAgo: formatRelativeDate(sighting.sightedAt || sighting.createdAt),
    type: 'sighting',
    outcome: sighting.pet?.status || 'sighted',
    note: sighting.note || undefined,
    ownerPhone: sighting.pet?.ownerPhone,
    canViewContact: sighting.pet?.canViewContact,
  }
}

async function loadEntries() {
  loading.value = true
  loadError.value = ''
  try {
    const [pets, sightings] = await Promise.all([getMyPets(), getMySightings()])
    entries.value = [
      ...sightings.map(sightingToHistoryEntry),
      ...pets.map(toHistoryEntry),
    ]
  } catch (caught) {
    entries.value = []
    loadError.value = translateApiError(caught, 'errors.loadActivity')
  } finally {
    loading.value = false
  }
}

onMounted(loadEntries)

/* ── Filter chips ── */
type ChipValue = 'all' | 'sightings' | 'posts'
const chips = computed(() => [
  { value: 'all' as const, label: t('profile.filterAll') },
  { value: 'sightings' as const, label: t('profile.filterSightings') },
  { value: 'posts' as const, label: t('profile.filterPosts') },
])
const activeFilter = ref<ChipValue>('all')

const filtered = computed<HistoryEntry[]>(() => {
  if (activeFilter.value === 'all') return entries.value
  const map: Record<ChipValue, ActivityType | null> = {
    all: null,
    sightings: 'sighting',
    posts: 'post',
  }
  const t = map[activeFilter.value]
  return t ? entries.value.filter((entry) => entry.type === t) : entries.value
})

/* ── Selected entry for the detail sheet ── */
const selectedEntry = ref<HistoryEntry | null>(null)
const reunionTarget = ref<HistoryEntry | null>(null)
const reunionSaving = ref(false)
const reunionError = ref('')
const celebrationMessage = ref('')
const selectedContactActions = computed(() => {
  if (!selectedEntry.value?.canViewContact) return null
  const message = t('pets.contactMessage', {
    name: selectedEntry.value.petName,
    location: `, ${selectedEntry.value.location}`,
  })
  return createContactActions(selectedEntry.value.ownerPhone, message)
})

function messagePetOwner(entry: HistoryEntry) {
  if (!entry.petId) return
  selectedEntry.value = null
  emit('message-pet', entry.petId)
}

function requestReunion(entry: HistoryEntry) {
  reunionError.value = ''
  reunionTarget.value = entry
}

function closeReunionConfirmation() {
  if (reunionSaving.value) return
  reunionTarget.value = null
  reunionError.value = ''
}

async function confirmReunion() {
  const target = reunionTarget.value
  if (!target?.petId || target.type !== 'post' || target.outcome !== 'lost' || reunionSaving.value) {
    return
  }

  reunionSaving.value = true
  reunionError.value = ''
  try {
    const updatedPet = await updatePetStatus(target.petId, 'reunited')
    entries.value = entries.value.map((entry) =>
      entry.petId && String(entry.petId) === String(updatedPet.id)
        ? { ...entry, outcome: updatedPet.status }
        : entry,
    )
    if (selectedEntry.value) {
      selectedEntry.value =
        entries.value.find((entry) => entry.id === selectedEntry.value?.id) || selectedEntry.value
    }
    celebrationMessage.value = t('profile.reunionCelebration', { name: updatedPet.name })
    reunionTarget.value = null
  } catch (error) {
    reunionError.value = translateApiError(error, 'errors.markReunited')
  } finally {
    reunionSaving.value = false
  }
}

/* ── Summary stats (derived from full entries list) ── */
const stats = computed(() => ({
  sightings: entries.value.filter((entry) => entry.type === 'sighting').length,
  reunited: entries.value.filter((entry) => entry.outcome === 'reunited').length,
  posts: entries.value.filter((entry) => entry.type === 'post').length,
}))

/* ── Helper: human-readable outcome label ── */
function outcomeLabel(outcome: Outcome): string {
  return petStatusLabel(outcome).toLocaleUpperCase()
}

/* ── Helper: icon name for activity type pill ── */
function typePillIcon(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    sighting: 'eye',
    post: 'radar',
  }
  return map[type]
}

/* ── Helper: label for activity type pill ── */
function typePillLabel(type: ActivityType): string {
  return t(type === 'sighting' ? 'profile.sightingReported' : 'profile.petPosted')
}
</script>

<style scoped>
/* ─────────────────────────────────────────────
   Screen shell
───────────────────────────────────────────── */
.history-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: calc(var(--safe-bottom) + 40px);
  max-width: 480px;
  margin: 0 auto;
}

/* ── Sticky header ── */
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--safe-top) + 14px) 18px 14px;
  position: sticky;
  top: 0;
  background: rgba(252, 249, 242, 0.92);
  backdrop-filter: blur(10px);
  z-index: 10;
  border-bottom: 1px solid var(--line);
}

.back-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  color: var(--ink);
  flex-shrink: 0;
}

h1 {
  font-size: 17px;
  font-weight: 800;
  color: var(--ink);
}

.spacer {
  width: 40px;
}

.celebration-banner {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin: 14px 18px 0;
  padding: 14px 16px;
  border: 1px solid rgba(29, 99, 96, 0.18);
  border-radius: 14px;
  background: rgba(29, 99, 96, 0.1);
  color: var(--color-icon-primary);
}

.celebration-banner > span {
  font-size: 22px;
  line-height: 1;
}

.celebration-banner strong {
  display: block;
  font-size: 14px;
  font-weight: 800;
}

.celebration-banner p {
  margin-top: 3px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
}

/* ── Stats strip — mirrors ProfileScreen .stats ── */
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 18px 18px 0;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px 8px;
  box-shadow: var(--shadow-card);
  text-align: center;
}

.stat.highlight {
  background: var(--teal);
}

.stat.highlight .num,
.stat.highlight .lbl {
  color: #fff;
}

.num {
  font-size: 22px;
  font-weight: 800;
  color: var(--ink);
}

.lbl {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-muted);
}

/* ── Filter chips — mirrors RadarScreen .chips ── */
.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 16px 18px 0;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  padding: 7px 16px;
  border-radius: 999px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
  white-space: nowrap;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.chip.active {
  background: var(--teal);
  border-color: var(--color-border-accent);
  color: #fff;
}

/* ── Count label ── */
.count {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
  padding: 12px 18px 4px;
}

.load-state {
  margin: 18px;
  padding: 28px 16px;
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
  box-shadow: var(--shadow-card);
}

.load-state.error {
  color: var(--color-text-urgent);
}

.load-state button {
  display: block;
  min-height: 42px;
  margin: 12px auto 0;
  padding: 0 18px;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-weight: 800;
}

/* ── Activity feed ── */
.feed {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 18px;
}

/* ── Entry card — mirrors PetCard card pattern ── */
.entry-card {
  display: flex;
  gap: 14px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.entry-card:active {
  transform: scale(0.98);
}

/* Thumbnail */
.thumb-wrap {
  position: relative;
  width: 96px;
  flex-shrink: 0;
}

.thumb-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Outcome badge on thumbnail */
.outcome-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
}

.outcome-badge.reunited,
.outcome-badge.adopted {
  background: var(--teal);
}

.outcome-badge.sighted {
  background: #6b9e9b; /* muted teal for in-progress */
}

.outcome-badge.lost {
  background: var(--coral);
}

/* Larger badge variant used in the detail sheet */
.outcome-badge.lg {
  position: static;
  font-size: 11.5px;
  padding: 4px 12px;
  flex-shrink: 0;
}

/* Entry body */
.entry-body {
  flex: 1;
  padding: 14px 14px 14px 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.entry-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

h3 {
  font-size: 16px;
  font-weight: 800;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-date {
  font-size: 12px;
  color: var(--ink-muted);
  font-weight: 600;
  flex-shrink: 0;
}

.entry-meta {
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

/* Activity type pill */
.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.type-pill.sighting {
  background: var(--teal-soft);
  color: var(--color-text-accent);
}

.type-pill.post {
  background: #fde8e4; /* coral-soft */
  color: var(--color-text-urgent);
}

.type-pill.adoption {
  background: var(--teal-soft);
  color: var(--color-text-accent);
}

.reward {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--color-text-urgent);
}

/* ── Empty state — mirrors PostPetScreen .success ── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 56px 24px;
  gap: 10px;
}

.empty-icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  margin-bottom: 6px;
}

.empty h2 {
  font-size: 20px;
  font-weight: 800;
}

.empty p {
  font-size: 14px;
  color: var(--ink-muted);
  max-width: 280px;
  line-height: 1.6;
}

/* ── Bottom sheet (detail) — mirrors App.vue .sheet pattern ── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(61, 56, 53, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border-radius: 26px 26px 0 0;
  padding: 10px 20px calc(var(--safe-bottom) + 24px);
  animation: sheet-up 0.3s cubic-bezier(0.3, 0.8, 0.4, 1);
}

.grab {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: var(--line);
  margin: 0 auto 18px;
}

/* Sheet header */
.sheet-head {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 18px;
}

.sheet-head img {
  width: 58px;
  height: 58px;
  border-radius: var(--radius-md);
  object-fit: cover;
  flex-shrink: 0;
}

.sheet-head h2 {
  font-size: 18px;
  font-weight: 800;
  flex: 1;
}

.sheet-head p {
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
}

/* Detail rows */
.detail-rows {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 16px;
}

.detail-rows li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--surface);
  padding: 13px 16px;
}

.detail-icon {
  color: var(--color-text-accent);
  margin-top: 2px;
  flex-shrink: 0;
}

.detail-rows li > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.detail-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--ink);
}

.reward-text {
  color: var(--color-text-urgent);
}

.contact-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(29, 99, 96, 0.14);
  border-radius: var(--radius-md);
  background: rgba(29, 99, 96, 0.06);
}

.contact-copy {
  display: flex;
  flex: 1 1 150px;
  flex-direction: column;
  gap: 1px;
}

.contact-title {
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
}

.contact-sub,
.contact-unavailable {
  color: var(--ink-muted);
  font-size: 12px;
  font-weight: 600;
}

.contact-actions {
  display: flex;
  gap: 8px;
}

.contact-action {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 999px;
  color: var(--color-icon-primary);
  font-size: 12.5px;
  font-weight: 800;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  border: 0;
  cursor: pointer;
}

.contact-action:active {
  transform: scale(0.96);
}

.contact-action.call {
  background: #1d6360;
  color: #fff;
  box-shadow: 0 5px 14px rgba(29, 99, 96, 0.2);
}

.contact-action.message {
  background: rgba(29, 99, 96, 0.1);
  color: var(--color-text-accent);
}

.contact-action.whatsapp {
  border: 1px solid rgba(29, 99, 96, 0.18);
  background: var(--color-surface-subtle);
}

.reunited-action {
  width: 100%;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
  border: 1px solid rgba(29, 99, 96, 0.2);
  border-radius: 14px;
  background: rgba(29, 99, 96, 0.1);
  color: var(--color-text-accent);
  font-size: 15px;
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.reunited-action:active {
  transform: scale(0.98);
  background: rgba(29, 99, 96, 0.16);
}

.reunion-error,
.reunion-dialog-error {
  color: var(--color-text-urgent);
  font-size: 12.5px;
  font-weight: 700;
  text-align: center;
}

.reunion-error {
  margin: 0 4px 10px;
}

.reunion-scrim {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(20, 35, 34, 0.52);
  backdrop-filter: blur(3px);
}

.reunion-dialog {
  width: min(100%, 400px);
  padding: 24px 20px 20px;
  border-radius: 18px;
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  box-shadow: 0 22px 60px rgba(20, 35, 34, 0.3);
  text-align: center;
}

.reunion-dialog-icon {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: rgba(29, 99, 96, 0.1);
  font-size: 26px;
}

.reunion-dialog h2 {
  color: var(--ink);
  font-size: 20px;
  line-height: 1.25;
}

.reunion-dialog > p:not(.reunion-dialog-error) {
  margin: 9px auto 20px;
  max-width: 330px;
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.5;
}

.reunion-dialog-error {
  margin: -8px 0 14px;
}

.reunion-dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 10px;
}

.reunion-dialog-actions button {
  min-height: 46px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.reunion-dialog-actions button:not(:disabled):active {
  transform: scale(0.98);
}

.reunion-dialog-actions button:disabled {
  cursor: wait;
  border-color: var(--color-disabled-border);
  background: var(--color-disabled-surface);
  color: var(--color-disabled-text);
  box-shadow: none;
}

.cancel-reunion {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-muted);
}

.confirm-reunion {
  background: #1d6360;
  color: #fff;
  box-shadow: 0 8px 20px rgba(29, 99, 96, 0.24);
}

/* Sheet close button — matches App.vue .sheet-send */
.sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 16px 0;
  border-radius: var(--radius-md);
  background: var(--teal);
  color: #fff;
  font-size: 15.5px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
}
</style>
