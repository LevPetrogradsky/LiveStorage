import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/data.ts'
import { createJournalSnapshot, createTasksSnapshot, parseJournalSnapshot, parseTasksSnapshot } from '../src/module-snapshot.ts'

const createdAt = '2026-11-17T10:00:00.000Z'
const photo = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(
  255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0,
  255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 27, 255, 217,
))

test('separate Journal and Tasks copies keep content and stable cross-service IDs', () => {
  const data = {
    ...emptyData(),
    theme: 'dark',
    tasks: [{ id: 'task-1', title: 'Read', createdAt, completedAt: null, list: 'today' }],
    journalFolders: [{ id: 'folder-1', name: 'Ideas', order: 0, color: 'blue', icon: 'book' }],
    journal: [
      { id: 'note-1', text: 'First', createdAt, createdOn: 'iphone', folderId: 'folder-1', taskId: 'task-1', photo, location: { latitude: 32.1, longitude: 34.8 } },
      { id: 'note-2', text: 'Linked', createdAt, linkedEntryId: 'note-1' },
    ],
    journalCloud: { version: 1, migrated: true, pending: [] },
  }
  const journal = parseJournalSnapshot(JSON.stringify(createJournalSnapshot(data)))
  const tasks = parseTasksSnapshot(JSON.stringify(createTasksSnapshot(data)))
  assert.deepEqual(journal.entries, data.journal)
  assert.deepEqual(journal.folders, data.journalFolders)
  assert.deepEqual(tasks.tasks, data.tasks)
  assert.equal(journal.entries[0].taskId, tasks.tasks[0].id)
  assert.equal('journalCloud' in journal, false)
  assert.equal('theme' in journal, false)
  assert.equal('journal' in tasks, false)
})

test('module copies reject wrong formats, duplicate IDs, and broken folder references', () => {
  assert.throws(() => parseJournalSnapshot('{'), /valid JSON/)
  assert.throws(() => parseJournalSnapshot(JSON.stringify({ format: 'lifeos-journal', version: 1, entries: [], folders: [], token: 'secret' })), /unsupported format/)
  const entry = { id: 'one', text: 'A', createdAt }
  assert.throws(() => parseJournalSnapshot(JSON.stringify({ format: 'lifeos-journal', version: 1, entries: [entry, entry], folders: [] })), /invalid entries/)
  assert.throws(() => parseJournalSnapshot(JSON.stringify({ format: 'lifeos-journal', version: 1, entries: [{ ...entry, folderId: 'missing' }], folders: [] })), /invalid entries/)
  const task = { id: 'one', title: 'A', createdAt, completedAt: null }
  assert.throws(() => parseTasksSnapshot(JSON.stringify({ format: 'lifeos-tasks', version: 1, tasks: [task, task] })), /invalid tasks/)
})
