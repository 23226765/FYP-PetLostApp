<template>
  <!--
    AdoptionHistoryScreen.vue
    ─────────────────────────
    Displays the user's full activity history: sightings they reported,
    pets they posted, and any reunited/adopted outcomes.

    Navigation model:
      • Accessed from ProfileScreen via an "Activity" row (see integration notes).
      • Slides in as a full-screen overlay using App.vue's existing
        <Transition name="page"> pattern — identical to PetDetail.vue.

    Props:
      (none — data is self-contained mock data; swap for API calls in production)

    Emits:
      close  – user tapped the back arrow
  -->
  <div class="history-screen">

    <!-- ── Sticky header ── -->
    <header class="top">
      <button class="back-btn" aria-label="Go back" @click="emit('close')">
        <AppIcon name="back" :size="22" />
      </button>
      <h1>My Activity</h1>
      <span class="spacer" aria-hidden="true" />
    </header>

    <!-- ── Summary stat strip ── -->
    <div class="stats">
      <div class="stat">
        <span class="num">{{ stats.sightings }}</span>
        <span class="lbl">Sightings reported</span>
      </div>
      <div class="stat highlight">
        <span class="num">{{ stats.reunited }}</span>
        <span class="lbl">Pets reunited</span>
      </div>
      <div class="stat">
        <span class="num">{{ stats.posts }}</span>
        <span class="lbl">Pets posted</span>
      </div>
    </div>

    <!-- ── Filter chips ── -->
    <div class="chips" role="group" aria-label="Filter activity">
      <button
        v-for="chip in chips"
        :key="chip"
        class="chip"
        :class="{ active: activeFilter === chip }"
        @click="activeFilter = chip"
      >
        {{ chip }}
      </button>
    </div>

    <!-- ── Result count ── -->
    <p class="count">{{ filtered.length }} {{ filtered.length === 1 ? 'entry' : 'entries' }}</p>

    <!-- ── Activity feed ── -->
    <div v-if="filtered.length > 0" class="feed">
      <article
        v-for="entry in filtered"
        :key="entry.id"
        class="entry-card"
        @click="selectedEntry = entry"
      >
        <!-- Pet thumbnail -->
        <div class="thumb-wrap">
          <img :src="entry.petPhoto" :alt="`Photo of ${entry.petName}`" loading="lazy" />
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
    <div v-else class="empty" role="status">
      <span class="empty-icon">
        <AppIcon name="paw" :size="32" />
      </span>
      <h2>Nothing here yet</h2>
      <p>When you report a sighting or post a lost pet, it will appear here.</p>
    </div>

    <!-- ── Entry detail bottom sheet ── -->
    <Transition name="fade">
      <div v-if="selectedEntry" class="scrim" @click.self="selectedEntry = null">
        <div class="sheet" role="dialog" aria-modal="true" :aria-label="`Details for ${selectedEntry.petName}`">
          <div class="grab" />

          <!-- Sheet header -->
          <div class="sheet-head">
            <img :src="selectedEntry.petPhoto" :alt="`Photo of ${selectedEntry.petName}`" />
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
                <span class="detail-label">Location</span>
                <span class="detail-value">{{ selectedEntry.location }}</span>
              </div>
            </li>
            <li>
              <span class="detail-icon"><AppIcon name="list" :size="16" /></span>
              <div>
                <span class="detail-label">Activity type</span>
                <span class="detail-value">{{ typePillLabel(selectedEntry.type) }}</span>
              </div>
            </li>
            <li v-if="selectedEntry.note">
              <span class="detail-icon"><AppIcon name="eye" :size="16" /></span>
              <div>
                <span class="detail-label">Your note</span>
                <span class="detail-value">{{ selectedEntry.note }}</span>
              </div>
            </li>
            <li v-if="selectedEntry.reward">
              <span class="detail-icon"><AppIcon name="check" :size="16" /></span>
              <div>
                <span class="detail-label">Reward</span>
                <span class="detail-value reward-text">{{ selectedEntry.reward }}</span>
              </div>
            </li>
          </ul>

          <button class="sheet-close" @click="selectedEntry = null">Done</button>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { getMyPets } from '../services/api'
import type { Pet } from '../types/pet'

/* ── Emits ── */
const emit = defineEmits<{ close: [] }>()

/* ── Types ── */
type Outcome = 'reunited' | 'sighted' | 'lost' | 'adopted'
type ActivityType = 'sighting' | 'post' | 'adoption'

interface HistoryEntry {
  id: string
  petName: string
  breed: string
  petPhoto: string
  location: string
  dateAgo: string
  type: ActivityType
  outcome: Outcome
  note?: string
  reward?: string
}

/* ── Mock data — replace with API/store calls in production ── */
const entries = ref<HistoryEntry[]>([])

function toHistoryEntry(pet: Pet): HistoryEntry {
  return {
    id: pet.id,
    petName: pet.name,
    breed: pet.breed || pet.species,
    petPhoto: pet.photo,
    location: pet.location,
    dateAgo: pet.postedAgo,
    type: 'post',
    outcome: pet.status,
    note: pet.description,
    reward: pet.reward,
  }
}

async function loadEntries() {
  try {
    entries.value = (await getMyPets()).map(toHistoryEntry)
  } catch {
    entries.value = []
  }
}

onMounted(loadEntries)

/* ── Filter chips ── */
const chips = ['All', 'Sightings', 'My Posts', 'Adoptions'] as const
type ChipValue = (typeof chips)[number]
const activeFilter = ref<ChipValue>('All')

const filtered = computed<HistoryEntry[]>(() => {
  if (activeFilter.value === 'All') return entries.value
  const map: Record<ChipValue, ActivityType | null> = {
    All: null,
    Sightings: 'sighting',
    'My Posts': 'post',
    Adoptions: 'adoption',
  }
  const t = map[activeFilter.value]
  return t ? entries.value.filter((entry) => entry.type === t) : entries.value
})

/* ── Selected entry for the detail sheet ── */
const selectedEntry = ref<HistoryEntry | null>(null)

/* ── Summary stats (derived from full entries list) ── */
const stats = computed(() => ({
  sightings: entries.value.filter((entry) => entry.type === 'sighting').length,
  reunited: entries.value.filter((entry) => entry.outcome === 'reunited').length,
  posts: entries.value.filter((entry) => entry.type === 'post').length,
}))

/* ── Helper: human-readable outcome label ── */
function outcomeLabel(outcome: Outcome): string {
  const map: Record<Outcome, string> = {
    reunited: 'REUNITED',
    sighted: 'SIGHTED',
    lost: 'LOST',
    adopted: 'ADOPTED',
  }
  return map[outcome]
}

/* ── Helper: icon name for activity type pill ── */
function typePillIcon(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    sighting: 'eye',
    post: 'radar',
    adoption: 'check',
  }
  return map[type]
}

/* ── Helper: label for activity type pill ── */
function typePillLabel(type: ActivityType): string {
  const map: Record<ActivityType, string> = {
    sighting: 'Sighting reported',
    post: 'Pet posted',
    adoption: 'Adopted',
  }
  return map[type]
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
  border-color: var(--teal);
  color: #fff;
}

/* ── Count label ── */
.count {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
  padding: 12px 18px 4px;
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
  color: var(--teal);
}

.type-pill.post {
  background: #fde8e4; /* coral-soft */
  color: var(--coral);
}

.type-pill.adoption {
  background: var(--teal-soft);
  color: var(--teal);
}

.reward {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--coral);
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
  color: var(--teal);
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
  color: var(--teal);
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
  color: var(--coral);
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
