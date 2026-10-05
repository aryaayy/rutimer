export type Penalty = 'none' | '+2' | 'DNF'

export interface Solve {
  id: string
  time: number
  scramble: string
  comment: string
  penalty: Penalty
  createdAt: number
  updatedAt: number
}

export interface Session {
  id: string
  name: string
  cubeType: string
  updatedAt: number
  solves: Solve[]
}

export interface StoredData {
  sessions: Session[]
  activeSessionId: string
}

export interface CloudSession {
  id: string
  name: string
  cubeType: string
  updatedAt: number
}

export interface CloudSolve extends Solve {
  sessionId: string
  deletedAt?: number
}

export interface PendingDeletion {
  id: string
  deletedAt: number
}

export interface PushPlan {
  sessions: CloudSession[]
  solves: CloudSolve[]
  deletions: PendingDeletion[]
}

const MAX_TIME_MS = 365 * 24 * 60 * 60 * 1000
const MAX_SCRAMBLE_LENGTH = 20000
const MAX_COMMENT_LENGTH = 2000
const MAX_NAME_LENGTH = 80
const MAX_CUBE_TYPE_LENGTH = 40

const penalties: Penalty[] = ['none', '+2', 'DNF']

export const isSafeDocId = (value: string) => /^[A-Za-z0-9_-]{1,80}$/.test(value)

export const createDefaultSessions = (): Session[] => [
  { id: '1', name: 'Session 1', cubeType: '3x3', updatedAt: 0, solves: [] },
  { id: '2', name: 'Session 2', cubeType: '3x3', updatedAt: 0, solves: [] },
  { id: '3', name: 'Session 3', cubeType: '3x3', updatedAt: 0, solves: [] }
]

export const isPristineDefaultSessions = (sessions: Session[]): boolean => {
  if (sessions.length !== 3) return false

  return sessions.every((session, index) => {
    const defaults = createDefaultSessions()[index]
    return session.id === defaults.id &&
      session.name === defaults.name &&
      session.cubeType === defaults.cubeType &&
      session.updatedAt === 0 &&
      session.solves.length === 0
  })
}

const timestampFromLegacyId = (id: string): number | null => {
  if (!/^\d{13}$/.test(id)) return null

  const value = Number(id)
  if (value < 1_600_000_000_000 || value > 10_000_000_000_000) return null
  return value
}

const readId = (value: unknown): string | null => {
  if (typeof value === 'string' && isSafeDocId(value)) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    const id = String(value)
    return isSafeDocId(id) ? id : null
  }
  return null
}

const readPositiveTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

const compareSolves = (left: Solve, right: Solve) => {
  return left.createdAt - right.createdAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

const cloneSessions = (sessions: Session[]): Session[] => {
  return sessions.map(session => ({
    ...session,
    solves: session.solves.map(solve => ({ ...solve }))
  }))
}

export const sessionsHaveSolves = (sessions: Session[]) => sessions.some(session => session.solves.length > 0)

export const normalizeSolve = (value: unknown): Solve | null => {
  if (!value || typeof value !== 'object') return null

  const solve = value as Record<string, unknown>
  const id = readId(solve.id)
  if (!id) return null
  if (typeof solve.time !== 'number' || !Number.isFinite(solve.time) || solve.time < 0) return null
  if (typeof solve.scramble !== 'string') return null

  const createdAt = readPositiveTimestamp(solve.createdAt) ?? timestampFromLegacyId(id)
  if (createdAt === null) return null

  const penalty = solve.penalty === undefined ? 'none' : solve.penalty
  if (!penalties.includes(penalty as Penalty)) return null

  const comment = solve.comment === undefined ? '' : solve.comment
  if (typeof comment !== 'string') return null

  return {
    id,
    time: solve.time,
    scramble: solve.scramble,
    comment: comment.slice(0, MAX_COMMENT_LENGTH),
    penalty: penalty as Penalty,
    createdAt,
    updatedAt: readPositiveTimestamp(solve.updatedAt) ?? createdAt
  }
}

export const normalizeSession = (value: unknown): Session | null => {
  if (!value || typeof value !== 'object') return null

  const session = value as Record<string, unknown>
  if (typeof session.id !== 'string' || !isSafeDocId(session.id)) return null
  if (typeof session.name !== 'string' || session.name.trim() === '') return null

  const cubeType = typeof session.cubeType === 'string' && session.cubeType.trim()
    ? session.cubeType
    : '3x3'
  const solvesById = new Map<string, Solve>()
  if (Array.isArray(session.solves)) {
    for (const entry of session.solves) {
      const solve = normalizeSolve(entry)
      if (!solve) continue
      const existing = solvesById.get(solve.id)
      if (!existing || solve.updatedAt >= existing.updatedAt) solvesById.set(solve.id, solve)
    }
  }

  const updatedAt = typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt) && session.updatedAt >= 0
    ? session.updatedAt
    : 0

  return {
    id: session.id,
    name: session.name.trim().slice(0, MAX_NAME_LENGTH),
    cubeType: cubeType.trim().slice(0, MAX_CUBE_TYPE_LENGTH),
    updatedAt,
    solves: [...solvesById.values()].sort(compareSolves)
  }
}

export const normalizeStoredData = (value: unknown): StoredData | null => {
  if (!value || typeof value !== 'object') return null

  const data = value as { sessions?: unknown, activeSessionId?: unknown }
  if (!Array.isArray(data.sessions)) return null

  const sessions = data.sessions.flatMap(session => {
    const normalized = normalizeSession(session)
    return normalized ? [normalized] : []
  })
  if (sessions.length === 0) return null

  const activeSessionId = typeof data.activeSessionId === 'string' && sessions.some(session => session.id === data.activeSessionId)
    ? data.activeSessionId
    : sessions[0].id

  return { sessions, activeSessionId }
}

export const normalizeCloudSession = (id: string, value: unknown): CloudSession | null => {
  if (!isSafeDocId(id) || !value || typeof value !== 'object') return null

  const session = value as Record<string, unknown>
  const normalized = normalizeSession({
    id,
    name: session.name,
    cubeType: session.cubeType,
    updatedAt: session.updatedAt,
    solves: []
  })
  if (!normalized) return null

  return {
    id: normalized.id,
    name: normalized.name,
    cubeType: normalized.cubeType,
    updatedAt: normalized.updatedAt
  }
}

export const normalizeCloudSolve = (id: string, value: unknown): CloudSolve | null => {
  if (!isSafeDocId(id) || !value || typeof value !== 'object') return null

  const data = value as Record<string, unknown>
  const deletedAt = typeof data.deletedAt === 'number' && Number.isFinite(data.deletedAt) && data.deletedAt > 0
    ? data.deletedAt
    : undefined

  if (typeof data.time !== 'number') {
    if (!deletedAt) return null
    return {
      id,
      sessionId: '1',
      time: 0,
      scramble: '',
      comment: '',
      penalty: 'none',
      createdAt: deletedAt,
      updatedAt: deletedAt,
      deletedAt
    }
  }

  if (typeof data.sessionId !== 'string' || !isSafeDocId(data.sessionId)) return null
  const solve = normalizeSolve({ ...data, id })
  if (!solve) return null
  return deletedAt ? { ...solve, sessionId: data.sessionId, deletedAt } : { ...solve, sessionId: data.sessionId }
}

const sessionSortKey = (session: Session) => {
  const earliestSolve = session.solves.reduce(
    (earliest, solve) => Math.min(earliest, solve.createdAt),
    Number.POSITIVE_INFINITY
  )
  if (earliestSolve !== Number.POSITIVE_INFINITY) return earliestSolve
  return timestampFromLegacyId(session.id) ?? session.updatedAt
}

export const chooseLocalBase = (options: {
  cached: StoredData | null
  anonymous: StoredData | null
  lastUserId: string | null
  userId: string
  alreadySynced: boolean
}): { data: StoredData, importAnonymous: boolean } => {
  const defaults = { sessions: createDefaultSessions(), activeSessionId: '1' }
  if (options.alreadySynced) {
    return { data: options.cached ?? defaults, importAnonymous: false }
  }

  if (options.cached && !isPristineDefaultSessions(options.cached.sessions)) {
    return { data: options.cached, importAnonymous: false }
  }

  if (options.lastUserId === options.userId && options.anonymous) {
    return { data: options.anonymous, importAnonymous: false }
  }

  return {
    data: defaults,
    importAnonymous: options.lastUserId === null
  }
}

export const mergeCloudState = (options: {
  localSessions: Session[]
  remoteSessions: CloudSession[]
  remoteSolves: CloudSolve[]
  pendingDeletions: PendingDeletion[]
  importSessions: Session[] | null
}): { sessions: Session[], revokedDeletionIds: string[] } => {
  const remoteHasData = options.remoteSessions.length > 0 || options.remoteSolves.length > 0
  let local = cloneSessions(options.localSessions)

  if (isPristineDefaultSessions(local)) {
    if (!remoteHasData && options.importSessions && sessionsHaveSolves(options.importSessions)) {
      local = cloneSessions(options.importSessions)
    } else if (remoteHasData) {
      local = []
    }
  }

  const sessionMap = new Map<string, Session>()
  for (const session of local) {
    sessionMap.set(session.id, { ...session, solves: [] })
  }

  for (const remoteSession of options.remoteSessions) {
    const existing = sessionMap.get(remoteSession.id)
    if (!existing) {
      sessionMap.set(remoteSession.id, { ...remoteSession, solves: [] })
      continue
    }
    if (remoteSession.updatedAt > existing.updatedAt) {
      existing.name = remoteSession.name
      existing.cubeType = remoteSession.cubeType
      existing.updatedAt = remoteSession.updatedAt
    }
  }

  const pendingDeletedAt = new Map(options.pendingDeletions.map(deletion => [deletion.id, deletion.deletedAt]))
  const deletionWins = (solveId: string, updatedAt: number) => {
    const deletedAt = pendingDeletedAt.get(solveId)
    if (deletedAt === undefined) return false
    return deletedAt === 0 || deletedAt >= updatedAt
  }

  const placedSolves = new Map<string, { solve: Solve, sessionId: string }>()
  for (const session of local) {
    for (const solve of session.solves) {
      if (deletionWins(solve.id, solve.updatedAt)) continue
      placedSolves.set(solve.id, { solve: { ...solve }, sessionId: session.id })
    }
  }

  const revokedDeletionIds: string[] = []
  for (const remoteSolve of options.remoteSolves) {
    const pendingAt = pendingDeletedAt.get(remoteSolve.id)
    if (remoteSolve.deletedAt) {
      const current = placedSolves.get(remoteSolve.id)
      if (current && remoteSolve.deletedAt >= current.solve.updatedAt) placedSolves.delete(remoteSolve.id)
      continue
    }

    if (pendingAt !== undefined && (pendingAt === 0 || pendingAt >= remoteSolve.updatedAt)) continue
    if (pendingAt !== undefined && pendingAt > 0 && remoteSolve.updatedAt > pendingAt) {
      revokedDeletionIds.push(remoteSolve.id)
    }

    const current = placedSolves.get(remoteSolve.id)
    if (!current || remoteSolve.updatedAt > current.solve.updatedAt) {
      placedSolves.set(remoteSolve.id, {
        solve: {
          id: remoteSolve.id,
          time: remoteSolve.time,
          scramble: remoteSolve.scramble,
          comment: remoteSolve.comment,
          penalty: remoteSolve.penalty,
          createdAt: remoteSolve.createdAt,
          updatedAt: remoteSolve.updatedAt
        },
        sessionId: remoteSolve.sessionId
      })
    }
  }

  for (const { solve, sessionId } of placedSolves.values()) {
    let session = sessionMap.get(sessionId)
    if (!session) {
      session = {
        id: sessionId,
        name: 'Synced solves',
        cubeType: '3x3',
        updatedAt: 0,
        solves: []
      }
      sessionMap.set(sessionId, session)
    }
    session.solves.push(solve)
  }

  for (const session of sessionMap.values()) session.solves.sort(compareSolves)

  const localIds = local.map(session => session.id)
  const ordered = localIds.flatMap(id => {
    const session = sessionMap.get(id)
    return session ? [session] : []
  })
  const extras = [...sessionMap.values()]
    .filter(session => !localIds.includes(session.id))
    .sort((left, right) => sessionSortKey(left) - sessionSortKey(right) || left.id.localeCompare(right.id))

  const sessions = [...ordered, ...extras]
  const liveSessions = sessions.length > 0 ? sessions : createDefaultSessions()
  const liveIds = new Set(liveSessions.flatMap(session => session.solves.map(solve => solve.id)))
  for (const deletion of options.pendingDeletions) {
    if (liveIds.has(deletion.id)) revokedDeletionIds.push(deletion.id)
  }

  return {
    sessions: liveSessions,
    revokedDeletionIds: [...new Set(revokedDeletionIds)]
  }
}

export const applyDeviceChanges = (options: {
  accountSessions: Session[]
  deviceSessions: Session[]
  signedOutSolveIds: string[]
}): { sessions: Session[], deletedIds: string[] } => {
  const deviceSolves = new Map<string, { solve: Solve, sessionId: string }>()
  for (const session of options.deviceSessions) {
    for (const solve of session.solves) {
      deviceSolves.set(solve.id, { solve: { ...solve }, sessionId: session.id })
    }
  }

  const deletedIds = options.signedOutSolveIds.filter(id => isSafeDocId(id) && !deviceSolves.has(id))
  const deleted = new Set(deletedIds)
  const account = cloneSessions(options.accountSessions)
  const sessionMap = new Map<string, Session>()
  for (const session of account) sessionMap.set(session.id, { ...session, solves: [] })

  const placed = new Map<string, { solve: Solve, sessionId: string }>()
  for (const session of account) {
    for (const solve of session.solves) {
      if (deleted.has(solve.id)) continue
      const device = deviceSolves.get(solve.id)
      if (device && device.solve.updatedAt > solve.updatedAt) {
        placed.set(solve.id, { solve: { ...device.solve }, sessionId: device.sessionId })
      } else {
        placed.set(solve.id, { solve: { ...solve }, sessionId: session.id })
      }
    }
  }

  for (const [solveId, device] of deviceSolves) {
    if (deleted.has(solveId) || placed.has(solveId)) continue
    placed.set(solveId, { solve: { ...device.solve }, sessionId: device.sessionId })
  }

  for (const { solve, sessionId } of placed.values()) {
    let session = sessionMap.get(sessionId)
    if (!session) {
      session = { id: sessionId, name: 'Synced solves', cubeType: '3x3', updatedAt: 0, solves: [] }
      sessionMap.set(sessionId, session)
    }
    session.solves.push(solve)
  }

  for (const session of sessionMap.values()) session.solves.sort(compareSolves)
  const orderedIds = account.map(session => session.id)
  const ordered = orderedIds.flatMap(id => {
    const session = sessionMap.get(id)
    return session ? [session] : []
  })
  const extras = [...sessionMap.values()].filter(session => !orderedIds.includes(session.id))
  const sessions = [...ordered, ...extras]
  return { sessions: sessions.length > 0 ? sessions : createDefaultSessions(), deletedIds }
}

const solveContentMatches = (solve: Solve, acked: CloudSolve, sessionId: string) => {
  return acked.sessionId === sessionId &&
    acked.time === solve.time &&
    acked.scramble === solve.scramble &&
    acked.comment === solve.comment &&
    acked.penalty === solve.penalty &&
    acked.createdAt === solve.createdAt &&
    acked.updatedAt === solve.updatedAt
}

export const canUploadSolve = (solve: Solve) => {
  return solve.time <= MAX_TIME_MS &&
    solve.scramble.length <= MAX_SCRAMBLE_LENGTH &&
    solve.comment.length <= MAX_COMMENT_LENGTH &&
    solve.createdAt > 0 &&
    solve.updatedAt > 0
}

export const buildPushPlan = (options: {
  sessions: Session[]
  ackedSolves: CloudSolve[]
  ackedSessions: CloudSession[]
  pendingDeletions: PendingDeletion[]
  now: number
}): PushPlan => {
  const ackedSolves = new Map(options.ackedSolves.map(solve => [solve.id, solve]))
  const ackedSessions = new Map(options.ackedSessions.map(session => [session.id, session]))
  const pending = new Set(options.pendingDeletions.map(deletion => deletion.id))
  const localSolveIds = new Set(options.sessions.flatMap(session => session.solves.map(solve => solve.id)))

  const sessions: CloudSession[] = []
  for (const session of options.sessions) {
    const acked = ackedSessions.get(session.id)
    if (acked && acked.updatedAt > session.updatedAt) continue
    const changed = !acked ||
      acked.name !== session.name ||
      acked.cubeType !== session.cubeType ||
      acked.updatedAt !== session.updatedAt
    if (!changed) continue
    if (acked && acked.updatedAt === session.updatedAt) session.updatedAt = Math.max(options.now, session.updatedAt + 1)
    sessions.push({
      id: session.id,
      name: session.name,
      cubeType: session.cubeType,
      updatedAt: session.updatedAt
    })
  }

  const solves: CloudSolve[] = []
  for (const session of options.sessions) {
    for (const solve of session.solves) {
      if (pending.has(solve.id) || !canUploadSolve(solve)) continue
      const acked = ackedSolves.get(solve.id)
      if (acked && acked.updatedAt > solve.updatedAt) continue
      if (acked && solveContentMatches(solve, acked, session.id)) continue
      if (acked && acked.updatedAt === solve.updatedAt) solve.updatedAt = Math.max(options.now, solve.updatedAt + 1)
      solves.push({ ...solve, sessionId: session.id })
    }
  }

  return {
    sessions,
    solves,
    deletions: options.pendingDeletions
      .filter(deletion => !localSolveIds.has(deletion.id))
      .map(deletion => ({
        id: deletion.id,
        deletedAt: deletion.deletedAt > 0 ? deletion.deletedAt : options.now
      }))
  }
}
