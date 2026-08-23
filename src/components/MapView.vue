<template>
  <div class="map" role="img" aria-label="Neighborhood map showing locations of missing pets">
    <img class="map-bg" src="/map-bg.svg" alt="" />

    <!-- current user position -->
    <div class="you" :style="{ left: '48%', top: '78%' }">
      <span class="you-ring" />
      <span class="you-dot" />
      <span class="you-label">You</span>
    </div>

    <button
      v-for="pet in pets"
      :key="pet.id"
      class="pin"
      :class="pet.status"
      :style="{ left: pet.mapX + '%', top: pet.mapY + '%' }"
      :aria-label="`${pet.name}, ${pet.distanceKm} km away. Open details.`"
      @click="emit('open', pet)"
    >
      <img :src="pet.photo" :alt="''" />
      <span class="pin-tail" />
      <span class="pin-name">{{ pet.name }} · {{ pet.distanceKm }} km</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Pet } from '../data/pets'

defineProps<{ pets: Pet[] }>()
const emit = defineEmits<{ open: [pet: Pet] }>()
</script>

<style scoped>
.map {
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  aspect-ratio: 3 / 4;
  box-shadow: var(--shadow-card);
  background: var(--teal-soft);
}

.map-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pin {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
}

.pin img {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 3.5px solid var(--coral);
  box-shadow: var(--shadow-float);
  background: var(--surface);
}

.pin.sighted img {
  border-color: var(--teal);
}

.pin-tail {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 10px solid var(--coral);
  margin-top: -2px;
}

.pin.sighted .pin-tail {
  border-top-color: var(--teal);
}

.pin-name {
  margin-top: 3px;
  padding: 3px 9px;
  background: var(--surface);
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  color: var(--ink);
  box-shadow: var(--shadow-card);
  white-space: nowrap;
}

.you {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.you-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--teal);
  border: 3px solid #fff;
  box-shadow: var(--shadow-card);
}

.you-ring {
  position: absolute;
  top: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--teal);
  animation: pulse-ring 2s ease-out infinite;
}

.you-label {
  margin-top: 5px;
  font-size: 11.5px;
  font-weight: 800;
  color: var(--teal);
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 999px;
  box-shadow: var(--shadow-card);
}
</style>
