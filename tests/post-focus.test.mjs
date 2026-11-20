import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyData, loadData, parseBackup, recordUnratedSession, shortcutVisible, timerView, validateLiveOSData } from '../src/data.ts'

test('new profiles show OS, Guide, Settings while old shortcut choices survive', () => {
  const fresh = emptyData()
  assert.equal(fresh.askLiveOSInBar, true)
  assert.equal(shortcutVisible(fresh, 'journal', 'bar'), false)
  assert.equal(shortcutVisible(fresh, 'tasks', 'bar'), false)
  assert.equal(shortcutVisible(fresh, 'focus', 'bar'), false)
  const legacy = { ...fresh, askLiveOSInBar: undefined, shortcutPreferences: undefined }
  assert.equal(shortcutVisible(legacy, 'journal', 'bar'), true)
  assert.equal(shortcutVisible(legacy, 'tasks', 'bar'), true)
  const existing = { ...legacy, shortcutPreferences: { journal: { bar: false }, focus: { bar: true } } }
  assert.equal(shortcutVisible(existing, 'journal', 'bar'), false)
  assert.equal(shortcutVisible(existing, 'tasks', 'bar'), true)
  assert.equal(shortcutVisible(existing, 'focus', 'bar'), true)
})

test('finished focus is saved once and its choices remain after reload', () => {
  const pendingSession = {
    id: 'finished', taskId: null, taskTitle: 'Work',
    startedAt: '2026-11-13T10:00:00.000Z',
    endedAt: '2026-11-13T10:01:00.000Z',
  }
  const saved = recordUnratedSession(emptyData(), pendingSession)
  assert.equal(saved.sessions.length, 1)
  const choosing = { ...saved, pendingSession, focusCheckinEnabled: false }
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(choosing) }
  try {
    const loaded = loadData().data
    assert.equal(loaded.pendingSession?.id, pendingSession.id)
    assert.equal(loaded.sessions.length, 1)
    assert.equal(recordUnratedSession(loaded, pendingSession).sessions.length, 1)
  } finally {
    globalThis.localStorage = previousStorage
  }
})

test('skipping post-focus clears the choice and keeps one saved session after reload', () => {
  const pendingSession = {
    id: 'skipped', taskId: null, taskTitle: 'Work',
    startedAt: '2026-11-13T10:00:00.000Z',
    endedAt: '2026-11-13T10:01:00.000Z',
  }
  const finished = { ...recordUnratedSession(emptyData(), pendingSession), pendingSession }
  const skipped = recordUnratedSession(finished, pendingSession)
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(skipped) }
  try {
    const loaded = loadData().data
    assert.equal(loaded.pendingSession, null)
    assert.equal(loaded.sessions.filter(session => session.id === pendingSession.id).length, 1)
  } finally {
    globalThis.localStorage = previousStorage
  }
})

test('older LiveOS Portable backups remain valid without post-focus or preset choices', () => {
  const legacy = emptyData()
  assert.equal(validateLiveOSData(legacy), true)
  assert.equal(parseBackup(JSON.stringify(legacy)).postFocusAction, undefined)
  assert.equal(parseBackup(JSON.stringify(legacy)).timerDefaultView, undefined)
  assert.equal(timerView(parseBackup(JSON.stringify(legacy))), 'compact')
})

test('compact timer preference survives reload and rejects unknown views', () => {
  assert.equal(timerView(emptyData()), 'compact')
  const compact = { ...emptyData(), timerDefaultView: 'compact' }
  assert.equal(validateLiveOSData(compact), true)
  assert.equal(parseBackup(JSON.stringify(compact)).timerDefaultView, 'compact')
  assert.equal(timerView(parseBackup(JSON.stringify({ ...compact, timerDefaultView: 'full' }))), 'full')
  assert.equal(validateLiveOSData({ ...compact, timerDefaultView: 'floating' }), false)
})

test('explicit post-focus and preset choices survive a backup round trip', () => {
  const data = { ...emptyData(), postFocusAction: 'reflection', focusPresetId: 'bible-reading' }
  assert.equal(validateLiveOSData(data), true)
  assert.deepEqual(parseBackup(JSON.stringify(data)), data)
  assert.equal(validateLiveOSData({ ...data, postFocusAction: 'unexpected' }), false)
  assert.equal(validateLiveOSData({ ...data, focusPresetId: 'unexpected' }), false)
})

test('a first pending session survives reload when legacy check-ins are off', () => {
  const pendingSession = {
    id: 'first', taskId: null, taskTitle: 'Open focus',
    startedAt: '2026-11-13T10:00:00.000Z',
    endedAt: '2026-11-13T10:01:00.000Z',
  }
  const data = { ...emptyData(), focusCheckinEnabled: false, pendingSession }
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const loaded = loadData().data
    assert.equal(loaded.pendingSession?.id, 'first')
    assert.equal(loaded.sessions.length, 0)
  } finally {
    globalThis.localStorage = previousStorage
  }
})

test('an established legacy user still auto-saves an unrated pending session', () => {
  const previous = {
    id: 'previous', taskId: null, taskTitle: 'Open focus',
    startedAt: '2026-11-13T09:00:00.000Z',
    endedAt: '2026-11-13T09:01:00.000Z',
    durationMs: 60_000,
    interest: null, continueDesire: null, progress: null, factors: [],
  }
  const pendingSession = {
    id: 'next', taskId: null, taskTitle: 'Open focus',
    startedAt: '2026-11-13T10:00:00.000Z',
    endedAt: '2026-11-13T10:01:00.000Z',
  }
  const data = { ...emptyData(), sessions: [previous], focusCheckinEnabled: false, pendingSession }
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const loaded = loadData().data
    assert.equal(loaded.pendingSession, null)
    assert.equal(loaded.sessions[0].id, 'next')
    assert.equal(loaded.sessions.length, 2)
  } finally {
    globalThis.localStorage = previousStorage
  }
})

test('an explicit check-in choice keeps its pending session after reload', () => {
  const pendingSession = {
    id: 'next', taskId: null, taskTitle: 'Open focus',
    startedAt: '2026-11-13T10:00:00.000Z',
    endedAt: '2026-11-13T10:01:00.000Z',
  }
  const data = { ...emptyData(), postFocusAction: 'check-in', focusCheckinEnabled: false, pendingSession }
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const loaded = loadData().data
    assert.equal(loaded.pendingSession?.id, 'next')
    assert.equal(loaded.sessions.length, 0)
  } finally {
    globalThis.localStorage = previousStorage
  }
})
