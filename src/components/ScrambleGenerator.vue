<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { randomScrambleForEvent } from 'cubing/scramble'
import { getCubeEvent } from '../cubeEvents'

const props = defineProps<{
  cubeType: string
}>()

const emit = defineEmits<{
  (e: 'scramble-generated', scramble: string): void
  (e: 'navigation-changed', canGoPrevious: boolean): void
}>()

const currentScramble = ref<string>('')
let generationRequest = 0
const scrambleHistory = ref<string[]>([])
const historyIndex = ref(-1)
const hasUsedPrevious = ref(false)
const historyByCubeType = new Map<string, { scrambles: string[], index: number }>()

const saveCurrentHistory = (cubeType: string) => {
  historyByCubeType.set(cubeType, {
    scrambles: [...scrambleHistory.value],
    index: historyIndex.value
  })
}

const restoreHistory = (cubeType: string): boolean => {
  const savedHistory = historyByCubeType.get(cubeType)
  if (!savedHistory || savedHistory.scrambles.length === 0) return false

  scrambleHistory.value = [...savedHistory.scrambles]
  historyIndex.value = savedHistory.index
  hasUsedPrevious.value = false
  currentScramble.value = scrambleHistory.value[historyIndex.value]
  emit('scramble-generated', currentScramble.value)
  emitNavigationState()
  return true
}

const emitNavigationState = () => {
  emit('navigation-changed', historyIndex.value > 0 && !hasUsedPrevious.value)
}

// BOTH: Dynamically computes a responsive CSS clamp() based on cubeType/length
const scrambleFontSize = computed(() => {
  const len = currentScramble.value.length

  // 1. Very long scrambles (5x5, Megaminx) -> Smaller base, scales with screen width
  if (len >= 150) {
    return 'clamp(1.2rem, 1.1vw + 0.4vh, 1.5rem)'
  }
  // 2. Long scrambles (4x4) -> Medium-small base, scales with screen width
  if (len >= 90) {
    return 'clamp(1.45rem, 1.4vw + 0.5vh, 1.75rem)'
  }
  // 3. Standard scrambles (3x3, Pyraminx) -> Standard base, scales with screen width
  if (len >= 40) {
    return 'clamp(1.85rem, 1.8vw + 0.6vh, 2.25rem)'
  }
  // 4. Short scrambles (2x2) -> Large base, scales with screen width
  return 'clamp(2.4rem, 2.5vw + 0.8vh, 2.5rem)'
})

const generateScramble = async (historyMode: 'record' | 'preserve' | 'clear' = 'record') => {
  const requestId = ++generationRequest

  try {
    const scramble = await randomScrambleForEvent(getCubeEvent(props.cubeType).scrambleId)
    if (requestId !== generationRequest) return

    const nextScramble = scramble.toString()
    if (historyMode === 'record' && currentScramble.value) {
      scrambleHistory.value = [currentScramble.value, nextScramble]
    } else if (historyMode === 'clear') {
      scrambleHistory.value = [nextScramble]
    } else {
      const extendedHistory = [...scrambleHistory.value, nextScramble]
      scrambleHistory.value = extendedHistory.length > 50
        ? [extendedHistory[0], ...extendedHistory.slice(-49)]
        : extendedHistory
    }

    historyIndex.value = scrambleHistory.value.length - 1
    currentScramble.value = scrambleHistory.value[historyIndex.value]
    hasUsedPrevious.value = false
    saveCurrentHistory(props.cubeType)
    emit('scramble-generated', currentScramble.value)
    emitNavigationState()
  } catch (error) {
    console.error('Failed to generate scramble.', error)
  }
}

const showPreviousScramble = () => {
  if (historyIndex.value <= 0) return
  if (hasUsedPrevious.value) return
  historyIndex.value--
  hasUsedPrevious.value = true
  currentScramble.value = scrambleHistory.value[historyIndex.value]
  saveCurrentHistory(props.cubeType)
  emit('scramble-generated', currentScramble.value)
  emitNavigationState()
}

const showNextScramble = () => {
  if (historyIndex.value < scrambleHistory.value.length - 1) {
    historyIndex.value++
    currentScramble.value = scrambleHistory.value[historyIndex.value]
    hasUsedPrevious.value = false
    saveCurrentHistory(props.cubeType)
    emit('scramble-generated', currentScramble.value)
    emitNavigationState()
    return
  }

  void generateScramble('preserve')
}

watch(() => props.cubeType, (cubeType, previousCubeType) => {
  saveCurrentHistory(previousCubeType)
  if (!restoreHistory(cubeType)) void generateScramble('clear')
})

onMounted(() => {
  void generateScramble('clear')
})

defineExpose({ generateScramble, showPreviousScramble, showNextScramble })
</script>

<template>
  <div class="scramble-container">
    <h2 :style="{ fontSize: scrambleFontSize }">{{ currentScramble }}</h2>
  </div>
</template>

<style scoped>
.scramble-container {
  width: 100%;
  max-width: 100%;
  text-align: center;
  margin: 0 auto;
  /* padding: 0 1rem; */
  box-sizing: border-box;
}

h2 {
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-main);
  line-height: 1.4;
  white-space: pre-wrap;
  transition: font-size 0.15s ease;
}
</style>