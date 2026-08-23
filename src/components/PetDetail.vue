<template>
  <div class="detail">
    <div class="hero">
      <img :src="pet.photo" :alt="`Photo of ${pet.name}, a missing ${pet.breed}`" />
      <button class="back" aria-label="Go back" @click="emit('close')">
        <AppIcon name="back" :size="20" />
      </button>
      <button class="share" aria-label="Share this pet's poster">
        <AppIcon name="share" :size="19" />
      </button>
      <span class="badge" :class="pet.status">
        {{ pet.status === 'lost' ? 'LOST' : 'SIGHTED NEARBY' }}
      </span>
    </div>

    <div class="sheet">
      <div class="grab" />
      <div class="title-row">
        <div>
          <h2>{{ pet.name }}</h2>
          <p class="sub">{{ pet.breed }} · {{ pet.species }}</p>
        </div>
        <span class="distance">
          <AppIcon name="pin" :size="15" />
          {{ pet.distanceKm }} km away
        </span>
      </div>

      <div class="facts">
        <div class="fact">
          <span class="label">Last seen</span>
          <span class="value">{{ pet.lastSeen }}</span>
        </div>
        <div class="fact">
          <span class="label">Location</span>
          <span class="value">{{ pet.location }}</span>
        </div>
        <div v-if="pet.reward" class="fact">
          <span class="label">Reward</span>
          <span class="value reward">{{ pet.reward }}</span>
        </div>
      </div>

      <h3>About {{ pet.name }}</h3>
      <p class="desc">{{ pet.description }}</p>

      <div class="owner">
        <div class="owner-info">
          <span class="owner-name">{{ pet.owner }}</span>
          <span class="owner-role">Owner · posted {{ pet.postedAgo }}</span>
        </div>
        <a class="call" :href="`tel:${pet.ownerPhone}`" :aria-label="`Call ${pet.owner}`">
          <AppIcon name="phone" :size="19" />
        </a>
      </div>

      <button class="found-cta" @click="emit('found')">
        <AppIcon name="eye" :size="20" />
        Found it? Report a sighting
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Pet } from '../data/pets'
import AppIcon from './AppIcon.vue'

defineProps<{ pet: Pet }>()
const emit = defineEmits<{ close: []; found: [] }>()
</script>

<style scoped>
.detail {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: var(--bg);
  overflow-y: auto;
}

.hero {
  position: relative;
  aspect-ratio: 1 / 1;
  max-height: 55vh;
  width: 100%;
}

.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.back,
.share {
  position: absolute;
  top: calc(var(--safe-top) + 14px);
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  box-shadow: var(--shadow-card);
}

.back {
  left: 16px;
}

.share {
  right: 16px;
}

.badge {
  position: absolute;
  bottom: 40px;
  left: 18px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
}

.badge.lost {
  background: var(--coral);
}

.badge.sighted {
  background: var(--teal);
}

.sheet {
  position: relative;
  margin-top: -26px;
  background: var(--bg);
  border-radius: 26px 26px 0 0;
  padding: 10px 20px calc(var(--safe-bottom) + 28px);
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.grab {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: var(--line);
  margin: 0 auto 16px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

h2 {
  font-size: 26px;
  font-weight: 800;
}

.sub {
  color: var(--ink-muted);
  font-size: 14.5px;
  font-weight: 600;
}

.distance {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--teal);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 20px;
}

.fact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 13px 16px;
  background: var(--surface);
}

.label {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
}

.value {
  font-size: 14px;
  font-weight: 700;
  text-align: right;
}

.value.reward {
  color: var(--coral);
}

h3 {
  font-size: 16px;
  font-weight: 800;
  margin-bottom: 6px;
}

.desc {
  font-size: 14.5px;
  color: var(--ink-muted);
  line-height: 1.6;
  margin-bottom: 20px;
}

.owner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  box-shadow: var(--shadow-card);
  margin-bottom: 20px;
}

.owner-info {
  display: flex;
  flex-direction: column;
}

.owner-name {
  font-weight: 800;
  font-size: 15px;
}

.owner-role {
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
}

.call {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--teal);
  color: #fff;
}

.found-cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 17px 0;
  border-radius: var(--radius-md);
  background: var(--teal);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
  transition: transform 0.15s ease;
}

.found-cta:active {
  transform: scale(0.98);
}
</style>
