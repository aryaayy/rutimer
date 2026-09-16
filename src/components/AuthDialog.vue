<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  configured: boolean
  error: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'login', payload: { email: string, password: string }): void
  (e: 'register', payload: { email: string, password: string }): void
  (e: 'google-login'): void
}>()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')

const submit = () => {
  const payload = { email: email.value.trim(), password: password.value }
  if (!payload.email || !payload.password) return
  if (mode.value === 'login') {
    emit('login', payload)
  } else {
    emit('register', payload)
  }
}
</script>

<template>
  <div class="auth-backdrop" @click.self="emit('close')">
    <section class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div class="auth-header">
        <div>
          <span class="settings-kicker">Cloud sync</span>
          <h2 id="auth-title">{{ mode === 'login' ? 'Welcome back' : 'Create your account' }}</h2>
        </div>
        <button class="close-button" title="Close" @click="emit('close')">×</button>
      </div>

      <p class="auth-copy">Your sessions and solve history will sync across devices.</p>

      <button class="google-button" type="button" :disabled="!props.configured" @click="emit('google-login')">
        <svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.26Z"/>
          <path fill="#34A853" d="M12 21.99c2.63 0 4.84-.87 6.45-2.5l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.99Z"/>
          <path fill="#FBBC05" d="M6.54 13.93A5.85 5.85 0 0 1 6.23 12c0-.67.11-1.32.31-1.93V7.54H3.3A9.99 9.99 0 0 0 2.25 12c0 1.61.39 3.14 1.05 4.46l3.24-2.53Z"/>
          <path fill="#EA4335" d="M12 6.04c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.05 14.63 2 12 2a9.74 9.74 0 0 0-8.7 5.54l3.24 2.53C7.31 7.76 9.46 6.04 12 6.04Z"/>
        </svg>
        Continue with Google
      </button>

      <div class="auth-divider"><span>or use email</span></div>

      <form @submit.prevent="submit">
        <label class="field-label" for="auth-email">Email</label>
        <input id="auth-email" v-model="email" class="auth-input" type="email" autocomplete="email" required>

        <label class="field-label" for="auth-password">Password</label>
        <input id="auth-password" v-model="password" class="auth-input" type="password" minlength="6" autocomplete="current-password" required>

        <p v-if="props.error" class="auth-error">{{ props.error }}</p>
        <p v-if="!props.configured" class="auth-error">Firebase is not configured yet.</p>

        <button class="submit-button" type="submit" :disabled="!props.configured">
          {{ mode === 'login' ? 'Sign in' : 'Register' }}
        </button>
      </form>

      <button class="mode-button" @click="mode = mode === 'login' ? 'register' : 'login'">
        {{ mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in' }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.auth-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.36);
}

.auth-dialog {
  width: min(320px, calc(100vw - 2rem));
  padding: 1rem;
  border: 1px solid var(--text-muted);
  border-radius: 8px;
  background: var(--bg-color);
  color: var(--text-main);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
}

.auth-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.auth-header h2 {
  margin-top: 0.2rem;
  font-size: 1.35rem;
}

.settings-kicker {
  color: var(--text-muted);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.close-button,
.mode-button {
  border: 0;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
}

.close-button {
  font-size: 1.35rem;
}

.auth-copy {
  margin: 1rem 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.google-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.65rem;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-main);
  cursor: pointer;
  font-weight: 600;
}

.google-icon {
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
}

.google-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 1rem 0 0.2rem;
  color: var(--text-muted);
  font-size: 0.72rem;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  height: 1px;
  flex: 1;
  background: var(--text-muted);
  opacity: 0.45;
}

.field-label {
  display: block;
  margin: 0.7rem 0 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
}

.auth-input {
  width: 100%;
  padding: 0.65rem;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-main);
}

.auth-error {
  margin-top: 0.75rem;
  color: var(--accent-error);
  font-size: 0.8rem;
}

.submit-button {
  width: 100%;
  margin-top: 1rem;
  padding: 0.65rem;
  border: 1px solid var(--text-main);
  border-radius: 4px;
  background: var(--text-main);
  color: var(--bg-color);
  cursor: pointer;
}

.submit-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.mode-button {
  display: block;
  margin: 1rem auto 0;
  color: var(--text-muted);
  font-size: 0.78rem;
  text-decoration: underline;
}
</style>
