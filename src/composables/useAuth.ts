import { onUnmounted, ref } from 'vue'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../firebase'

export function useAuth() {
  const user = ref<User | null>(null)
  const isLoading = ref(isFirebaseConfigured)
  const error = ref('')

  const unsubscribe = auth
    ? onAuthStateChanged(auth, nextUser => {
        user.value = nextUser
        isLoading.value = false
      })
    : null

  const requireAuth = () => {
    if (!auth) throw new Error('Firebase is not configured for this app.')
    return auth
  }

  const register = async (email: string, password: string) => {
    error.value = ''
    try {
      const firebaseAuth = requireAuth()
      await setPersistence(firebaseAuth, browserLocalPersistence)
      await createUserWithEmailAndPassword(firebaseAuth, email, password)
    } catch (reason) {
      error.value = getAuthError(reason)
      throw reason
    }
  }

  const login = async (email: string, password: string) => {
    error.value = ''
    try {
      const firebaseAuth = requireAuth()
      await setPersistence(firebaseAuth, browserLocalPersistence)
      await signInWithEmailAndPassword(firebaseAuth, email, password)
    } catch (reason) {
      error.value = getAuthError(reason)
      throw reason
    }
  }

  const loginWithGoogle = async () => {
    error.value = ''
    try {
      const firebaseAuth = requireAuth()
      await setPersistence(firebaseAuth, browserLocalPersistence)
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
    } catch (reason) {
      error.value = getAuthError(reason)
      throw reason
    }
  }

  const logout = async () => {
    error.value = ''
    try {
      await signOut(requireAuth())
    } catch (reason) {
      error.value = getAuthError(reason)
      throw reason
    }
  }

  onUnmounted(() => unsubscribe?.())

  return { user, isLoading, error, isConfigured: isFirebaseConfigured, register, login, loginWithGoogle, logout }
}

const getAuthError = (reason: unknown): string => {
  if (!reason || typeof reason !== 'object' || !('code' in reason)) {
    return 'Authentication failed. Please try again.'
  }

  switch (reason.code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email or password is incorrect.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Use a password with at least six characters.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.'
    case 'auth/account-exists-with-different-credential':
      return 'This email is already linked to another sign-in method.'
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled in Firebase yet.'
    default:
      return 'Authentication failed. Please try again.'
  }
}
