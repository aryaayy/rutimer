<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { TwistyPlayer, type PuzzleID } from 'cubing/twisty'
import { getCubeEvent } from '../cubeEvents'

const props = defineProps<{
  scramble: string
  cubeType: string
}>()

const containerRef = ref<HTMLElement | null>(null)
let playerInstance: TwistyPlayer | null = null

const getPuzzleId = (type: string): PuzzleID => {
  return getCubeEvent(type).puzzleId as PuzzleID
}

const renderVisualizer = () => {
  if (!containerRef.value) return
  
  containerRef.value.innerHTML = ''
  
  const puzzle = getPuzzleId(props.cubeType)
  const cleanAlg = props.scramble ? props.scramble.replace(/<br\s*\/?>/gi, ' ') : ''

  try {
    playerInstance = new TwistyPlayer({
      puzzle: puzzle,
      alg: cleanAlg,
      visualization: '2D',
      hintFacelets: 'none',
      controlPanel: 'none',
      background: 'none',
    })

    // Remove fixed dimensions so CSS flexbox/grid controls the size dynamically
    playerInstance.style.width = '100%'
    playerInstance.style.height = '100%'

    containerRef.value.appendChild(playerInstance)
  } catch (err) {
    console.error('Failed to render twisty visualizer:', err)
  }
}

watch([() => props.scramble, () => props.cubeType], () => {
  renderVisualizer()
})

onMounted(() => {
  renderVisualizer()
})
</script>

<template>
  <div class="visualizer-card">
    <div ref="containerRef" class="player-wrapper"></div>
  </div>
</template>

<style scoped>
.visualizer-card {
  padding: 0.75rem;
  /* background: #181818; */
  /* background: var(--bg-color); */
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 25px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  width: 15vw;
  height: 26vh; /* Expanded height to fit the full net */
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
}

.player-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Force twisty-player host element to fill wrapper */
.player-wrapper :deep(twisty-player) {
  width: 100% !important;
  height: 100% !important;
}

/* Force internal shadow DOM components to hide control elements completely */
.player-wrapper :deep(twisty-player)::part(control-panel),
.player-wrapper :deep(twisty-player)::part(play-button),
.player-wrapper :deep(twisty-player)::part(control-bar) {
  display: none !important;
  height: 0 !important;
  width: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
</style>