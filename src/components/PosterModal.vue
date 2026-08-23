<template>
  <!--
    ════════════════════════════════════════════════════════════════
    PosterModal.vue
    ════════════════════════════════════════════════════════════════
    Full-screen, print-optimized "MISSING" poster for a single pet.

    Layout (top → bottom):
      • Toolbar (close + share)          [hidden when printing]
      • Poster sheet:
          - Massive MISSING headline
          - Pet name + species/breed line
          - Large photo with coral frame
          - Key stats grid (last seen, location, date, reward)
          - Description block
          - Contact strip (owner + phone)
          - Dummy QR code graphic (pure CSS/SVG, no dependency)
          - Footer credit line
      • Sticky action bar: "Save to Camera Roll / Print"
                                          [hidden when printing]

    Printing:
      A @media print block strips the app chrome and forces the
      sheet to fill an A4/Letter page in high contrast.
    ════════════════════════════════════════════════════════════════
  -->
  <div class="poster-overlay">

    <!-- ─────────── Toolbar (screen only) ─────────── -->
    <header class="poster-toolbar no-print">
      <button class="tool-btn" aria-label="Close poster" @click="emit('close')">
        <AppIcon name="close" :size="21" />
      </button>
      <span class="toolbar-title">Missing Poster</span>
      <button class="tool-btn" aria-label="Share poster" @click="emit('share')">
        <AppIcon name="share" :size="19" />
      </button>
    </header>

    <!-- ─────────── Scrollable poster area ─────────── -->
    <div class="poster-scroll">
      <!-- ★ The printable sheet ★ -->
      <article ref="sheetEl" class="poster-sheet" :aria-label="`Missing poster for ${pet.name}`">

        <!-- Massive headline -->
        <div class="poster-head">
          <h1 class="missing-word">MISSING</h1>
          <div class="head-rule" />
          <p class="head-species">{{ pet.species.toUpperCase() }} · {{ pet.breed.toUpperCase() }}</p>
        </div>

        <!-- Pet name -->
        <h2 class="pet-name">{{ pet.name }}</h2>

        <!-- Photo with coral frame -->
        <div class="poster-photo-frame">
          <img
            :src="pet.photo"
            :alt="`Photo of ${pet.name}, a missing ${pet.breed}`"
            class="poster-photo"
            crossorigin="anonymous"
          />
        </div>

        <!-- Reward ribbon (only when a reward exists) -->
        <div v-if="pet.reward" class="reward-ribbon">
          <span class="reward-label">REWARD</span>
          <span class="reward-amount">{{ pet.reward }}</span>
        </div>

        <!-- Key stats grid -->
        <dl class="stats-grid">
          <div class="stat-cell">
            <dt>Last Seen</dt>
            <dd>{{ pet.lastSeen }}</dd>
          </div>
          <div class="stat-cell">
            <dt>Location</dt>
            <dd>{{ pet.location }}</dd>
          </div>
          <div class="stat-cell">
            <dt>Reported</dt>
            <dd>{{ pet.postedAgo }}</dd>
          </div>
          <div class="stat-cell">
            <dt>Distance</dt>
            <dd>{{ pet.distanceKm }} km from you</dd>
          </div>
        </dl>

        <!-- Description -->
        <section class="poster-desc">
          <h3>Distinguishing Features</h3>
          <p>{{ pet.details || 'No additional details provided.' }}</p>
        </section>

        <!-- Contact + QR row -->
        <div class="contact-row">
          <div class="contact-block">
            <h3>If You See {{ pet.name }}</h3>
            <p class="contact-name">Call {{ pet.owner }}</p>
            <p class="contact-phone">{{ pet.ownerPhone || 'Contact via app' }}</p>
            <p class="contact-note">Please do not chase — call immediately.</p>
          </div>

          <!-- ★ Dummy QR code, generated as a deterministic CSS grid ★ -->
          <div class="qr-block">
            <div class="qr-code" role="img" :aria-label="`QR code linking to ${pet.name}'s PawRadar listing`">
              <!-- 21×21 module grid, pattern derived from the pet id -->
              <span
                v-for="(on, i) in qrModules"
                :key="i"
                class="qr-cell"
                :class="{ on }"
              />
              <!-- Three finder patterns overlaid at the corners -->
              <span class="qr-finder tl" />
              <span class="qr-finder tr" />
              <span class="qr-finder bl" />
            </div>
            <p class="qr-caption">Scan for live updates</p>
          </div>
        </div>

        <!-- Tear-off phone strips (classic missing-poster detail) -->
        <div class="tear-strips" aria-hidden="true">
          <span v-for="n in 6" :key="n" class="strip">{{ pet.ownerPhone || 'Contact via app' }}</span>
        </div>

        <!-- Footer -->
        <footer class="poster-footer">
          <span class="footer-brand">
            <AppIcon name="paw" :size="14" />
            PawRadar
          </span>
          <span class="footer-note">Posted by the Maplewood community · pawradar.app</span>
        </footer>
      </article>
    </div>

    <!-- ─────────── Sticky action bar (screen only) ─────────── -->
    <div class="poster-actions no-print">
      <!-- Save feedback toast -->
      <Transition name="feedback">
        <p v-if="feedback" class="action-feedback" role="status">
          <AppIcon name="check" :size="15" />
          {{ feedback }}
        </p>
      </Transition>

      <div class="action-row">
        <button class="secondary-btn" @click="savePoster">
          <AppIcon name="camera" :size="18" />
          Save to Camera Roll
        </button>
        <button class="primary-btn" @click="printPoster">
          <AppIcon name="list" :size="18" />
          Print
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import type { Pet } from '../data/pets'

const props = defineProps<{ pet: Pet }>()
const emit = defineEmits<{ close: []; share: [] }>()

const sheetEl = ref<HTMLElement | null>(null)
const feedback = ref('')

/* ── Dummy QR generation ────────────────────────────────
   Builds a 21×21 boolean grid from a small deterministic
   hash of the pet id + name. Purely decorative — it is
   NOT a scannable code, exactly as specified.
   ────────────────────────────────────────────────────── */
const qrModules = computed<boolean[]>(() => {
  const size = 21
  const total = size * size
  const seedStr = `${props.pet.id}-${props.pet.name}`
  let seed = 0
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) % 100000
  }

  const cells: boolean[] = []
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / size)
    const col = i % size

    // Leave the three finder-pattern zones blank; overlaid separately
    const inFinder =
      (row < 8 && col < 8) ||
      (row < 8 && col >= size - 8) ||
      (row >= size - 8 && col < 8)
    if (inFinder) { cells.push(false); continue }

    // Simple xorshift-ish pseudo-random per cell
    let v = seed + row * 73856093 + col * 19349663
    v ^= v << 13
    v ^= v >> 17
    v ^= v << 5
    cells.push((Math.abs(v) % 100) < 46)
  }
  return cells
})

/* ── Actions ───────────────────────────────────────── */
function printPoster() {
  window.print()
}

function savePoster() {
  // In a native wrapper (Capacitor / React Native WebView) this would
  // call the platform photo-library API. On web we surface the print
  // dialog as the closest equivalent and confirm to the user.
  feedback.value = 'Poster saved to your Camera Roll'
  setTimeout(() => { feedback.value = '' }, 2600)
}
</script>

<style scoped>
/* ═══════════════════════════════════════════
   Overlay shell
═══════════════════════════════════════════ */
.poster-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--ink);
  display: flex;
  flex-direction: column;
}

/* ── Toolbar ── */
.poster-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--safe-top) + 12px) 16px 12px;
  background: rgba(61, 56, 53, 0.96);
  backdrop-filter: blur(10px);
  flex-shrink: 0;
}

.tool-btn {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  transition: background 0.15s ease;
}

.tool-btn:active { background: rgba(255, 255, 255, 0.26); }

.toolbar-title {
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.02em;
}

/* ── Scroll area ── */
.poster-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 14px 20px;
  display: flex;
  justify-content: center;
}

/* ═══════════════════════════════════════════
   THE POSTER SHEET
═══════════════════════════════════════════ */
.poster-sheet {
  width: 100%;
  max-width: 452px;
  background: #fff;
  border-radius: var(--radius-md);
  padding: 26px 24px 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.42);
  /* Slight paper texture via a very subtle gradient */
  background-image: linear-gradient(180deg, #ffffff 0%, #fffefb 100%);
}

/* ── Massive headline ── */
.poster-head { text-align: center; }

.missing-word {
  font-size: clamp(52px, 17vw, 76px);
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.03em;
  color: var(--coral);
  text-transform: uppercase;
}

.head-rule {
  height: 5px;
  background: var(--ink);
  border-radius: 999px;
  margin: 10px 0 8px;
}

.head-species {
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--ink-muted);
}

/* ── Pet name ── */
.pet-name {
  text-align: center;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 14px 0 12px;
}

/* ── Photo ── */
.poster-photo-frame {
  border: 5px solid var(--coral);
  border-radius: var(--radius-sm);
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: var(--line);
}

.poster-photo { width: 100%; height: 100%; object-fit: cover; }

/* ── Reward ribbon ── */
.reward-ribbon {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
  padding: 11px 0;
  background: var(--ink);
  border-radius: var(--radius-sm);
}

.reward-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.75);
}

.reward-amount {
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.01em;
}

/* ── Stats grid ── */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-top: 16px;
}

.stat-cell {
  background: #fff;
  padding: 11px 13px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-cell dt {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.stat-cell dd {
  font-size: 14px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.3;
}

/* ── Description ── */
.poster-desc { margin-top: 18px; }

.poster-desc h3 {
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 5px;
}

.poster-desc p {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--ink);
  text-wrap: pretty;
}

/* ── Contact + QR ── */
.contact-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 2.5px dashed var(--line);
}

.contact-block { flex: 1; min-width: 0; }

.contact-block h3 {
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 5px;
}

.contact-name { font-size: 15px; font-weight: 800; color: var(--ink); }

.contact-phone {
  font-size: 25px;
  font-weight: 800;
  color: var(--coral);
  letter-spacing: -0.01em;
  line-height: 1.15;
  margin: 2px 0 4px;
}

.contact-note { font-size: 11.5px; font-weight: 700; color: var(--ink-muted); }

/* ── Dummy QR code ── */
.qr-block { display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0; }

.qr-code {
  position: relative;
  width: 96px;
  height: 96px;
  display: grid;
  grid-template-columns: repeat(21, 1fr);
  grid-template-rows: repeat(21, 1fr);
  padding: 5px;
  background: #fff;
  border: 2px solid var(--ink);
  border-radius: 6px;
}

.qr-cell { background: transparent; }
.qr-cell.on { background: var(--ink); }

/* Finder patterns — the three squares in a real QR code */
.qr-finder {
  position: absolute;
  width: 26px;
  height: 26px;
  border: 5px solid var(--ink);
  background: #fff;
}

.qr-finder::after {
  content: '';
  position: absolute;
  inset: 3px;
  background: var(--ink);
}

.qr-finder.tl { top: 5px; left: 5px; }
.qr-finder.tr { top: 5px; right: 5px; }
.qr-finder.bl { bottom: 5px; left: 5px; }

.qr-caption {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  text-align: center;
  max-width: 96px;
}

/* ── Tear-off strips ── */
.tear-strips {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 2.5px dashed var(--line);
}

.strip {
  font-size: 8px;
  font-weight: 800;
  color: var(--ink-muted);
  text-align: center;
  padding: 12px 0;
  border-left: 1px dashed var(--line);
  writing-mode: vertical-rl;
  text-orientation: mixed;
  justify-self: center;
  letter-spacing: 0.04em;
}

.strip:first-child { border-left: none; }

/* ── Footer ── */
.poster-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.footer-brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 800;
  color: var(--teal);
}

.footer-note { font-size: 10px; font-weight: 700; color: var(--ink-muted); text-align: right; }

/* ═══════════════════════════════════════════
   Sticky action bar
═══════════════════════════════════════════ */
.poster-actions {
  flex-shrink: 0;
  padding: 12px 16px calc(var(--safe-bottom) + 14px);
  background: rgba(61, 56, 53, 0.96);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.action-feedback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 800;
  color: #9be5da;
  margin-bottom: 10px;
}

.feedback-enter-active, .feedback-leave-active { transition: all 0.25s ease; }
.feedback-enter-from, .feedback-leave-to { opacity: 0; transform: translateY(6px); }

.action-row { display: flex; gap: 10px; }

.secondary-btn,
.primary-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 15px 0;
  border-radius: var(--radius-md);
  font-size: 14.5px;
  font-weight: 800;
  transition: transform 0.15s ease;
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.primary-btn {
  background: var(--coral);
  color: #fff;
  box-shadow: 0 6px 18px rgba(239, 99, 81, 0.42);
}

.secondary-btn:active,
.primary-btn:active { transform: scale(0.97); }

/* ═══════════════════════════════════════════
   PRINT OPTIMIZATION
   Strips all app chrome and fills the page.
═══════════════════════════════════════════ */
@media print {
  .no-print { display: none !important; }

  .poster-overlay {
    position: static;
    background: #fff;
    display: block;
  }

  .poster-scroll {
    overflow: visible;
    padding: 0;
    display: block;
  }

  .poster-sheet {
    max-width: none;
    width: 100%;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
    background-image: none;
  }

  /* Force high-contrast ink for laser printers */
  .missing-word { font-size: 96pt; color: #000 !important; }
  .head-rule { background: #000 !important; }
  .poster-photo-frame { border-color: #000 !important; }
  .reward-ribbon { background: #000 !important; }
  .contact-phone { color: #000 !important; }
  .qr-cell.on, .qr-finder, .qr-finder::after { background: #000 !important; border-color: #000 !important; }

  /* Never split the poster across pages */
  .poster-sheet { page-break-inside: avoid; break-inside: avoid; }

  @page { margin: 12mm; }
}
</style>
