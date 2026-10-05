import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyDeviceChanges,
  buildPushPlan,
  chooseLocalBase,
  createDefaultSessions,
  mergeCloudState,
  normalizeStoredData,
  type CloudSession,
  type CloudSolve,
  type Session,
  type Solve
} from '../src/solveSync.ts'

const solve = (overrides: Partial<Solve> = {}): Solve => ({
  id: 'solve-1',
  time: 12340,
  scramble: 'R U R\' U\'',
  comment: '',
  penalty: 'none',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides
})

const session = (overrides: Partial<Session> = {}): Session => ({
  id: '1',
  name: 'Session 1',
  cubeType: '3x3',
  updatedAt: 0,
  solves: [],
  ...overrides
})

const cloudSolve = (overrides: Partial<CloudSolve> = {}): CloudSolve => ({
  ...solve(),
  sessionId: '1',
  ...overrides
})

describe('stored history', () => {
  it('keeps valid solves when one stored solve is corrupt', () => {
    const stored = normalizeStoredData({
      activeSessionId: '1',
      sessions: [{
        id: '1',
        name: 'Session 1',
        cubeType: '3x3',
        solves: [
          { id: 1_700_000_000_000, time: 1000, scramble: 'R U', comment: '', penalty: 'none' },
          { id: 'bad', time: 'slow', scramble: 'R' }
        ]
      }]
    })

    assert.equal(stored?.sessions[0].solves.length, 1)
    assert.equal(stored?.sessions[0].solves[0].id, '1700000000000')
    assert.equal(stored?.sessions[0].solves[0].createdAt, 1_700_000_000_000)
  })

  it('sorts solves from oldest to newest', () => {
    const stored = normalizeStoredData({
      sessions: [session({
        solves: [
          solve({ id: 'b', createdAt: 20, updatedAt: 20 }),
          solve({ id: 'a', createdAt: 10, updatedAt: 10 })
        ]
      })]
    })

    assert.deepEqual(stored?.sessions[0].solves.map(item => item.id), ['a', 'b'])
  })
})

describe('account separation', () => {
  const guest = {
    sessions: [session({ solves: [solve()] })],
    activeSessionId: '1'
  }

  it('imports this device only for a brand-new cloud account', () => {
    const choice = chooseLocalBase({
      cached: null,
      anonymous: guest,
      lastUserId: null,
      userId: 'user-b',
      alreadySynced: false
    })

    assert.equal(choice.importAnonymous, true)
    assert.equal(choice.data.sessions[0].solves.length, 0)
  })

  it('does not give this device history to a different existing account', () => {
    const choice = chooseLocalBase({
      cached: null,
      anonymous: guest,
      lastUserId: 'user-a',
      userId: 'user-b',
      alreadySynced: false
    })

    assert.equal(choice.importAnonymous, false)
  })

  it('keeps using the account cache after the first sync', () => {
    const cached = {
      sessions: [session({ name: 'Cloud', solves: [solve({ id: 'cloud' })] })],
      activeSessionId: '1'
    }
    const choice = chooseLocalBase({
      cached,
      anonymous: guest,
      lastUserId: 'user-a',
      userId: 'user-a',
      alreadySynced: true
    })

    assert.equal(choice.importAnonymous, false)
    assert.equal(choice.data.sessions[0].name, 'Cloud')
  })
})

describe('cloud merge', () => {
  it('keeps solves that exist only in the cloud', () => {
    const merged = mergeCloudState({
      localSessions: [session({ solves: [solve({ id: 'local', createdAt: 10, updatedAt: 10 })] })],
      remoteSessions: [],
      remoteSolves: [cloudSolve({ id: 'remote', createdAt: 30, updatedAt: 30 })],
      pendingDeletions: [],
      importSessions: null
    })

    assert.deepEqual(merged.sessions[0].solves.map(item => item.id), ['local', 'remote'])
  })

  it('uses the newer copy when both devices changed a solve', () => {
    const merged = mergeCloudState({
      localSessions: [session({ solves: [solve({ comment: 'local', updatedAt: 10 })] })],
      remoteSessions: [],
      remoteSolves: [cloudSolve({ comment: 'cloud', updatedAt: 20 })],
      pendingDeletions: [],
      importSessions: null
    })

    assert.equal(merged.sessions[0].solves[0].comment, 'cloud')
  })

  it('hides a deleted solve and does not restore it from an older cloud copy', () => {
    const merged = mergeCloudState({
      localSessions: [session()],
      remoteSessions: [],
      remoteSolves: [cloudSolve({ updatedAt: 10 })],
      pendingDeletions: [{ id: 'solve-1', deletedAt: 20 }],
      importSessions: null
    })

    assert.equal(merged.sessions[0].solves.length, 0)
  })

  it('applies a deletion made on another device', () => {
    const merged = mergeCloudState({
      localSessions: [session({ solves: [solve({ updatedAt: 10 })] })],
      remoteSessions: [],
      remoteSolves: [cloudSolve({ updatedAt: 10, deletedAt: 25 })],
      pendingDeletions: [],
      importSessions: null
    })

    assert.equal(merged.sessions[0].solves.length, 0)
  })

  it('replaces empty default sessions with the cloud account', () => {
    const remoteSession: CloudSession = { id: 'phone', name: 'Phone', cubeType: '4x4', updatedAt: 5 }
    const merged = mergeCloudState({
      localSessions: createDefaultSessions(),
      remoteSessions: [remoteSession],
      remoteSolves: [cloudSolve({ id: 'phone-solve', sessionId: 'phone' })],
      pendingDeletions: [],
      importSessions: [session({ solves: [solve({ id: 'guest' })] })]
    })

    assert.deepEqual(merged.sessions.map(item => item.id), ['phone'])
    assert.equal(merged.sessions[0].solves[0].id, 'phone-solve')
  })
})

describe('device changes after sign-out', () => {
  it('uploads a solve added while signed out and records one deleted while signed out', () => {
    const applied = applyDeviceChanges({
      accountSessions: [session({
        solves: [
          solve({ id: 'kept', createdAt: 10, updatedAt: 10 }),
          solve({ id: 'removed', createdAt: 11, updatedAt: 11 })
        ]
      })],
      deviceSessions: [session({
        solves: [
          solve({ id: 'kept', createdAt: 10, updatedAt: 10 }),
          solve({ id: 'added', createdAt: 40, updatedAt: 40 })
        ]
      })],
      signedOutSolveIds: ['kept', 'removed']
    })

    assert.deepEqual(applied.deletedIds, ['removed'])
    assert.deepEqual(applied.sessions[0].solves.map(item => item.id), ['kept', 'added'])
  })
})

describe('cloud push', () => {
  it('writes changed solves and only the solves deleted on this device', () => {
    const local = solve({ comment: 'edited', updatedAt: 1_700_000_000_050 })
    const plan = buildPushPlan({
      sessions: [session({ solves: [local, solve({ id: 'unchanged' }), solve({ id: 'still-here' })] })],
      ackedSolves: [
        cloudSolve({ comment: '', updatedAt: 1_700_000_000_000 }),
        cloudSolve({ id: 'unchanged' })
      ],
      ackedSessions: [{ id: '1', name: 'Session 1', cubeType: '3x3', updatedAt: 0 }],
      pendingDeletions: [{ id: 'gone', deletedAt: 60 }, { id: 'still-here', deletedAt: 60 }],
      now: 70
    })

    assert.deepEqual(plan.solves.map(item => item.id), ['solve-1'])
    assert.deepEqual(plan.deletions, [{ id: 'gone', deletedAt: 60 }])
    assert.equal(plan.sessions.length, 0)
  })
})
