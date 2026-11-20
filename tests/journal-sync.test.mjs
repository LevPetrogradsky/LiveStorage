import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData, focusedDuration, loadData, parseBackup, restoreBackup, saveData, STORAGE_KEY } from '../src/data.ts'
import { JournalCloudSync, withJournalChanges } from '../src/journal/cloud-sync.ts'
import { clearJournalDraft, readJournalDraft, readOpenJournalEditor, writeJournalDraft, writeOpenJournalEditor } from '../src/journal/drafts.ts'
import { createJournalHandler } from '../server/journal-handler.ts'
import { approximateLocation, locationLabel, requestApproximateLocation, validApproximateLocation } from '../src/journal/location.ts'
import { journalDate, journalTime, groupJournalEntries } from '../src/journal/timeline.ts'

const entry = (id, text, folderId) => ({ id, text, createdAt: '2026-11-16T10:00:00.000Z', ...(folderId ? { folderId } : {}) })
const folder = { id: 'gym', name: 'Gym' }
const photo = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(
  255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0,
  255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 27, 255, 217,
))

function harness() {
  const rows = new Map()
  const guests = new Set()
  const store = {
    async guestExists(ownerId) { return guests.has(ownerId) },
    async createGuest(ownerId) { guests.add(ownerId) },
    async list(userId, after) {
      const items = [...rows.values()].filter(row => row.userId === userId)
        .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))
        .filter(row => !after || `${row.kind}:${row.id}` > `${after[0]}:${after[1]}`)
        .map(({ userId: _userId, ...row }) => row)
      return { items, next: null }
    },
    async write(userId, operation) {
      const key = `${userId}:${operation.kind}:${operation.id}`
      if (operation.mode === 'import' && rows.has(key)) return
      const previous = rows.get(key)
      if (operation.mode === 'change' && (operation.previous === undefined ||
        (operation.previous === null ? Boolean(previous) : !previous || previous.deleted || JSON.stringify(previous.payload) !== JSON.stringify(operation.previous)))) {
        throw new Error('Journal conflict')
      }
      rows.set(key, { userId, kind: operation.kind, id: operation.id, deleted: operation.deleted, payload: operation.payload })
    },
  }
  const handler = createJournalHandler(async token => token === 'A' || token === 'B' ? token : null, store, () => true)
  const oldFetch = globalThis.fetch
  globalThis.fetch = (url, options = {}) => handler(new Request(`https://test.local${url}`, options))
  const client = (userId, initial = emptyData()) => {
    let data = structuredClone(initial)
    const statuses = []
    return {
      getData: () => data,
      save: next => { data = structuredClone(next); return true },
      token: async () => userId,
      status: message => statuses.push(message),
      statuses,
    }
  }
  return { rows, guests, client, restore: () => { globalThis.fetch = oldFetch } }
}

test('same account migrates folders and entries once and opens them in another browser', async () => {
  const h = harness()
  try {
    const first = h.client('A', { ...emptyData(), journalFolders: [folder], journal: [entry('one', 'Synthetic', 'gym')] })
    const sync = new JournalCloudSync(first)
    await sync.sync()
    assert.equal(first.getData().journalCloud.migrated, true)
    assert.equal(first.statuses.at(-1), 'Journal saved in cloud.')
    assert.equal(h.rows.size, 2)
    await sync.sync()
    assert.equal(h.rows.size, 2)

    const second = h.client('A')
    await new JournalCloudSync(second).sync()
    assert.deepEqual(second.getData().journal, first.getData().journal)
    assert.deepEqual(second.getData().journalFolders, [{ ...folder, order: 0 }])

    const changed = withJournalChanges(second.getData(), { ...second.getData(), journal: [entry('one', 'Edited', 'gym'), entry('two', 'New')] })
    second.save(changed)
    await new JournalCloudSync(second).sync()
    await sync.sync()
    assert.deepEqual(first.getData().journal.map(item => item.text).sort(), ['Edited', 'New'])

    second.save(withJournalChanges(second.getData(), { ...second.getData(), journal: [entry('two', 'New')], journalFolders: [] }))
    await new JournalCloudSync(second).sync()
    await sync.sync()
    assert.deepEqual(first.getData().journal.map(item => item.id), ['two'])
    assert.deepEqual(first.getData().journalFolders, [])
  } finally { h.restore() }
})

test('server uses verified account identity and keeps accounts isolated', async () => {
  const h = harness()
  try {
    const a = h.client('A', { ...emptyData(), journal: [entry('private', 'A only')] })
    await new JournalCloudSync(a).sync()
    const b = h.client('B')
    await new JournalCloudSync(b).sync()
    assert.deepEqual(b.getData().journal, [])
    assert.equal(h.rows.get('B:entry:private'), undefined)
    const unauthorized = await fetch('/api/journal', { headers: { Authorization: 'Bearer fake' } })
    assert.equal(unauthorized.status, 401)
  } finally { h.restore() }
})

test('two guest recovery codes restore only their own notes without an account', async () => {
  const h = harness()
  const codeA = 'a'.repeat(64)
  const codeB = 'b'.repeat(64)
  try {
    const missing = await fetch('/api/journal?guest=status', { headers: { Authorization: `Guest ${codeA}` } })
    assert.equal(missing.status, 404)
    for (const code of [codeA, codeB]) {
      const created = await fetch('/api/journal?guest=create', { method: 'POST', headers: { Authorization: `Guest ${code}` } })
      assert.equal(created.status, 201)
    }
    const a = h.client(`Guest ${codeA}`, { ...emptyData(), journal: [entry('private', 'Guest A')] })
    const b = h.client(`Guest ${codeB}`, { ...emptyData(), journal: [entry('private', 'Guest B')] })
    await new JournalCloudSync(a).sync()
    await new JournalCloudSync(b).sync()
    const restoredA = h.client(`Guest ${codeA}`)
    const restoredB = h.client(`Guest ${codeB}`)
    await new JournalCloudSync(restoredA).sync()
    await new JournalCloudSync(restoredB).sync()
    assert.deepEqual(restoredA.getData().journal.map(item => item.text), ['Guest A'])
    assert.deepEqual(restoredB.getData().journal.map(item => item.text), ['Guest B'])
    const unknown = await fetch('/api/journal', { headers: { Authorization: `Guest ${'c'.repeat(64)}` } })
    assert.equal(unknown.status, 404)
    assert.equal((await fetch('/api/journal')).status, 401)
  } finally { h.restore() }
})

test('cloud restore keeps the original creation device after edits', async () => {
  const h = harness()
  try {
    const original = { ...entry('device', 'Original'), createdOn: 'iphone' }
    const first = h.client('A', { ...emptyData(), journal: [original] })
    await new JournalCloudSync(first).sync()
    first.save(withJournalChanges(first.getData(), { ...first.getData(), journal: [{ ...original, text: 'Edited on another device', updatedAt: new Date().toISOString() }] }))
    await new JournalCloudSync(first).sync()
    const second = h.client('A')
    await new JournalCloudSync(second).sync()
    assert.equal(second.getData().journal[0].createdOn, 'iphone')
    assert.equal(second.getData().journal[0].text, 'Edited on another device')
  } finally { h.restore() }
})

test('recovery merge preserves different local and remote entries sharing an id', async () => {
  const h = harness()
  const code = 'd'.repeat(64)
  try {
    await fetch('/api/journal?guest=create', { method: 'POST', headers: { Authorization: `Guest ${code}` } })
    const original = h.client(`Guest ${code}`, { ...emptyData(), journal: [entry('same', 'Remote note')] })
    await new JournalCloudSync(original).sync()
    const recovering = h.client(`Guest ${code}`, { ...emptyData(), journal: [entry('same', 'Local note')] })
    await new JournalCloudSync(recovering).sync()
    assert.deepEqual(recovering.getData().journal.map(item => item.text).sort(), ['Local note', 'Remote note'])
    assert.equal(new Set(recovering.getData().journal.map(item => item.id)).size, 2)
  } finally { h.restore() }
})

test('stale device cannot overwrite another device and keeps its local edit', async () => {
  const h = harness()
  try {
    const first = h.client('A', { ...emptyData(), journal: [entry('same', 'Original')] })
    await new JournalCloudSync(first).sync()
    const second = h.client('A')
    await new JournalCloudSync(second).sync()
    first.save(withJournalChanges(first.getData(), { ...first.getData(), journal: [entry('same', 'First edit')] }))
    await new JournalCloudSync(first).sync()
    second.save(withJournalChanges(second.getData(), { ...second.getData(), journal: [entry('same', 'Second edit')] }))
    await new JournalCloudSync(second).sync()
    assert.match(second.statuses.at(-1), /another device/)
    assert.equal(second.getData().journal[0].text, 'Second edit')
    assert.equal(h.rows.get('A:entry:same').payload.text, 'First edit')
  } finally { h.restore() }
})

test('migration keeps attached photos and folder order', async () => {
  const h = harness()
  try {
    const first = h.client('A', {
      ...emptyData(),
      journalFolders: [{ id: 'work', name: 'Work' }, folder],
      journal: [{ ...entry('photo', 'Gym photo', 'gym'), photo }],
    })
    await new JournalCloudSync(first).sync()
    const second = h.client('A')
    await new JournalCloudSync(second).sync()
    assert.equal(second.getData().journal[0].photo, photo)
    assert.deepEqual(second.getData().journalFolders.map(item => item.name), ['Work', 'Gym'])
    second.save(withJournalChanges(second.getData(), {
      ...second.getData(), journalFolders: [...second.getData().journalFolders].reverse(),
    }))
    await new JournalCloudSync(second).sync()
    await new JournalCloudSync(first).sync()
    assert.deepEqual(first.getData().journalFolders.map(item => item.name), ['Gym', 'Work'])
  } finally { h.restore() }
})

test('network failure and an empty server answer never erase local Journal', async () => {
  const h = harness()
  const originalFetch = globalThis.fetch
  try {
    const local = h.client('A', { ...emptyData(), journal: [entry('safe', 'Keep me')] })
    globalThis.fetch = async () => { throw new Error('Offline') }
    await new JournalCloudSync(local).sync()
    assert.equal(local.getData().journal[0].text, 'Keep me')
    assert.equal(local.getData().journalCloud, undefined)
    globalThis.fetch = originalFetch
    await new JournalCloudSync(local).sync()
    assert.equal(local.getData().journal.length, 1)
    globalThis.fetch = async (url, options) => url.includes('?') || options?.method === 'POST'
      ? originalFetch(url, options)
      : Response.json({ items: [], after: null })
    await new JournalCloudSync(local).sync()
    assert.equal(local.getData().journal[0].text, 'Keep me')
    assert.match(local.statuses.at(-1), /empty data/)
  } finally { h.restore() }
})

test('guest Journal is copied only by explicit import and remains on this device', async () => {
  const h = harness()
  const oldStorage = globalThis.localStorage
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  try {
    const guest = { ...emptyData(), journalFolders: [folder], journal: [entry('guest', 'Private guest note', 'gym')] }
    saveData(guest)
    const account = h.client('A')
    const sync = new JournalCloudSync(account)
    await sync.sync()
    assert.deepEqual(account.getData().journal, [])
    await sync.importGuest()
    assert.equal(account.getData().journal[0].id, 'guest')
    assert.deepEqual(loadData().data.journal, guest.journal)
    await sync.importGuest()
    assert.equal(h.rows.size, 2)
  } finally { globalThis.localStorage = oldStorage; h.restore() }
})

test('drafts survive reload and remain separate for guest and each account', () => {
  const oldStorage = globalThis.localStorage
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  try {
    const accountA = `${STORAGE_KEY}.neon.A`
    const accountB = `${STORAGE_KEY}.neon.B`
    assert.equal(writeJournalDraft({ text: 'Guest draft' }), true)
    assert.equal(writeJournalDraft({ text: 'Account A edit' }, accountA, 'entry-1'), true)
    assert.deepEqual(readJournalDraft(), { text: 'Guest draft' })
    assert.deepEqual(readJournalDraft(accountA, 'entry-1'), { text: 'Account A edit' })
    assert.equal(readJournalDraft(accountB, 'entry-1'), null)
    assert.equal(writeOpenJournalEditor('entry-1', accountA), true)
    assert.equal(readOpenJournalEditor(accountA), 'entry-1')
    assert.equal(readOpenJournalEditor(accountB), null)
    assert.equal(writeOpenJournalEditor(null, accountA), true)
    assert.equal(readOpenJournalEditor(accountA), null)
    assert.equal(clearJournalDraft(accountA, 'entry-1'), true)
    assert.equal(readJournalDraft(accountA, 'entry-1'), null)
    assert.deepEqual(readJournalDraft(), { text: 'Guest draft' })
  } finally { globalThis.localStorage = oldStorage }
})

test('pending account changes survive reload while exported backups omit sync state', () => {
  const oldStorage = globalThis.localStorage
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  try {
    const key = `${STORAGE_KEY}.neon.A`
    const before = emptyData()
    const next = withJournalChanges(before, { ...before, journal: [entry('pending', 'Offline entry')] })
    assert.equal(saveData(next, key), true)
    assert.equal(loadData(key).data.journalCloud.pending.length, 1)
    assert.equal(parseBackup(JSON.stringify(next)).journalCloud, undefined)
  } finally { globalThis.localStorage = oldStorage }
})

test('restoring a backup queues Journal deletions for the signed-in account', async () => {
  const oldStorage = globalThis.localStorage
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  try {
    const key = `${STORAGE_KEY}.neon.A`
    const current = { ...emptyData(), journal: [entry('remove', 'Old')], journalCloud: { version: 1, migrated: true, pending: [] } }
    saveData(current, key)
    const restored = await restoreBackup(JSON.stringify(emptyData()), current, localStorage, () => true, key,
      next => withJournalChanges(current, { ...next, journalCloud: current.journalCloud }))
    assert.equal(restored.journalCloud.pending[0].id, 'remove')
    assert.equal(restored.journalCloud.pending[0].deleted, true)
    assert.equal(loadData(key).data.journalCloud.pending[0].id, 'remove')
  } finally { globalThis.localStorage = oldStorage }
})

test('focus duration uses wall clock after background time and excludes pauses', () => {
  const session = { startedAt: '2026-11-16T10:00:00.000Z', pausedDurationMs: 30_000 }
  assert.equal(focusedDuration(session, Date.parse('2026-11-16T10:05:00.000Z')), 270_000)
  assert.equal(focusedDuration({ ...session, pausedAt: '2026-11-16T10:02:00.000Z' }, Date.parse('2026-11-16T10:10:00.000Z')), 90_000)
  const secondPause = { startedAt: session.startedAt, pausedAt: '2026-11-16T10:07:00.000Z', pausedDurationMs: 120_000 }
  assert.equal(focusedDuration(secondPause, Date.parse('2026-11-16T10:20:00.000Z')), 300_000)
  assert.equal(focusedDuration(structuredClone(secondPause), Date.parse('2026-11-17T10:00:00.000Z')), 300_000)
})

test('approximate location rounds on device and validates backups without exact coordinates', () => {
  const location = approximateLocation(32.0868, 34.7812)
  assert.deepEqual(location, { latitude: 32.1, longitude: 34.8 })
  assert.equal(locationLabel(location, 'en'), 'Approx. 32.1°N, 34.8°E')
  assert.equal(locationLabel(location, 'ru'), 'Примерно 32.1°N, 34.8°E')
  assert.equal(validApproximateLocation(location), true)
  assert.equal(validApproximateLocation({ latitude: 32.0868, longitude: 34.7812 }), false)
  const backup = { ...emptyData(), journal: [{ ...entry('nearby', 'A note'), location }] }
  assert.deepEqual(parseBackup(JSON.stringify(backup)).journal[0].location, location)
})

test('location request handles permission granted and denied without saving exact coordinates', async () => {
  let requests = 0
  const granted = {
    getCurrentPosition(success, _error, options) {
      requests++
      assert.equal(options.enableHighAccuracy, false)
      success({ coords: { latitude: 32.0868, longitude: 34.7812 } })
    },
  }
  assert.equal(requests, 0)
  assert.deepEqual(await requestApproximateLocation(granted), { latitude: 32.1, longitude: 34.8 })
  const denied = { getCurrentPosition(_success, error) { error(new Error('Permission denied')) } }
  await assert.rejects(requestApproximateLocation(denied), /Permission denied/)
})

test('Journal dates include year and language; 12/24 affects clock time only', () => {
  const date = new Date(2026, 10, 15, 21, 7).toISOString()
  assert.match(journalDate(date, 'en'), /2026/)
  assert.match(journalDate(date, 'ru'), /2026/)
  assert.notEqual(journalTime(date, 'en', '12'), journalTime(date, 'en', '24'))
  assert.match(journalTime(date, 'en', '24'), /21:07/)
  const groups = groupJournalEntries([entry('older', 'Old')], '', new Date(2026, 10, 20), 'ru')
  assert.match(groups[0].label, /2026/)
})
