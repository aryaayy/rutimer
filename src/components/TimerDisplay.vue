<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import type { Penalty } from '../composables/useSolves'

const props = withDefaults(defineProps<{
  holdDurationSeconds?: number
  timerInputMode?: 'spacebar' | 'typing'
}>(), {
  holdDurationSeconds: 0.3,
  timerInputMode: 'spacebar'
})

const emit = defineEmits<{
  (e: 'solve-completed', time: number): void
  (e: 'penalty-changed', penalty: Penalty): void
  (e: 'delete-solve'): void
}>()

const time = ref<number>(0)
const intervalTime = ref<number>(0)
const isRunning = ref<boolean>(false)
const isReady = ref<boolean>(false)
const isSpacebarDown = ref<boolean>(false)
const isIntervalValid = ref<boolean>(false)
const currentPenalty = ref<Penalty>('none')
const typedDigits = ref('')

// State to track inline delete confirmation
const isConfirmingDelete = ref<boolean>(false)

let startTime = 0
let animationFrameId: number | null = null
let intervalStartTime = 0
let intervalFrameId: number | null = null

const formattedTime = computed(() => {
  const typedMilliseconds = typedDigits.value ? Number(typedDigits.value) * 10 : null
  const currentTime = typedMilliseconds ?? time.value
  if (currentTime === 0) return '0.00'
  if (currentPenalty.value === 'DNF') return 'DNF'
  
  const displayTime = currentPenalty.value === '+2' ? currentTime + 2000 : currentTime
  const totalSeconds = displayTime / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(2)
  const formatted = minutes > 0 ? `${minutes}:${seconds.padStart(5, '0')}` : seconds
  
  return currentPenalty.value === '+2' ? `${formatted}+` : formatted
})

const startTimer = () => {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)

  isRunning.value = true
  isReady.value = false
  isIntervalValid.value = false
  isConfirmingDelete.value = false
  currentPenalty.value = 'none'
  time.value = 0
  startTime = performance.now()
  
  const updateTime = () => {
    time.value = performance.now() - startTime
    animationFrameId = requestAnimationFrame(updateTime)
  }
  animationFrameId = requestAnimationFrame(updateTime)
}

const stopTimer = () => {
  isRunning.value = false
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  emit('solve-completed', time.value)
}

const resetTimer = () => {
  time.value = 0
  typedDigits.value = ''
  currentPenalty.value = 'none'
  isConfirmingDelete.value = false
}

const togglePenalty = (penalty: Penalty) => {
  if (isRunning.value || time.value === 0) return
  currentPenalty.value = currentPenalty.value === penalty ? 'none' : penalty
  emit('penalty-changed', currentPenalty.value)
}

const confirmDelete = () => {
  if (isRunning.value || time.value === 0) return
  emit('delete-solve')
  resetTimer()
}

const updateTypedTime = (event: Event) => {
  typedDigits.value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8)
}

const submitTypedTime = () => {
  if (!typedDigits.value || Number(typedDigits.value) <= 0) return

  time.value = Number(typedDigits.value) * 10
  typedDigits.value = ''
  currentPenalty.value = 'none'
  emit('solve-completed', time.value)
}

const checkInterval = () => {
  intervalStartTime = performance.now()
  const update = () => {
    intervalTime.value = performance.now() - intervalStartTime
    if (intervalTime.value > props.holdDurationSeconds * 1000) {
        resetTimer()
        isIntervalValid.value = true
        return
    }
    intervalFrameId = requestAnimationFrame(update)
  }
  intervalFrameId = requestAnimationFrame(update)
}

const stopCheckInterval = () => {
  if (intervalFrameId !== null) {
    cancelAnimationFrame(intervalFrameId)
    intervalFrameId = null
  }
}

const isTypingInField = (e: KeyboardEvent): boolean => {
  const target = e.target as HTMLElement
  if (!target) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (isTypingInField(e)) return

  if (props.timerInputMode === 'typing' && !isRunning.value) {
    if (/^Digit\d$/.test(e.code) || /^Numpad\d$/.test(e.code)) {
      e.preventDefault()
      if (!typedDigits.value) {
        time.value = 0
        currentPenalty.value = 'none'
      }
      if (typedDigits.value.length < 8) {
        typedDigits.value += e.key.replace('Numpad', '')
      }
      return
    }

    if (e.code === 'Backspace') {
      e.preventDefault()
      typedDigits.value = typedDigits.value.slice(0, -1)
      return
    }

    if (e.code === 'Escape') {
      e.preventDefault()
      typedDigits.value = ''
      return
    }

    if (e.code === 'Enter' && typedDigits.value && Number(typedDigits.value) > 0) {
      e.preventDefault()
      time.value = Number(typedDigits.value) * 10
      typedDigits.value = ''
      currentPenalty.value = 'none'
      emit('solve-completed', time.value)
      return
    }

    if (e.code === 'Space') {
      e.preventDefault()
      return
    }
  }

  if (e.code === 'Space') {
    e.preventDefault()
    if (isSpacebarDown.value) return
    isSpacebarDown.value = true
    
    if (isRunning.value) {
      stopTimer()
    } else {
      isReady.value = true
      checkInterval()
    }
  }
}

const handleKeyUp = (e: KeyboardEvent) => {
  if (isTypingInField(e)) return

  if (e.code === 'Space') {
    isSpacebarDown.value = false
    stopCheckInterval()

    if (isReady.value && isIntervalValid.value) {
      startTimer()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  stopCheckInterval()
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
})
</script>

<template>
  <div class="timer-wrapper">
    <div 
      class="timer-container" 
      :class="{ 
        'is-ready': isReady, 
        'is-spacebar-down': isSpacebarDown, 
        'is-interval-valid': isIntervalValid 
      }"
    >
      <input
        v-if="props.timerInputMode === 'typing' && !isRunning"
        class="manual-time-input"
        type="text"
        inputmode="numeric"
        maxlength="8"
        :placeholder="time > 0 ? formattedTime : '0.00'"
        :value="typedDigits"
        aria-label="Enter solve time in hundredths"
        @input="updateTypedTime"
        @keydown.enter.prevent="submitTypedTime"
      >
      <div v-else class="time-display">{{ formattedTime }}</div>
    </div>

    <!-- Toolbar area -->
    <div v-if="time > 0 && !isRunning" class="penalty-toolbar">
      
      <!-- Inline Confirmation State -->
      <template v-if="isConfirmingDelete">
        <span class="confirm-label">Delete solve?</span>
        <button class="btn-confirm-yes" @click="confirmDelete">Yes</button>
        <button class="btn-confirm-no" @click="isConfirmingDelete = false">No</button>
      </template>

      <!-- Standard Penalty & Trash Buttons -->
      <template v-else>
        <button 
          class="penalty-btn" 
          :class="{ active: currentPenalty === '+2' }" 
          @click="togglePenalty('+2')"
        >
          +2
        </button>
        <button 
          class="penalty-btn" 
          :class="{ active: currentPenalty === 'DNF' }" 
          @click="togglePenalty('DNF')"
        >
          DNF
        </button>

        <button 
          class="delete-btn" 
          @click="isConfirmingDelete = true" 
          title="Delete Solve"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </template>

    </div>
  </div>
</template>

<style scoped>
.timer-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.manual-time-input {
  width: min(80vw, 760px);
  padding: 0;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: clamp(5rem, 10vw + 4vh, 13rem);
  font-weight: 400;
  line-height: 1;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.manual-time-input:focus {
  outline: 2px solid var(--text-main);
  outline-offset: -1px;
}

.timer-container {
  display: flex;
  justify-content: center;
  align-items: center;
  transition: color 0.1s ease;
  /* background-color: blue; */
}

.time-display {
  font-family: var(--font-mono);
  /* Dynamically scales between 5rem (small screens) and 13rem (ultrawide displays) */
  font-size: clamp(5rem, 10vw + 4vh, 13rem);
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.timer-container.is-ready.is-spacebar-down.is-interval-valid {
  color: var(--accent-ready);
}

.timer-container.is-ready.is-spacebar-down:not(.is-interval-valid) {
  color: var(--accent-error);
}

.penalty-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
  align-items: center;
  height: 32px; /* Fixed height to prevent vertical jitter on toggle */
}

.penalty-btn {
  padding: 0.4rem 0.8rem;
  background: transparent;
  border: 1px solid var(--text-muted);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
}

.penalty-btn:hover {
  border-color: var(--text-main);
  color: var(--text-main);
}

.penalty-btn.active {
  background: var(--text-main);
  color: var(--bg-color);
  border-color: var(--text-main);
}

.delete-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--accent-error);
  color: var(--accent-error);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #dc2626;
}

/* Inline Confirmation Styling */
.confirm-label {
  font-size: 0.875rem;
  color: #ef4444;
  font-weight: 500;
  margin-right: 0.25rem;
}

.btn-confirm-yes {
  padding: 0.45rem 0.65rem;
  background: var(--bg-color);
  border: 1px solid var(--accent-error);
  color: var(--accent-error);
  font-size: 0.78rem;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-confirm-yes:hover {
  background: color-mix(in srgb, var(--accent-error) 12%, var(--bg-color));
}

.btn-confirm-no {
  padding: 0.45rem 0.65rem;
  background: transparent;
  border: 1px solid var(--text-muted);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-confirm-no:hover {
  border-color: var(--text-main);
  color: var(--text-main);
}
</style>