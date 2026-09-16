<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import AuthDialog from './AuthDialog.vue'

const props = defineProps<{
  theme: 'light' | 'dark'
  holdDurationSeconds: number
  timerInputMode: 'spacebar' | 'typing'
  userEmail: string | null
  authConfigured: boolean
  authLoading: boolean
  authError: string
  cloudError: string
}>()

const emit = defineEmits<{
  (e: 'update:theme', value: 'light' | 'dark'): void
  (e: 'update:holdDurationSeconds', value: number): void
  (e: 'update:timerInputMode', value: 'spacebar' | 'typing'): void
  (e: 'login', payload: { email: string, password: string }): void
  (e: 'register', payload: { email: string, password: string }): void
  (e: 'google-login'): void
  (e: 'logout'): void
}>()

const isOpen = ref(false)
const isAuthOpen = ref(false)
const isSignOutConfirmOpen = ref(false)
const isThemeOpen = ref(false)
const isTimerInputOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

watch(() => props.userEmail, email => {
  if (email) isAuthOpen.value = false
})

const toggle = () => {
  isOpen.value = !isOpen.value
}

const updateHoldDuration = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  emit('update:holdDurationSeconds', Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : 0.3)
}

const handleOutsideClick = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))
</script>

<template>
  <div ref="menuRef" class="settings-menu">
    <button class="settings-trigger" title="Open settings" aria-label="Open settings" @click.stop="toggle">⚙</button>

    <div v-if="isOpen" class="settings-panel">
      <div class="settings-heading">
        <div>
          <span class="settings-kicker">Preferences</span>
          <h2>Timer settings</h2>
        </div>
        <button class="close-settings" title="Close settings" @click="isOpen = false">×</button>
      </div>

      <label class="setting-row">
        <span>Theme</span>
        <div class="custom-dropdown settings-dropdown">
          <button class="ui-dropdown-trigger" @click.stop="isThemeOpen = !isThemeOpen">
            <span>{{ props.theme === 'light' ? 'Light' : 'Dark' }}</span>
            <span class="dropdown-arrow">▾</span>
          </button>
          <ul v-if="isThemeOpen" class="dropdown-menu">
            <li class="dropdown-item" :class="{ active: props.theme === 'light' }" @click="emit('update:theme', 'light'); isThemeOpen = false">Light</li>
            <li class="dropdown-item" :class="{ active: props.theme === 'dark' }" @click="emit('update:theme', 'dark'); isThemeOpen = false">Dark</li>
          </ul>
        </div>
      </label>

      <label class="setting-row">
        <span>Time holding spacebar (s)</span>
        <input class="number-input" type="number" min="0" max="5" step="0.05" :value="props.holdDurationSeconds" @change="updateHoldDuration">
      </label>

      <label class="setting-row">
        <span>Timer input</span>
        <div class="custom-dropdown settings-dropdown">
          <button class="ui-dropdown-trigger" @click.stop="isTimerInputOpen = !isTimerInputOpen; isThemeOpen = false">
            <span>{{ props.timerInputMode === 'spacebar' ? 'Spacebar' : 'Typing' }}</span>
            <span class="dropdown-arrow">▾</span>
          </button>
          <ul v-if="isTimerInputOpen" class="dropdown-menu">
            <li class="dropdown-item" :class="{ active: props.timerInputMode === 'spacebar' }" @click="emit('update:timerInputMode', 'spacebar'); isTimerInputOpen = false">Spacebar</li>
            <li class="dropdown-item" :class="{ active: props.timerInputMode === 'typing' }" @click="emit('update:timerInputMode', 'typing'); isTimerInputOpen = false">Typing</li>
          </ul>
        </div>
      </label>

      <div class="account-section">
        <span class="settings-kicker">Cloud account</span>
        <p v-if="props.userEmail" class="account-email">{{ props.userEmail }}</p>
        <p v-else class="account-status">Solve data is stored locally.</p>
        <button v-if="props.userEmail" class="account-button danger-button" @click="isSignOutConfirmOpen = true">Sign out</button>
        <button v-else class="account-button" :disabled="!props.authConfigured || props.authLoading" @click="isAuthOpen = true">
          {{ props.authConfigured ? 'Sign in or register' : 'Configure Firebase first' }}
        </button>
        <p v-if="!props.authConfigured" class="account-hint">Add Firebase values to your local .env file to enable cloud sync.</p>
        <p v-if="props.authError" class="account-error">{{ props.authError }}</p>
        <p v-if="props.cloudError" class="account-error">{{ props.cloudError }}</p>
      </div>
    </div>

    <AuthDialog
      v-if="isAuthOpen"
      :configured="props.authConfigured"
      :error="props.authError"
      @close="isAuthOpen = false"
      @login="(payload) => emit('login', payload)"
      @register="(payload) => emit('register', payload)"
      @google-login="emit('google-login')"
    />

    <div v-if="isSignOutConfirmOpen" class="confirm-backdrop" @click.self="isSignOutConfirmOpen = false">
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="signout-title">
        <h2 id="signout-title">Sign out?</h2>
        <p>Your local solves will remain on this device.</p>
        <div class="confirm-actions">
          <button class="account-button" @click="isSignOutConfirmOpen = false">Cancel</button>
          <button class="account-button danger-button" @click="emit('logout'); isSignOutConfirmOpen = false">Sign out</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-menu {
  position: relative;
}

.settings-trigger,
.close-settings,
.account-button {
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-main);
  cursor: pointer;
}

.settings-trigger {
  width: 34px;
  height: 34px;
  padding: 0;
  font-size: 1.15rem;
}

.settings-panel {
  position: absolute;
  top: calc(100% + 0.75rem);
  right: 0;
  z-index: 100;
  width: min(320px, calc(100vw - 2rem));
  padding: 1rem;
  border: 1px solid var(--text-muted);
  border-radius: 8px;
  background: var(--bg-color);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
}

.settings-heading,
.setting-row,
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.settings-heading {
  align-items: flex-start;
  margin-bottom: 1rem;
}

.settings-heading h2 {
  font-size: 1.1rem;
}

.settings-kicker {
  display: block;
  color: var(--text-muted);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.close-settings {
  width: 28px;
  height: 28px;
  font-size: 1.2rem;
}

.setting-row,
.toggle-row {
  padding: 0.65rem 0;
  border-top: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
  font-size: 0.85rem;
}

.settings-dropdown {
  position: relative;
  width: 118px;
}

.ui-dropdown-trigger {
  width: 100%;
  padding: 0.35rem;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-main);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  margin-top: 2px;
  padding: 0;
  border: 1px solid var(--text-main);
  border-radius: 4px;
  background: var(--bg-color);
  list-style: none;
  z-index: 10;
}

.dropdown-item {
  padding: 0.5rem;
  cursor: pointer;
}

.dropdown-item:hover,
.dropdown-item.active {
  background: color-mix(in srgb, var(--text-muted) 15%, transparent);
}

.dropdown-arrow {
  color: var(--text-muted);
}

.number-input {
  width: 92px;
  padding: 0.35rem;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-main);
}

.toggle-row input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent-ready);
}

.account-section {
  margin-top: 0.75rem;
  padding-top: 0.85rem;
  border-top: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
}

.account-email,
.account-status,
.account-hint,
.account-error {
  margin: 0.4rem 0;
  font-size: 0.78rem;
}

.account-status,
.account-hint {
  color: var(--text-muted);
}

.account-error {
  color: var(--accent-error);
}

.account-button {
  padding: 0.45rem 0.65rem;
  font-size: 0.78rem;
}

.account-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.36);
}

.confirm-dialog {
  width: min(320px, calc(100vw - 2rem));
  padding: 1rem;
  border: 1px solid var(--text-muted);
  border-radius: 8px;
  background: var(--bg-color);
  color: var(--text-main);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
}

.confirm-dialog p {
  margin: 0.6rem 0 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.danger-button {
  border-color: var(--accent-error);
  color: var(--accent-error);
}
</style>
