import { ref, computed, watch } from 'vue'
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export type Penalty = 'none' | '+2' | 'DNF'

export interface Solve {
  id: number
  time: number // Raw time in ms
  scramble: string
  comment: string
  penalty: Penalty
}

interface CloudSolve extends Solve {
  sessionId: string
}

interface CloudSession {
  id: string
  name: string
  cubeType: string
}

export interface Session {
  id: string
  name: string
  cubeType: string
  solves: Solve[]
}

const createDefaultSessions = (): Session[] => [
  { id: '1', name: 'Session 1', cubeType: '3x3', solves: [] },
  { id: '2', name: 'Session 2', cubeType: '3x3', solves: [] },
  { id: '3', name: 'Session 3', cubeType: '3x3', solves: [] }
]

const pendingDeletionStorageKey = 'rutimer-pending-cloud-deletions'

const readPendingCloudDeletions = (): Record<string, string[]> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(pendingDeletionStorageKey) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(Object.entries(parsed).filter(([, ids]) =>
      Array.isArray(ids) && ids.every(id => typeof id === 'string')
    )) as Record<string, string[]>
  } catch {
    return {}
  }
}

const writePendingCloudDeletions = (deletions: Record<string, string[]>) => {
  try {
    localStorage.setItem(pendingDeletionStorageKey, JSON.stringify(deletions))
  } catch (error) {
    console.error('Failed to save pending cloud deletions.', error)
  }
}

const isStoredSolve = (value: unknown): value is Solve => {
  if (!value || typeof value !== 'object') return false

  const solve = value as Partial<Solve>
  return typeof solve.id === 'number' && Number.isFinite(solve.id) &&
    typeof solve.time === 'number' && Number.isFinite(solve.time) &&
    typeof solve.scramble === 'string' &&
    typeof solve.comment === 'string' &&
    (solve.penalty === 'none' || solve.penalty === '+2' || solve.penalty === 'DNF')
}

const isStoredSession = (value: unknown): value is Session => {
  if (!value || typeof value !== 'object') return false

  const session = value as Partial<Session>
  return typeof session.id === 'string' &&
    typeof session.name === 'string' &&
    typeof session.cubeType === 'string' &&
    Array.isArray(session.solves) &&
    session.solves.every(isStoredSolve)
}

const isStoredData = (value: unknown): value is { sessions: Session[], activeSessionId?: string } => {
  if (!value || typeof value !== 'object') return false

  const data = value as { sessions?: unknown, activeSessionId?: unknown }
  return Array.isArray(data.sessions) &&
    data.sessions.length > 0 &&
    data.sessions.every(isStoredSession) &&
    (data.activeSessionId === undefined || typeof data.activeSessionId === 'string')
}

export function useSolves() {
  const sessions = ref<Session[]>(createDefaultSessions())
  const activeSessionId = ref<string>('1')

  try {
    const stored = localStorage.getItem('rutimer-data')
    const parsed: unknown = stored ? JSON.parse(stored) : null
    if (isStoredData(parsed)) {
      sessions.value = parsed.sessions
      activeSessionId.value = parsed.sessions.some(session => session.id === parsed.activeSessionId)
        ? parsed.activeSessionId as string
        : parsed.sessions[0].id
    }
  } catch (error) {
    console.error('Failed to parse local storage data, starting fresh.', error)
  }

  watch([sessions, activeSessionId], () => {
    try {
      localStorage.setItem('rutimer-data', JSON.stringify({
        sessions: sessions.value,
        activeSessionId: activeSessionId.value
      }))
    } catch (error) {
      console.error('Failed to save local storage data.', error)
    }
  }, { deep: true })

  const activeSession = computed(() => {
    return sessions.value.find(s => s.id === activeSessionId.value) || sessions.value[0]
  })
  
  const activeSolves = computed(() => activeSession.value.solves)

  const createSolveId = (): number => {
    let id = Date.now()
    const existingIds = new Set(sessions.value.flatMap(session => session.solves.map(solve => solve.id)))
    while (existingIds.has(id)) id++
    return id
  }

  const createSessionId = (): string => {
    let id = Date.now()
    const existingIds = new Set(sessions.value.map(session => session.id))
    while (existingIds.has(id.toString())) id++
    return id.toString()
  }

  const addSolve = (timeMs: number, scramble: string) => {
    const newSolve: Solve = {
      id: createSolveId(),
      time: timeMs,
      scramble: scramble,
      comment: '',
      penalty: 'none'
    }
    activeSession.value.solves.push(newSolve)
    return newSolve
  }

  const updateSolvePenalty = (solveId: number, penalty: Penalty) => {
    const solve = activeSession.value.solves.find(s => s.id === solveId)
    if (solve) solve.penalty = penalty
  }

  const updateComment = (solveId: number, comment: string) => {
    const solve = activeSession.value.solves.find(s => s.id === solveId)
    if (solve) solve.comment = comment
  }

  const deleteSolve = (solveId: number) => {
    const index = activeSession.value.solves.findIndex(s => s.id === solveId)
    if (index !== -1) {
      activeSession.value.solves.splice(index, 1)
    }
  }

  const queueCloudDeletion = (userId: string, solveId: number) => {
    const deletions = readPendingCloudDeletions()
    const userDeletions = new Set(deletions[userId] || [])
    userDeletions.add(solveId.toString())
    deletions[userId] = [...userDeletions]
    writePendingCloudDeletions(deletions)
  }

  const createSession = () => {
    const newId = createSessionId()
    sessions.value.push({
      id: newId,
      name: `Session ${sessions.value.length + 1}`,
      cubeType: '3x3',
      solves: []
    })
    activeSessionId.value = newId
  }

  const renameSession = (id: string, newName: string) => {
    const session = sessions.value.find(s => s.id === id)
    if (session && newName.trim()) {
      session.name = newName.trim()
    }
  }

  const loadSessionMetadataFromCloud = async (userId: string) => {
    if (!db) return

    const snapshot = await getDocs(collection(db, 'users', userId, 'sessions'))
    snapshot.docs.forEach(sessionDoc => {
      const data = { ...sessionDoc.data(), id: sessionDoc.id }
      if (!isStoredCloudSession(data)) return

      const localSession = sessions.value.find(session => session.id === data.id)
      if (localSession) {
        localSession.name = data.name
        localSession.cubeType = data.cubeType
      } else {
        sessions.value.push({
          id: data.id,
          name: data.name,
          cubeType: data.cubeType,
          solves: []
        })
      }
    })
  }

  const saveSessionMetadataToCloud = async (userId: string) => {
    if (!db) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local.')

    const sessionsCollection = collection(db, 'users', userId, 'sessions')
    const remoteSnapshot = await getDocs(sessionsCollection)
    const localSessionIds = new Set(sessions.value.map(session => session.id))

    await Promise.all(remoteSnapshot.docs
      .filter(sessionDoc => !localSessionIds.has(sessionDoc.id))
      .map(sessionDoc => deleteDoc(sessionDoc.ref)))

    await Promise.all(sessions.value.map(session =>
      setDoc(doc(sessionsCollection, session.id), {
        name: session.name,
        cubeType: session.cubeType
      })
    ))
  }

  const loadSolvesFromCloud = async (userId: string): Promise<boolean> => {
    if (!db) return false

    const solvesCollection = collection(db, 'users', userId, 'solves')
    const pendingDeletions = readPendingCloudDeletions()
    const deletedIds = new Set(pendingDeletions[userId] || [])

    await Promise.all([...deletedIds].map(solveId =>
      deleteDoc(doc(solvesCollection, solveId))
    ))

    const snapshot = await getDocs(solvesCollection)
    if (snapshot.empty) return false

    const cloudSolves = snapshot.docs.flatMap(snapshotDoc => {
      const data = snapshotDoc.data()
      const cloudSolve = data as Partial<CloudSolve>
      return !deletedIds.has(snapshotDoc.id) && isStoredSolve(data) && typeof cloudSolve.sessionId === 'string'
        ? [{ solve: data, sessionId: cloudSolve.sessionId }]
        : []
    })

    cloudSolves.forEach(({ solve, sessionId }) => {
      let session = sessions.value.find(candidate => candidate.id === sessionId)
      if (!session) {
        session = {
          id: sessionId,
          name: 'Synced solves',
          cubeType: '3x3',
          solves: []
        }
        sessions.value.push(session)
      }
      if (session.solves.some(candidate => candidate.id === solve.id)) return
      session.solves.push(solve)
    })

    return cloudSolves.length > 0
  }

  const saveSolvesToCloud = async (userId: string) => {
    if (!db) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local.')

    const solvesCollection = collection(db, 'users', userId, 'solves')
    const remoteSnapshot = await getDocs(solvesCollection)
    const localSolveIds = new Set(sessions.value.flatMap(session => session.solves.map(solve => solve.id.toString())))

    await Promise.all(remoteSnapshot.docs
      .filter(snapshotDoc => !localSolveIds.has(snapshotDoc.id))
      .map(snapshotDoc => deleteDoc(snapshotDoc.ref)))

    await Promise.all(sessions.value.flatMap(session => session.solves.map(solve =>
      setDoc(doc(solvesCollection, solve.id.toString()), {
        ...solve,
        sessionId: session.id
      })
    )))

    const pendingDeletions = readPendingCloudDeletions()
    delete pendingDeletions[userId]
    writePendingCloudDeletions(pendingDeletions)
  }

  // Returns effective time (adding 2000ms for +2, Infinity for DNF)
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

  // WCA Average Logic with Penalties
  const calculateAverage = (count: number): number | null => {
    if (activeSolves.value.length < count) return null
    
    const recent = activeSolves.value.slice(-count)
    const effectiveTimes = recent.map(s => getEffectiveTime(s))
    
    // Count DNFs in the current set
    const dnfCount = effectiveTimes.filter(t => t === Infinity).length
    if (dnfCount > 1) return null // WCA rule: More than 1 DNF results in DNF average
    
    effectiveTimes.sort((a, b) => a - b)
    effectiveTimes.pop() // Drop worst (or single DNF)
    effectiveTimes.shift() // Drop best
    
    const sum = effectiveTimes.reduce((total, current) => total + current, 0)
    return sum / effectiveTimes.length
  }

  const ao5 = computed(() => calculateAverage(5))
  const ao12 = computed(() => calculateAverage(12))
  const ao100 = computed(() => calculateAverage(100))
  
  const bestTime = computed(() => {
    if (activeSolves.value.length === 0) return null
    const validTimes = activeSolves.value
      .map(s => getEffectiveTime(s))
      .filter(t => t !== Infinity)
    
    if (validTimes.length === 0) return null
    return Math.min(...validTimes)
  })

  return { 
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
    formatTime,
    getEffectiveTime
  }
}

const isStoredCloudSession = (value: unknown): value is CloudSession => {
  if (!value || typeof value !== 'object') return false

  const session = value as Partial<CloudSession>
  return typeof session.id === 'string' &&
    typeof session.name === 'string' &&
    typeof session.cubeType === 'string'
}