<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSolves, type Penalty, type Solve } from './composables/useSolves'
import ScrambleGenerator from './components/ScrambleGenerator.vue'
import TimerDisplay from './components/TimerDisplay.vue'
import StatsSidebar from './components/StatsSidebar.vue'
import ScrambleVisualizer from './components/ScrambleVisualizer.vue'
import SettingsMenu from './components/SettingsMenu.vue'
import { useAuth } from './composables/useAuth'

const scrambleGenRef = ref<InstanceType<typeof ScrambleGenerator> | null>(null)
const currentScramble = ref<string>('')
const canGoPreviousScramble = ref(false)
const isVisualizerVisible = ref<boolean>(true)
const lastSolve = ref<Solve | null>(null)
const timerResetKey = ref(0)
const theme = ref<'light' | 'dark'>('light')
const holdDurationSeconds = ref(0.3)
const timerInputMode = ref<'spacebar' | 'typing'>('spacebar')
const isCloudLoaded = ref(false)
const cloudError = ref('')

const { 
  sessions, 
  activeSessionId, 
  activeSession, 
  activeSolves, 
  addSolve, 
  updateSolvePenalty,
  updateComment,
  deleteSolve,
  queueCloudDeletion,
  createSession,
  renameSession,
  loadSessionMetadataFromCloud,
  saveSessionMetadataToCloud,
  loadSolvesFromCloud,
  saveSolvesToCloud,
  ao5, 
  ao12,
  ao100, 
  bestTime, 
  formatTime 
} = useSolves()

const { user, isLoading: isAuthLoading, error: authError, isConfigured: isAuthConfigured, register, login, loginWithGoogle, logout } = useAuth()

const lastAuthenticatedUserId = ref(localStorage.getItem('rutimer-last-user-id'))

const syncAuthenticatedSolves = async () => {
  if (!user.value || !isCloudLoaded.value) return

  try {
    cloudError.value = ''
    await saveSolvesToCloud(user.value.uid)
    await saveSessionMetadataToCloud(user.value.uid)
  } catch (error) {
    cloudError.value = getCloudErrorMessage(error, 'save')
    console.error('Failed to save cloud solve data.', error)
  }
}

try {
  const savedSettings = JSON.parse(localStorage.getItem('rutimer-settings') || '{}') as Record<string, unknown>
  if (savedSettings.theme === 'light' || savedSettings.theme === 'dark') theme.value = savedSettings.theme
  if (typeof savedSettings.holdDurationSeconds === 'number' && savedSettings.holdDurationSeconds >= 0) {
    holdDurationSeconds.value = savedSettings.holdDurationSeconds
  }
  if (savedSettings.timerInputMode === 'spacebar' || savedSettings.timerInputMode === 'typing') {
    timerInputMode.value = savedSettings.timerInputMode
  }
} catch {
  // Invalid preferences use the defaults above.
}

watch(activeSessionId, () => {
  lastSolve.value = null
  timerResetKey.value++
})

watch([theme, holdDurationSeconds, timerInputMode], () => {
  try {
    localStorage.setItem('rutimer-settings', JSON.stringify({
      theme: theme.value,
      holdDurationSeconds: holdDurationSeconds.value,
      timerInputMode: timerInputMode.value
    }))
  } catch (error) {
    console.error('Failed to save timer settings.', error)
  }
})

watch(user, async currentUser => {
  isCloudLoaded.value = false
  cloudError.value = ''
  if (!currentUser) return

  const userId = currentUser.uid
  lastAuthenticatedUserId.value = userId
  localStorage.setItem('rutimer-last-user-id', userId)
  try {
    await loadSessionMetadataFromCloud(userId)
    await loadSolvesFromCloud(userId)
    if (user.value?.uid !== userId) return
    isCloudLoaded.value = true
    await syncAuthenticatedSolves()
  } catch (error) {
    cloudError.value = getCloudErrorMessage(error, 'load')
    console.error('Failed to load cloud solve data.', error)
  }
})

const getCloudErrorMessage = (error: unknown, operation: 'load' | 'save') => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
    return `Firestore denied the ${operation}. Deploy firestore.rules and verify the signed-in user.`
  }

  return operation === 'load'
    ? 'Could not load cloud data. Check Firestore rules and your connection.'
    : 'Could not upload cloud data. Check Firestore rules and your connection.'
}

const updateCurrentScramble = (scramble: string) => {
  currentScramble.value = scramble
}

const updateScrambleNavigation = (canGoPrevious: boolean) => {
  canGoPreviousScramble.value = canGoPrevious
}

const showPreviousScramble = () => scrambleGenRef.value?.showPreviousScramble()
const showNextScramble = () => scrambleGenRef.value?.showNextScramble()

const onSolveCompleted = (finalTime: number) => {
  lastSolve.value = addSolve(finalTime, currentScramble.value)
  void syncAuthenticatedSolves()
  if (scrambleGenRef.value) {
    void scrambleGenRef.value.generateScramble('record')
  }
}

const onTimerPenaltyChanged = (penalty: Penalty) => {
  if (lastSolve.value) {
    updateSolvePenalty(lastSolve.value.id, penalty)
    void syncAuthenticatedSolves()
  }
}

const handleCubeTypeChange = (newType: string) => {
  lastSolve.value = null
  timerResetKey.value++
  activeSession.value.cubeType = newType
  void syncAuthenticatedSolves()
}

const handleCreateSession = () => {
  createSession()
  void syncAuthenticatedSolves()
}

const handleCommentUpdate = (payload: { id: number, comment: string }) => {
  updateComment(payload.id, payload.comment)
  void syncAuthenticatedSolves()
}

const handlePenaltyUpdate = (payload: { id: number, penalty: Penalty }) => {
  updateSolvePenalty(payload.id, payload.penalty)
  void syncAuthenticatedSolves()
}

const handleRenameSession = (payload: { id: string, name: string }) => {
  renameSession(payload.id, payload.name)
  void syncAuthenticatedSolves()
}

const handleDeleteSolve = (id: number) => {
  deleteSolve(id)
  const userId = user.value?.uid || lastAuthenticatedUserId.value
  if (userId) queueCloudDeletion(userId, id)
  void syncAuthenticatedSolves()
  if (lastSolve.value?.id === id) {
    lastSolve.value = null
    timerResetKey.value++
  }
}

const handleDeleteCurrentSolve = () => {
  if (lastSolve.value) {
    handleDeleteSolve(lastSolve.value.id)
  }
}

const handleLogin = async (payload: { email: string, password: string }) => {
  try {
    await login(payload.email, payload.password)
  } catch {
    // The auth composable exposes the user-facing error message.
  }
}

const handleRegister = async (payload: { email: string, password: string }) => {
  try {
    await register(payload.email, payload.password)
  } catch {
    // The auth composable exposes the user-facing error message.
  }
}

const handleGoogleLogin = async () => {
  try {
    await loginWithGoogle()
  } catch {
    // The auth composable exposes the user-facing error message.
  }
}
</script>

<template>
  <div class="app-wrapper" :class="`theme-${theme}`">
    <StatsSidebar 
      :sessions="sessions"
      v-model:activeSessionId="activeSessionId"
      :activeSession="activeSession"
      :activeSolves="activeSolves"
      :ao5="ao5"
      :ao12="ao12"
      :ao100="ao100"
      :bestTime="bestTime"
      :formatTime="formatTime"
      @update-cube-type="handleCubeTypeChange"
      @update-comment="handleCommentUpdate"
      @update-penalty="handlePenaltyUpdate"
      @delete-solve="handleDeleteSolve"
      @create-session="handleCreateSession"
      @rename-session="handleRenameSession"
    />
    
    <main class="rutimer-main">
      <header class="header">
        <span class="brand">rutimer</span>
        <SettingsMenu
          :theme="theme"
          :hold-duration-seconds="holdDurationSeconds"
          :timer-input-mode="timerInputMode"
          :user-email="user?.email ?? null"
          :auth-configured="isAuthConfigured"
          :auth-loading="isAuthLoading"
          :auth-error="authError"
          :cloud-error="cloudError"
          @update:theme="theme = $event"
          @update:hold-duration-seconds="holdDurationSeconds = $event"
          @update:timer-input-mode="timerInputMode = $event"
          @login="handleLogin"
          @register="handleRegister"
          @google-login="handleGoogleLogin"
          @logout="logout"
        />
      </header>
      
      <div class="timer-area">
        <!-- Dynamic container wrapper for the scramble display -->
        <div class="scramble-container">
          <div class="scramble-navigation">
            <button class="scramble-nav-button" :class="{ 'is-disabled': !canGoPreviousScramble }" :disabled="!canGoPreviousScramble" title="Previous scramble" @click="showPreviousScramble">←</button>
          <ScrambleGenerator 
            ref="scrambleGenRef" 
            :cubeType="activeSession.cubeType"
            @scramble-generated="updateCurrentScramble" 
            @navigation-changed="updateScrambleNavigation"
          />
            <button class="scramble-nav-button" title="Next scramble" @click="showNextScramble">→</button>
          </div>
        </div>
        <div class="spacer">

        </div>

        <TimerDisplay 
          :key="`${activeSessionId}-${timerResetKey}`"
          :hold-duration-seconds="holdDurationSeconds"
          :timer-input-mode="timerInputMode"
          @solve-completed="onSolveCompleted" 
          @penalty-changed="onTimerPenaltyChanged"
          @delete-solve="handleDeleteCurrentSolve"
        />
      </div>

      <div class="visualizer-floating-container">
        <ScrambleVisualizer 
          v-show="isVisualizerVisible" 
          :scramble="currentScramble" 
          :cubeType="activeSession.cubeType"
        />
        <button 
          class="toggle-visualizer-btn" 
          @click="isVisualizerVisible = !isVisualizerVisible"
          :title="isVisualizerVisible ? 'Hide Visualizer' : 'Show Visualizer'"
        >
          ◫
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-wrapper {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-color);
  color: var(--text-main);
}

.theme-dark {
  --bg-color: #101314;
  --text-main: #f4f1ea;
  --text-muted: #95a09e;
  --accent-ready: #55d88b;
  --accent-error: #ff735c;
}

.rutimer-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100vh;
}

.header {
  position: absolute;
  top: 1.5rem;
  left: 1.75rem;
  right: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
}

.brand::before {
  width: 0.35rem;
  height: 1.35rem;
  border-radius: 2px;
  background: var(--accent-ready);
  content: '';
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-ready) 12%, transparent);
}

.timer-area {
  flex: 1;
  justify-content: center; /* Dynamically distributes scramble and timer */
  display: flex;
  flex-direction: column;
  align-items: center;
  /* padding: 3rem 2rem 1.5rem 2rem; */
  box-sizing: border-box;
  height: 100%;
  gap: 0.5rem;
  /* background-color: aqua; */
}

/* .spacer {
  display: flex;

  height: 20vh;
} */

.scramble-container {
  width: 95%;              /* Increased from 90% */
  max-width: 1400px;        /* Increased from 1100px */
  display: flex;
  justify-content: center;
  align-items: center;
  transition: max-width 0.2s ease, width 0.2s ease;
  /* background-color: red; */
}

.scramble-navigation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  width: 100%;
}

.scramble-navigation :deep(.scramble-container) {
  flex: 1;
  min-width: 0;
}

.scramble-nav-button {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 1.2rem;
}

.scramble-nav-button:hover:not(:disabled) {
  border-color: var(--text-main);
}

.scramble-nav-button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

@media (max-width: 640px) {
  .header {
    top: 1.1rem;
    left: 1.1rem;
    right: 1.1rem;
  }

  .brand {
    font-size: 1.2rem;
  }

  .brand::before {
    height: 1.1rem;
  }
}

.visualizer-floating-container {
  position: absolute;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  z-index: 50;
}

.toggle-visualizer-btn {
  background: var(--bg-color);
  border: 1px solid var(--text-muted);
  color: var(--text-main);
  border-radius: 4px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1rem;
}

.toggle-visualizer-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
</style>