import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData, parseBackup, validateLiveOSData } from '../src/data.ts'
import { groupJournalEntries } from '../src/journal/timeline.ts'
import { detectJournalDevice } from '../src/journal/device.ts'

const entry = (id, text, date) => ({ id, text, createdAt: date.toISOString() })
const photoPrefix = 'data:image/jpeg;base64,'

function jpegHeaders(width) {
  return photoPrefix + btoa(String.fromCharCode(
    255, 216,
    255, 192, 0, 11, 8, 0, 1, width >> 8, width & 255, 1, 1, 17, 0,
    255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 27,
    255, 217,
  ))
}

test('version 1 journal backups still restore entries with no photo or edit timestamp', () => {
  const backup = emptyData()
  backup.journal.push(entry('legacy', 'An earlier entry', new Date(2026, 10, 10, 19)))
  assert.deepEqual(parseBackup(JSON.stringify(backup)).journal, backup.journal)
})

test('creation device survives backup while legacy entries stay unlabeled', () => {
  const backup = emptyData()
  backup.journal.push({ ...entry('new', 'From phone', new Date()), createdOn: 'iphone' })
  backup.journal.push(entry('old', 'Before device labels', new Date()))
  const restored = parseBackup(JSON.stringify(backup))
  assert.equal(restored.journal[0].createdOn, 'iphone')
  assert.equal(restored.journal[1].createdOn, undefined)
  backup.journal[0].createdOn = 'made-up-device'
  assert.equal(validateLiveOSData(backup), false)
})

test('device detection uses only broad browser platform signals', () => {
  assert.equal(detectJournalDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' }), 'iphone')
  assert.equal(detectJournalDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' }), 'android')
  assert.equal(detectJournalDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 'windows')
  assert.equal(detectJournalDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ipad')
  assert.equal(detectJournalDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 0 }), 'mac')
  assert.equal(detectJournalDevice({ userAgent: 'Mozilla/5.0' }), 'unknown')
})

test('linked Journal notes survive backup even if the original was deleted', () => {
  const backup = emptyData()
  backup.journal.push({ ...entry('linked', 'A related thought', new Date(2026, 10, 17, 12)), linkedEntryId: 'deleted-original' })
  assert.deepEqual(parseBackup(JSON.stringify(backup)).journal, backup.journal)
  backup.journal[0].linkedEntryId = 'linked'
  assert.equal(validateLiveOSData(backup), false)
})

test('journal backups reject external, malformed, and oversized photo data', () => {
  const backup = emptyData()
  const saved = entry('photo', 'With a photo', new Date(2026, 10, 12, 17))

  for (const photo of [
    'https://example.com/remote.jpg',
    'data:image/svg+xml;base64,PHN2Zz4=',
    photoPrefix + btoa('not a JPEG'),
    photoPrefix + 'A'.repeat(240_004),
    jpegHeaders(961),
  ]) {
    backup.journal = [{ ...saved, photo }]
    assert.equal(validateLiveOSData(backup), false, photo.slice(0, 70))
  }

  backup.journal = [{ ...saved, updatedAt: 'not a timestamp' }]
  assert.equal(validateLiveOSData(backup), false)
})

test('timeline groups by local calendar day, sorts newest first and searches text or dates', () => {
  const now = new Date(2026, 10, 12, 0, 1)
  const latest = entry('latest', 'Evening plans', new Date(2026, 10, 12, 0, 1))
  const previous = entry('previous', 'A walk at sunset', new Date(2026, 10, 11, 23, 58))
  const earlier = entry('earlier', 'Another walk', new Date(2026, 10, 11, 9))
  const older = entry('older', 'Reading', new Date(2026, 10, 8, 16))
  const entries = [earlier, older, latest, previous]

  const groups = groupJournalEntries(entries, '', now)
  assert.deepEqual(groups.map(group => group.label), ['Today', 'Yesterday', 'November 8, 2026'])
  assert.deepEqual(groups[1].entries.map(item => item.id), ['previous', 'earlier'])
  assert.deepEqual(groupJournalEntries(entries, ' WALK ', now)[0].entries.map(item => item.id), ['previous', 'earlier'])
  assert.deepEqual(groupJournalEntries(entries, 'November 8', now)[0].entries.map(item => item.id), ['older'])
  assert.deepEqual(groupJournalEntries(entries, 'no match', now), [])
})

test('journal backups preserve folders and reject invalid folder references', () => {
  const backup = {
    ...emptyData(),
    journalFolders: [{ id: 'work', name: 'Work' }],
    journal: [
      entry('legacy', 'Earlier entry', new Date(2026, 10, 10, 19)),
      { ...entry('filed', 'Filed entry', new Date(2026, 10, 11, 19)), folderId: 'work' },
    ],
  }
  assert.deepEqual(parseBackup(JSON.stringify(backup)), backup)
  const styledFolder = { ...backup.journalFolders[0], color: 'purple', icon: 'book' }
  const styledBackup = { ...backup, journalFolders: [styledFolder] }
  assert.deepEqual(parseBackup(JSON.stringify(styledBackup)), styledBackup)
  assert.equal(validateLiveOSData({ ...backup, journalFolders: [{ ...styledFolder, color: '#fff' }] }), false)
  assert.equal(validateLiveOSData({ ...backup, journalFolders: [{ ...styledFolder, icon: 'unknown' }] }), false)
  assert.equal(validateLiveOSData({ ...backup, journalFolders: [] }), false)
  assert.equal(validateLiveOSData({ ...backup, journalFolders: [...backup.journalFolders, { id: 'other', name: 'work' }] }), false)
})
