import { ref, computed, watch, onScopeDispose } from 'vue'
import { collection, doc, getDocs, writeBatch, type Firestore } from 'firebase/firestore'
import { db } from '../firebase'
import {
  applyDeviceChanges,
  buildPushPlan,
  chooseLocalBase,
  createDefaultSessions,
  isSafeDocId,
  mergeCloudState,
  normalizeCloudSession,
  normalizeCloudSolve,
  normalizeStoredData,
  sessionsHaveSolves,
  type CloudSession,
  type CloudSolve,
  type PendingDeletion,
  type Penalty,
  type PushPlan,
  type Session,
  type Solve,
  type StoredData
} from '../solveSync'

export type { Penalty, Session, Solve }

const anonymousStorageKey = 'rutimer-data'
const lastUserStorageKey = 'rutimer-last-user-id'
const pendingDeletionStorageKey = 'rutimer-pending-cloud-deletions'
const userStorageKey = (userId: string) => `rutimer-data:${userId}`
const syncedStorageKey = (userId: string) => `rutimer-account-synced:${userId}`
const signedOutSolvesKey = (userId: string) => `rutimer-signed-out-solves:${userId}`

const isSafeUserId = (userId: string) => {
  return userId.length > 0 && userId.length <= 128 && !userId.includes('/') && !userId.includes('\\')
}

const readJson = (key: string): unknown => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.error('Failed to parse local storage data, starting fresh.', error)
    return null
  }
}

const readStore = (key: string): StoredData | null => normalizeStoredData(readJson(key))

const readPendingEntry = (entry: unknown): PendingDeletion | null => {
  if (typeof entry === 'string' && isSafeDocId(entry)) return { id: entry, deletedAt: 0 }
  if (!entry || typeof entry !== 'object') return null

  const deletion = entry as { id?: unknown, deletedAt?: unknown }
  if (typeof deletion.id !== 'string' || !isSafeDocId(deletion.id)) return null
  const deletedAt = typeof deletion.deletedAt === 'number' && Number.isFinite(deletion.deletedAt) && deletion.deletedAt > 0
    ? deletion.deletedAt
    : 0
  return { id: deletion.id, deletedAt }
}

const readPendingCloudDeletions = (): Record<string, PendingDeletion[]> => {
  const parsed = readJson(pendingDeletionStorageKey)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  return Object.fromEntries(Object.entries(parsed).flatMap(([userId, ids]) => {
    if (!Array.isArray(ids)) return []
    const deletions = ids.flatMap(entry => {
      const deletion = readPendingEntry(entry)
      return deletion ? [deletion] : []
    })
    return deletions.length > 0 ? [[userId, deletions]] : []
  }))
}

const writePendingCloudDeletions = (deletions: Record<string, PendingDeletion[]>) => {
  try {
    localStorage.setItem(pendingDeletionStorageKey, JSON.stringify(deletions))
  } catch (error) {
    console.error('Failed to save pending cloud deletions.', error)
  }
}

const chunkSize = 400

const commitOperations = async (
  firestore: Firestore,
  operations: Array<(batch: ReturnType<typeof writeBatch>) => void>
) => {
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = writeBatch(firestore)
    for (const operation of operations.slice(index, index + chunkSize)) operation(batch)
    await batch.commit()
  }
}

export function useSolves() {
  const initialStore = readStore(anonymousStorageKey)
  const sessions = ref<Session[]>(initialStore?.sessions ?? createDefaultSessions())
  const activeSessionId = ref<string>(initialStore?.activeSessionId ?? '1')
  const cloudSyncError = ref('')

  let ownerId: string | null = null
  let pulledFor: string | null = null
  let pendingAnonymousImport = false
  let syncTail: Promise<void> = Promise.resolve()
  let lastStamp = 0
  let lastRefreshAt = 0
  const ackedSolves = new Map<string, CloudSolve>()
  const ackedSessions = new Map<string, CloudSession>()

  const storageKey = () => ownerId ? userStorageKey(ownerId) : anonymousStorageKey

  const persistNow = () => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        sessions: sessions.value,
        activeSessionId: activeSessionId.value
      }))
    } catch (error) {
      console.error('Failed to save local storage data.', error)
    }
  }

  watch([sessions, activeSessionId], persistNow, { deep: true })

  const applyStore = (data: StoredData) => {
    sessions.value = data.sessions
    activeSessionId.value = data.sessions.some(session => session.id === data.activeSessionId)
      ? data.activeSessionId
      : data.sessions[0].id
  }

  const resetAck = () => {
    ackedSolves.clear()
    ackedSessions.clear()
    pulledFor = null
    pendingAnonymousImport = false
  }

  const nowStamp = () => {
    const now = Math.max(Date.now(), lastStamp + 1)
    lastStamp = now
    return now
  }

  const createId = () => {
    const existingIds = new Set<string>([
      ...sessions.value.map(session => session.id),
      ...sessions.value.flatMap(session => session.solves.map(solve => solve.id))
    ])
    let id = crypto.randomUUID()
    while (existingIds.has(id)) id = crypto.randomUUID()
    return id
  }

  const enqueue = (task: () => Promise<void>) => {
    const run = syncTail.then(task, task)
    syncTail = run.then(() => undefined, () => undefined)
    return run
  }

  const reportCloudError = (error: unknown, operation: 'load' | 'save') => {
    cloudSyncError.value = getCloudErrorMessage(error, operation)
    console.error(`Failed to ${operation} cloud solve data.`, error)
  }

  const rememberAck = (remoteSessions: CloudSession[], remoteSolves: CloudSolve[]) => {
    ackedSessions.clear()
    ackedSolves.clear()
    for (const session of remoteSessions) {
      ackedSessions.set(session.id, { ...session })
    }
    for (const solve of remoteSolves) {
      ackedSolves.set(solve.id, { ...solve })
    }
  }

  const pullAndMerge = async (userId: string, importAnonymous: boolean) => {
    if (!db) return
    const firestore = db
    const [sessionSnapshot, solveSnapshot] = await Promise.all([
      getDocs(collection(firestore, 'users', userId, 'sessions')),
      getDocs(collection(firestore, 'users', userId, 'solves'))
    ])
    if (ownerId !== userId) return

    const remoteSessions = sessionSnapshot.docs.flatMap(sessionDoc => {
      const session = normalizeCloudSession(sessionDoc.id, sessionDoc.data())
      return session ? [session] : []
    })
    const remoteSolves = solveSnapshot.docs.flatMap(solveDoc => {
      const solve = normalizeCloudSolve(solveDoc.id, solveDoc.data())
      return solve ? [solve] : []
    })
    rememberAck(remoteSessions, remoteSolves)

    const anonymous = importAnonymous ? readStore(anonymousStorageKey) : null
    const merged = mergeCloudState({
      localSessions: sessions.value,
      remoteSessions,
      remoteSolves,
      pendingDeletions: readPendingCloudDeletions()[userId] || [],
      importSessions: anonymous && sessionsHaveSolves(anonymous.sessions) ? anonymous.sessions : null
    })
    if (ownerId !== userId) return

    sessions.value = merged.sessions
    if (merged.revokedDeletionIds.length > 0) clearPendingDeletions(userId, merged.revokedDeletionIds)
    if (!merged.sessions.some(session => session.id === activeSessionId.value)) {
      activeSessionId.value = merged.sessions[0].id
    }
    pulledFor = userId
    lastRefreshAt = Date.now()
    localStorage.setItem(syncedStorageKey(userId), '1')
    localStorage.setItem(lastUserStorageKey, userId)
  }

  const pushDirty = async (userId: string) => {
    if (!db || ownerId !== userId || pulledFor !== userId) return
    const firestore = db

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (ownerId !== userId) return
      const plan = buildPushPlan({
        sessions: sessions.value,
        ackedSolves: [...ackedSolves.values()],
        ackedSessions: [...ackedSessions.values()],
        pendingDeletions: readPendingCloudDeletions()[userId] || [],
        now: nowStamp()
      })
      if (plan.sessions.length === 0 && plan.solves.length === 0 && plan.deletions.length === 0) return

      await writePlan(firestore, userId, plan)
      if (ownerId !== userId) return

      for (const session of plan.sessions) ackedSessions.set(session.id, { ...session })
      for (const solve of plan.solves) ackedSolves.set(solve.id, { ...solve })
      if (plan.deletions.length > 0) {
        for (const deletion of plan.deletions) ackedSolves.delete(deletion.id)
        clearPendingDeletions(userId, plan.deletions.map(deletion => deletion.id))
      }
    }
  }

  const readSignedOutSolveIds = (userId: string): string[] | null => {
    const parsed = readJson(signedOutSolvesKey(userId))
    if (!Array.isArray(parsed)) return null
    return parsed.filter(id => typeof id === 'string')
  }

  const switchAccount = async (userId: string | null) => {
    persistNow()
    cloudSyncError.value = ''
    if (!userId) {
      const previousOwner = ownerId
      if (previousOwner) {
        localStorage.setItem(signedOutSolvesKey(previousOwner), JSON.stringify(
          sessions.value.flatMap(session => session.solves.map(solve => solve.id))
        ))
        localStorage.setItem(lastUserStorageKey, previousOwner)
      }
      ownerId = null
      resetAck()
      persistNow()
      return
    }
    if (!isSafeUserId(userId)) throw new Error('Invalid account id.')

    const base = chooseLocalBase({
      cached: readStore(userStorageKey(userId)),
      anonymous: readStore(anonymousStorageKey),
      lastUserId: localStorage.getItem(lastUserStorageKey),
      userId,
      alreadySynced: localStorage.getItem(syncedStorageKey(userId)) === '1'
    })
    ownerId = userId
    resetAck()
    pendingAnonymousImport = base.importAnonymous
    applyStore(base.data)
    const signedOutSolveIds = base.importAnonymous ? null : readSignedOutSolveIds(userId)
    if (localStorage.getItem(syncedStorageKey(userId)) === '1' && localStorage.getItem(lastUserStorageKey) === userId && signedOutSolveIds) {
      const device = readStore(anonymousStorageKey)
      if (device) {
        const applied = applyDeviceChanges({
          accountSessions: sessions.value,
          deviceSessions: device.sessions,
          signedOutSolveIds
        })
        sessions.value = applied.sessions
        if (!applied.sessions.some(session => session.id === activeSessionId.value)) {
          activeSessionId.value = applied.sessions[0].id
        }
        const deletedAt = Date.now()
        for (const solveId of applied.deletedIds) queueCloudDeletion(userId, solveId, deletedAt)
        localStorage.removeItem(signedOutSolvesKey(userId))
      }
    }

    if (!db) {
      pulledFor = userId
      localStorage.setItem(lastUserStorageKey, userId)
      return
    }

    await pullAndMerge(userId, pendingAnonymousImport)
    if (pulledFor === userId) pendingAnonymousImport = false
    await pushDirty(userId)
  }

  const syncAccount = (userId: string | null) => {
    if (userId !== null && !isSafeUserId(userId)) {
      cloudSyncError.value = 'Could not load cloud data. Check Firestore rules and your connection.'
      return
    }
    void enqueue(() => switchAccount(userId)).catch(error => reportCloudError(error, 'load'))
  }

  const pushAccountChanges = () => {
    void enqueue(async () => {
      if (!ownerId || !db) return
      if (pulledFor !== ownerId) {
        await pullAndMerge(ownerId, pendingAnonymousImport)
        if (pulledFor === ownerId) pendingAnonymousImport = false
      }
      await pushDirty(ownerId)
      if (pulledFor === ownerId) cloudSyncError.value = ''
    }).catch(error => reportCloudError(error, 'save'))
  }

  const refreshFromCloud = () => {
    if (!ownerId) return
    const now = Date.now()
    if (now - lastRefreshAt < 10000) return
    lastRefreshAt = now
    void enqueue(async () => {
      if (!ownerId || !db) return
      cloudSyncError.value = ''
      await pullAndMerge(ownerId, pendingAnonymousImport)
      if (pulledFor === ownerId) pendingAnonymousImport = false
      await pushDirty(ownerId)
    }).catch(error => reportCloudError(error, 'load'))
  }

  const onFocus = () => refreshFromCloud()
  const onOnline = () => {
    lastRefreshAt = 0
    refreshFromCloud()
  }
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  onScopeDispose(() => {
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
  })

  const activeSession = computed(() => {
    return sessions.value.find(session => session.id === activeSessionId.value)
      ?? sessions.value[0]
      ?? createDefaultSessions()[0]
  })

  const activeSolves = computed(() => activeSession.value.solves)

  const touchActiveSession = () => {
    activeSession.value.updatedAt = nowStamp()
  }

  const addSolve = (timeMs: number, scramble: string) => {
    const createdAt = nowStamp()
    const newSolve: Solve = {
      id: createId(),
      time: timeMs,
      scramble,
      comment: '',
      penalty: 'none',
      createdAt,
      updatedAt: createdAt
    }
    activeSession.value.solves.push(newSolve)
    activeSession.value.solves.sort((left, right) => left.createdAt - right.createdAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    return newSolve
  }

  const updateSolvePenalty = (solveId: string, penalty: Penalty) => {
    const solve = activeSession.value.solves.find(candidate => candidate.id === solveId)
    if (!solve || solve.penalty === penalty) return
    solve.penalty = penalty
    solve.updatedAt = nowStamp()
  }

  const updateComment = (solveId: string, comment: string) => {
    const solve = activeSession.value.solves.find(candidate => candidate.id === solveId)
    const nextComment = comment.slice(0, 2000)
    if (!solve || solve.comment === nextComment) return
    solve.comment = nextComment
    solve.updatedAt = nowStamp()
  }

  const deleteSolve = (solveId: string) => {
    const index = activeSession.value.solves.findIndex(candidate => candidate.id === solveId)
    if (index === -1) return
    activeSession.value.solves.splice(index, 1)
    if (ownerId) queueCloudDeletion(ownerId, solveId)
  }

  const queueCloudDeletion = (userId: string, solveId: string, deletedAt = nowStamp()) => {
    const deletions = readPendingCloudDeletions()
    const userDeletions = new Map((deletions[userId] || []).map(deletion => [deletion.id, deletion]))
    userDeletions.set(solveId, { id: solveId, deletedAt })
    deletions[userId] = [...userDeletions.values()]
    writePendingCloudDeletions(deletions)
  }

  const createSession = () => {
    const newId = createId()
    sessions.value.push({
      id: newId,
      name: `Session ${sessions.value.length + 1}`.slice(0, 80),
      cubeType: '3x3',
      updatedAt: nowStamp(),
      solves: []
    })
    activeSessionId.value = newId
  }

  const renameSession = (id: string, newName: string) => {
    const session = sessions.value.find(candidate => candidate.id === id)
    const name = newName.trim().slice(0, 80)
    if (!session || !name || session.name === name) return
    session.name = name
    session.updatedAt = nowStamp()
  }

  const updateActiveCubeType = (cubeType: string) => {
    const nextType = cubeType.trim().slice(0, 40)
    if (!nextType || activeSession.value.cubeType === nextType) return
    activeSession.value.cubeType = nextType
    touchActiveSession()
  }

  const getEffectiveTime = (solve: Solve): number => {
    if (solve.penalty === 'DNF') return Infinity
    if (solve.penalty === '+2') return solve.time + 2000
    return solve.time
  }

  const formatTime = (ms: number | null | undefined, penalty: Penalty = 'none'): string => {
    if (ms === null || ms === undefined) return '-'
    if (penalty === 'DNF' || ms === Infinity) return 'DNF'

    const displayTime = penalty === '+2' ? ms + 2000 : ms
    const totalSeconds = displayTime / 1000
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = (totalSeconds % 60).toFixed(2)
    const formatted = minutes > 0 ? `${minutes}:${seconds.padStart(5, '0')}` : seconds

    return penalty === '+2' ? `${formatted}+` : formatted
  }

  const calculateAverage = (count: number): number | null => {
    if (activeSolves.value.length < count) return null

    const recent = activeSolves.value.slice(-count)
    const effectiveTimes = recent.map(solve => getEffectiveTime(solve))
    const dnfCount = effectiveTimes.filter(time => time === Infinity).length
    if (dnfCount > 1) return null

    effectiveTimes.sort((left, right) => left - right)
    effectiveTimes.pop()
    effectiveTimes.shift()

    const sum = effectiveTimes.reduce((total, current) => total + current, 0)
    return sum / effectiveTimes.length
  }

  const ao5 = computed(() => calculateAverage(5))
  const ao12 = computed(() => calculateAverage(12))
  const ao100 = computed(() => calculateAverage(100))

  const bestTime = computed(() => {
    if (activeSolves.value.length === 0) return null
    const validTimes = activeSolves.value
      .map(solve => getEffectiveTime(solve))
      .filter(time => time !== Infinity)

    if (validTimes.length === 0) return null
    return Math.min(...validTimes)
  })

  return {
    sessions,
    activeSessionId,
    activeSession,
    activeSolves,
    cloudSyncError,
    addSolve,
    updateSolvePenalty,
    updateComment,
    deleteSolve,
    createSession,
    renameSession,
    updateActiveCubeType,
    syncAccount,
    pushAccountChanges,
    ao5,
    ao12,
    ao100,
    bestTime,
    formatTime,
    getEffectiveTime
  }
}

const clearPendingDeletions = (userId: string, solveIds: string[]) => {
  const deletions = readPendingCloudDeletions()
  const removed = new Set(solveIds)
  const remaining = (deletions[userId] || []).filter(deletion => !removed.has(deletion.id))
  if (remaining.length > 0) deletions[userId] = remaining
  else delete deletions[userId]
  writePendingCloudDeletions(deletions)
}

const writePlan = async (firestore: Firestore, userId: string, plan: PushPlan) => {
  const sessionsCollection = collection(firestore, 'users', userId, 'sessions')
  const solvesCollection = collection(firestore, 'users', userId, 'solves')
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [
    ...plan.sessions.map(session => (batch: ReturnType<typeof writeBatch>) => {
      batch.set(doc(sessionsCollection, session.id), {
        name: session.name,
        cubeType: session.cubeType,
        updatedAt: session.updatedAt
      })
    }),
    ...plan.solves.map(solve => (batch: ReturnType<typeof writeBatch>) => {
      batch.set(doc(solvesCollection, solve.id), {
        time: solve.time,
        scramble: solve.scramble,
        comment: solve.comment,
        penalty: solve.penalty,
        sessionId: solve.sessionId,
        createdAt: solve.createdAt,
        updatedAt: solve.updatedAt
      })
    })
  ]
  const tombstones = plan.deletions.map(deletion => (batch: ReturnType<typeof writeBatch>) => {
    batch.set(doc(solvesCollection, deletion.id), {
      deletedAt: deletion.deletedAt,
      updatedAt: deletion.deletedAt
    })
  })
  await commitOperations(firestore, [...writes, ...tombstones])
}

const getCloudErrorMessage = (error: unknown, operation: 'load' | 'save') => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
    return `Firestore denied the ${operation}. Deploy firestore.rules and verify the signed-in user.`
  }

  return operation === 'load'
    ? 'Could not load cloud data. Check Firestore rules and your connection.'
    : 'Could not upload cloud data. Check Firestore rules and your connection.'
}
