<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Session, Solve, Penalty } from '../composables/useSolves'
import { WCA_EVENTS } from '../cubeEvents'

const props = defineProps<{
  sessions: Session[]
  activeSessionId: string
  activeSession: Session
  activeSolves: Solve[]
  ao5: number | null
  ao12: number | null
  ao100: number | null
  bestTime: number | null
  formatTime: (ms: number | null | undefined, penalty?: Penalty) => string
}>()

const emit = defineEmits<{
  (e: 'update:activeSessionId', id: string): void
  (e: 'update-cube-type', type: string): void
  (e: 'update-comment', payload: { id: number, comment: string }): void
  (e: 'update-penalty', payload: { id: number, penalty: Penalty }): void
  (e: 'delete-solve', id: number): void
  (e: 'create-session'): void
  (e: 'rename-session', payload: { id: string, name: string }): void
}>()

const searchQuery = ref('')
const isSearchVisible = ref(false)
const inspectDialog = ref<HTMLDialogElement | null>(null)
const selectedSolve = ref<Solve | null>(null)
const draftComment = ref('')
const draftPenalty = ref<Penalty>('none')
const isConfirmingDelete = ref(false)

const isRenaming = ref(false)
const editSessionName = ref('')

const isSessionOpen = ref(false)
const isCubeOpen = ref(false)

const cubeTypes = WCA_EVENTS.map(event => event.name)

const filteredSolves = computed(() => {
  if (!searchQuery.value) return [...props.activeSolves].reverse()
  const lowerQuery = searchQuery.value.toLowerCase()
  
  return [...props.activeSolves].reverse().filter(solve => 
    props.formatTime(solve.time, solve.penalty).includes(lowerQuery) ||
    solve.scramble.toLowerCase().includes(lowerQuery) ||
    solve.comment.toLowerCase().includes(lowerQuery)
  )
})

const toggleSearch = () => {
  isSearchVisible.value = !isSearchVisible.value
  if (!isSearchVisible.value) searchQuery.value = ''
}

const startRename = () => {
  editSessionName.value = props.activeSession.name
  isRenaming.value = true
}

const saveRename = () => {
  if (editSessionName.value.trim()) {
    emit('rename-session', { id: props.activeSessionId, name: editSessionName.value })
  }
  isRenaming.value = false
}

const selectSession = (id: string) => {
  emit('update:activeSessionId', id)
  isSessionOpen.value = false
}

const selectCubeType = (type: string) => {
  emit('update-cube-type', type)
  isCubeOpen.value = false
}

const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.custom-dropdown')) {
    isSessionOpen.value = false
    isCubeOpen.value = false
  }
}

onMounted(() => window.addEventListener('click', handleClickOutside))
onUnmounted(() => window.removeEventListener('click', handleClickOutside))

const openInspect = (solve: Solve) => {
  selectedSolve.value = solve
  draftComment.value = solve.comment
  draftPenalty.value = solve.penalty
  isConfirmingDelete.value = false // Reset state on open
  inspectDialog.value?.showModal()
}

const closeInspect = () => {
  inspectDialog.value?.close()
  selectedSolve.value = null
  isConfirmingDelete.value = false
}

const confirmDeleteSolve = () => {
  if (selectedSolve.value) {
    emit('delete-solve', selectedSolve.value.id)
  }
  closeInspect()
}

const setDraftPenalty = (p: Penalty) => {
  draftPenalty.value = draftPenalty.value === p ? 'none' : p
}

const saveDialogChanges = () => {
  if (selectedSolve.value) {
    emit('update-comment', { id: selectedSolve.value.id, comment: draftComment.value })
    emit('update-penalty', { id: selectedSolve.value.id, penalty: draftPenalty.value })
  }
  closeInspect()
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString()
</script>

<template>
  <aside class="stats-sidebar">
    <h3 class="section-header">Current Session</h3>
    <div class="controls-group">
      <div class="control-row" v-if="!isRenaming">
        <div class="custom-dropdown grow">
          <button class="ui-dropdown-trigger" @click.stop="isSessionOpen = !isSessionOpen; isCubeOpen = false">
            <span class="truncate-text">{{ activeSession.name }}</span>
            <span class="dropdown-arrow">▾</span>
          </button>
          
          <ul v-if="isSessionOpen" class="dropdown-menu">
            <li 
              v-for="session in sessions" 
              :key="session.id" 
              class="dropdown-item"
              :class="{ active: session.id === activeSessionId }"
              @click="selectSession(session.id)"
            >
              <span class="truncate-text">{{ session.name }}</span>
            </li>
          </ul>
        </div>

        <button class="icon-btn" @click="startRename" title="Rename Session">✎</button>
        <button class="icon-btn" @click="emit('create-session')" title="New Session">+</button>
      </div>
      
      <div class="control-row" v-else>
        <input 
          type="text" 
          v-model="editSessionName" 
          @keyup.enter="saveRename"
          class="ui-input grow" 
          autofocus
        />
        <button class="icon-btn" @click="saveRename">✓</button>
        <button class="icon-btn" @click="isRenaming = false">✕</button>
      </div>

      <div class="custom-dropdown">
        <button class="ui-dropdown-trigger" @click.stop="isCubeOpen = !isCubeOpen; isSessionOpen = false">
          <span class="truncate-text">{{ activeSession.cubeType }}</span>
          <span class="dropdown-arrow">▾</span>
        </button>
        
        <ul v-if="isCubeOpen" class="dropdown-menu">
          <li 
            v-for="type in cubeTypes" 
            :key="type" 
            class="dropdown-item"
            :class="{ active: type === activeSession.cubeType }"
            @click="selectCubeType(type)"
          >
            {{ type }}
          </li>
        </ul>
      </div>
    </div>

    <h3 class="section-header">Statistics</h3>
    <div class="averages-grid">
      <div class="stat-block">
        <span class="stat-label">Best</span>
        <span class="stat-value">{{ formatTime(bestTime) }}</span>
      </div>
      <div class="stat-block">
        <span class="stat-label">Ao5</span>
        <span class="stat-value">{{ formatTime(ao5) }}</span>
      </div>
      <div class="stat-block">
        <span class="stat-label">Ao12</span>
        <span class="stat-value">{{ formatTime(ao12) }}</span>
      </div>
      <div class="stat-block">
        <span class="stat-label">Ao100</span>
        <span class="stat-value">{{ formatTime(ao100) }}</span>
      </div>
    </div>

    <div class="section-header-row">
      <h3 class="section-header header-no-margin">Solve History</h3>
      <button class="icon-btn" @click="toggleSearch" title="Toggle Search">⌕</button>
    </div>
    
    <input 
      v-show="isSearchVisible"
      type="search" 
      v-model="searchQuery" 
      class="ui-input search-input" 
      placeholder="Search times or comments..." 
    />

    <div class="solve-list">
      <div v-if="filteredSolves.length === 0" class="empty-state">
        No solves found.
      </div>
      
      <ol v-else class="history-list">
        <li v-for="(solve, index) in filteredSolves" :key="solve.id">
          <button class="history-item-btn" @click="openInspect(solve)">
            <span class="solve-index">{{ filteredSolves.length - index }}</span>
            <div class="solve-data">
              <span v-if="solve.comment" class="comment-indicator">📝</span>
              <span class="solve-time">{{ formatTime(solve.time, solve.penalty) }}</span>
            </div>
          </button>
        </li>
      </ol>
    </div>

    <!-- Solve Detail Inspection Dialog -->
    <dialog ref="inspectDialog" class="inspect-dialog" @click.self="closeInspect">
        <div v-if="selectedSolve" class="dialog-content">
            
            <!-- Delete Confirmation View -->
            <div v-if="isConfirmingDelete" class="confirm-delete-view">
            <h3 class="dialog-title warning-title">Delete Solve?</h3>
            <p class="confirm-text">
                Are you sure you want to delete this solve (<strong>{{ formatTime(selectedSolve.time, selectedSolve.penalty) }}</strong>)? This action cannot be undone.
            </p>
            
            <div class="dialog-actions flex-end">
                <button class="btn-cancel" @click="isConfirmingDelete = false">Cancel</button>
                <button class="btn-delete-confirm" @click="confirmDeleteSolve">Yes, Delete</button>
            </div>
            </div>

            <!-- Main Inspect View -->
            <template v-else>
            <h3 class="dialog-title">Solve Details</h3>
            
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span>{{ formatDate(selectedSolve.id) }}</span>
            </div>
            
            <div class="detail-row">
                <span class="detail-label">Time:</span>
                <span class="detail-time">{{ formatTime(selectedSolve.time, draftPenalty) }}</span>
            </div>

            <div class="detail-row">
                <span class="detail-label">Penalty:</span>
                <div class="dialog-penalty-buttons">
                <button 
                    class="penalty-btn" 
                    :class="{ active: draftPenalty === '+2' }"
                    @click="setDraftPenalty('+2')"
                >
                    +2
                </button>
                <button 
                    class="penalty-btn" 
                    :class="{ active: draftPenalty === 'DNF' }"
                    @click="setDraftPenalty('DNF')"
                >
                    DNF
                </button>
                </div>
            </div>
            
            <div class="detail-row scramble-row">
                <span class="detail-label">Scramble:</span>
                <p class="scramble-text">{{ selectedSolve.scramble }}</p>
            </div>

            <div class="detail-row">
                <label class="detail-label" for="comment-input">Comment:</label>
                <textarea id="comment-input" v-model="draftComment" rows="3" class="ui-input"></textarea>
            </div>

            <div class="dialog-actions">
                <!-- Trash Icon Delete Button styled like TimerDisplay -->
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

                <div class="dialog-actions-right">
                <button class="btn-cancel" @click="closeInspect">Cancel</button>
                <button class="btn-save" @click="saveDialogChanges">Save</button>
                </div>
            </div>
            </template>
        </div>
    </dialog>
  </aside>
</template>

<style scoped>
.stats-sidebar {
  width: 240px;
  height: 100vh;
  border-right: 1px solid var(--text-muted);
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  background: var(--bg-color);
  text-align: left;
}

.section-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.header-no-margin {
  margin-bottom: 0;
}

.controls-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.control-row {
  display: flex;
  gap: 0.25rem;
  width: 100%;
}

.grow {
  flex: 1;
  min-width: 0;
}

.custom-dropdown {
  position: relative;
  width: 100%;
}

.ui-dropdown-trigger {
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid var(--text-muted);
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.875rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  text-align: left;
}

.dropdown-arrow {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-left: 0.5rem;
  flex-shrink: 0;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  min-width: 100%;
  max-height: 160px;
  overflow-y: auto;
  overflow-x: auto;
  background: var(--bg-color);
  border: 1px solid var(--text-main);
  list-style: none;
  z-index: 100;
  margin-top: 2px;
}

.dropdown-item {
  padding: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}

.dropdown-item:hover, .dropdown-item.active {
  background: rgba(0, 0, 0, 0.05);
}

.truncate-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-input, .icon-btn, .ui-dropdown-trigger, .dropdown-menu, .btn-save, .btn-cancel, .history-item-btn, .inspect-dialog, .penalty-btn {
  border-radius: 4px;
}

.ui-input {
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid var(--text-muted);
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.875rem;
}

.ui-input:focus {
  outline: 2px solid var(--text-main);
  outline-offset: -1px;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--text-muted);
  color: var(--text-main);
  cursor: pointer;
  padding: 0 0.5rem;
  font-size: 1rem;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.averages-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--text-muted);
}

.search-input {
  width: 100%;
  margin-bottom: 1rem;
}

.stat-block {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.stat-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-muted);
}

.stat-value, .solve-time {
  font-family: var(--font-mono);
  font-weight: 600;
}

.solve-list {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.history-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.history-item-btn {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.history-item-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.history-item-btn:focus-visible {
  outline: 2px solid var(--text-main);
}

.solve-index {
  color: var(--text-muted);
  font-family: var(--font-mono);
  width: 2rem;
}

.solve-data {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
}

.comment-indicator {
  font-size: 0.8rem;
}

/* Dialog Styles */
.inspect-dialog {
  margin: auto;
  padding: 0;
  border: 1px solid var(--text-muted);
  border-radius: 8px;
  background: var(--bg-color);
  color: var(--text-main);
  width: min(320px, calc(100vw - 2rem));
  max-width: none;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
}

.inspect-dialog::backdrop {
  background: rgba(0, 0, 0, 0.36);
}

.dialog-content {
  padding: 1rem;
}

.dialog-title {
  margin-bottom: 1.5rem;
  font-size: 1.25rem;
}

.detail-row {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-time {
  font-family: var(--font-mono);
  font-size: 1.5rem;
}

.dialog-penalty-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.penalty-btn {
  padding: 0.3rem 0.6rem;
  background: transparent;
  border: 1px solid var(--text-muted);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 600;
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

.scramble-text {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.4;
  background: rgba(0,0,0,0.03);
  padding: 0.5rem;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
}

textarea.ui-input {
  resize: vertical;
}

.dialog-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
}

.dialog-actions-right {
  display: flex;
  gap: 0.5rem;
}

/* Red Trash Icon Button matched to TimerDisplay */
.delete-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
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

/* Dialog Action Layouts */
.dialog-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
}

.dialog-actions.flex-end {
  justify-content: flex-end;
  gap: 0.5rem;
}

.dialog-actions-right {
  display: flex;
  gap: 0.5rem;
}

/* Confirmation View Styling */
.confirm-text {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-main);
  margin-bottom: 1rem;
}

.warning-title {
  color: #ef4444;
}

.btn-delete-confirm {
  padding: 0.45rem 0.65rem;
  cursor: pointer;
  border: 1px solid var(--accent-error);
  background: var(--bg-color);
  color: var(--accent-error);
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.78rem;
  transition: background 0.15s ease;
}

.btn-delete-confirm:hover {
  background: color-mix(in srgb, var(--accent-error) 12%, var(--bg-color));
  border-color: var(--accent-error);
}

.btn-save, .btn-cancel {
  padding: 0.45rem 0.65rem;
  cursor: pointer;
  border: 1px solid var(--text-muted);
  background: var(--bg-color);
  color: var(--text-main);
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.78rem;
}

.btn-save {
  background: var(--text-main);
  color: var(--bg-color);
  border-color: var(--text-main);
}

.btn-cancel:hover {
  background: color-mix(in srgb, var(--text-muted) 12%, var(--bg-color));
}

.btn-save:hover {
  background: color-mix(in srgb, var(--text-main) 82%, var(--bg-color));
  color: var(--bg-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
}
</style>