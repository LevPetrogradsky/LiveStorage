import { loadData, validateLiveOSData, type JournalEntry, type JournalFolder, type LiveOSData } from '../data.ts'
import { validCloudItem, validCloudOperation, type CloudItem, type CloudOperation } from './cloud-model.ts'

type Meta = NonNullable<LiveOSData['journalCloud']>
type Client = {
  getData: () => LiveOSData
  save: (data: LiveOSData) => boolean
  token: () => Promise<string | null>
  status: (text: string) => void
}

function meta(data: LiveOSData): Meta {
  const value = data.journalCloud
  if (value === undefined) return { version: 1, migrated: false, pending: [] }
  if (value.version !== 1 || typeof value.migrated !== 'boolean' ||
    !Array.isArray(value.pending) || !value.pending.every(validCloudOperation)) {
    throw new Error('Saved Journal sync state is unreadable. Your local Journal was kept.')
  }
  return value
}

function changes<T extends JournalFolder | JournalEntry>(kind: 'folder' | 'entry', before: T[], after: T[]): CloudOperation[] {
  const old = new Map(before.map(item => [item.id, item]))
  const next = new Map(after.map(item => [item.id, item]))
  const operations: CloudOperation[] = []
  for (const item of after) {
    if (JSON.stringify(old.get(item.id)) !== JSON.stringify(item)) {
      operations.push({ mode: 'change', kind, id: item.id, deleted: false, payload: item, previous: old.get(item.id) ?? null } as unknown as CloudOperation)
    }
  }
  for (const item of before) {
    if (!next.has(item.id)) operations.push({ mode: 'change', kind, id: item.id, deleted: true, payload: null, previous: item })
  }
  return operations
}

export function withJournalChanges(before: LiveOSData, after: LiveOSData): LiveOSData {
  const ordered = { ...after, journalFolders: (after.journalFolders ?? []).map((folder, order) => ({ ...folder, order })) }
  const pending = [
    ...changes('folder', before.journalFolders ?? [], ordered.journalFolders),
    ...changes('entry', before.journal, after.journal),
  ]
  if (!pending.length) return after
  const previous = meta(before)
  const replaced = previous.pending.filter(item => !pending.some(next => next.kind === item.kind && next.id === item.id))
  return { ...ordered, journalCloud: { version: 1, migrated: previous.migrated, pending: [...replaced, ...pending] } }
}

const priority = (item: CloudItem) =>
  item.kind === 'folder' ? (item.deleted ? 3 : 0) : (item.deleted ? 2 : 1)

function importOperations(data: LiveOSData): CloudOperation[] {
  return [
    ...(data.journalFolders ?? []).map((folder, order) => ({ mode: 'import', kind: 'folder', id: folder.id, deleted: false, payload: { ...folder, order } })),
    ...data.journal.map(payload => ({ mode: 'import', kind: 'entry', id: payload.id, deleted: false, payload })),
  ] as CloudOperation[]
}

export function preserveInitialJournal(data: LiveOSData, remote: CloudItem[]): LiveOSData {
  const existing = new Map(remote.map(item => [`${item.kind}:${item.id}`, item]))
  const remoteNames = new Set(remote.filter(item => item.kind === 'folder' && !item.deleted && item.payload)
    .map(item => (item.payload as JournalFolder).name.toLocaleLowerCase()))
  const folderIds = new Map<string, string>()
  const folders = (data.journalFolders ?? []).map((folder, order) => {
    const found = existing.get(`folder:${folder.id}`)
    const collision = found && (found.deleted || JSON.stringify(found.payload) !== JSON.stringify({ ...folder, order }))
    const id = collision ? crypto.randomUUID() : folder.id
    if (collision) folderIds.set(folder.id, id)
    let name = folder.name
    if (remoteNames.has(name.toLocaleLowerCase()) && (!found || collision)) {
      const base = name.slice(0, 45)
      let suffix = 1
      do { name = `${base} (local ${suffix++})` } while (remoteNames.has(name.toLocaleLowerCase()))
    }
    remoteNames.add(name.toLocaleLowerCase())
    return { ...folder, id, name }
  })
  const entryIds = new Map<string, string>()
  for (const entry of data.journal) {
    const found = existing.get(`entry:${entry.id}`)
    if (found && (found.deleted || JSON.stringify(found.payload) !== JSON.stringify(entry))) {
      entryIds.set(entry.id, crypto.randomUUID())
    }
  }
  const journal = data.journal.map(entry => ({
    ...entry,
    id: entryIds.get(entry.id) ?? entry.id,
    ...(entry.folderId && folderIds.has(entry.folderId) ? { folderId: folderIds.get(entry.folderId) } : {}),
    ...(entry.linkedEntryId && entryIds.has(entry.linkedEntryId) ? { linkedEntryId: entryIds.get(entry.linkedEntryId) } : {}),
  }))
  const result = { ...data, journalFolders: folders, journal }
  if (!validateLiveOSData(result)) throw new Error('Local Journal could not be merged safely. Your notes were kept.')
  return result
}

function applyItems(data: LiveOSData, items: CloudItem[]): LiveOSData {
  const byKey = new Map(items.map(item => [`${item.kind}:${item.id}`, item]))
  for (const item of meta(data).pending) byKey.set(`${item.kind}:${item.id}`, item)
  const folders = [...byKey.values()].filter((item): item is CloudItem & { kind: 'folder'; payload: JournalFolder } =>
    item.kind === 'folder' && !item.deleted && item.payload !== null).map(item => item.payload)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const entries = [...byKey.values()].filter((item): item is CloudItem & { kind: 'entry'; payload: JournalEntry } =>
    item.kind === 'entry' && !item.deleted && item.payload !== null).map(item => item.payload)
  const next = {
    ...data,
    journalFolders: folders,
    journal: entries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  }
  if (!validateLiveOSData(next)) throw new Error('Cloud Journal response is incomplete. Your local Journal was kept.')
  return next
}

export class JournalCloudSync {
  private running: Promise<boolean> | null = null
  private stopped = false
  private readonly client: Client
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.sync()
  }
  private readonly onOnline = () => { void this.sync() }

  constructor(client: Client) { this.client = client }

  start() {
    document.addEventListener('visibilitychange', this.onVisible)
    window.addEventListener('online', this.onOnline)
    void this.sync()
  }

  stop() {
    this.stopped = true
    document.removeEventListener('visibilitychange', this.onVisible)
    window.removeEventListener('online', this.onOnline)
  }

  sync() {
    if (this.stopped) return Promise.resolve(false)
    if (this.running) return this.running
    let again = false
    this.running = this.perform().then(() => {
      again = meta(this.client.getData()).pending.length > 0
      return true
    }).catch(error => {
      this.client.status(error instanceof Error ? error.message : 'Could not sync Journal. Your local copy was kept.')
      return false
    }).finally(() => {
      this.running = null
      if (again && !this.stopped) void this.sync()
    })
    return this.running
  }

  async importGuest() {
    if (!(await this.sync())) throw new Error('Account Journal must finish syncing before guest import. The guest copy was kept.')
    const guest = loadData()
    if (guest.error) throw new Error('Guest Journal is unreadable. Restore a backup first.')
    const token = await this.requireToken()
    const preserved = preserveInitialJournal(guest.data, await this.list(token))
    for (const operation of importOperations(preserved)) await this.send(token, operation)
    const items = await this.list(token)
    const current = this.client.getData()
    if (items.length === 0 && (guest.data.journal.length || guest.data.journalFolders?.length || current.journal.length)) {
      throw new Error('Cloud Journal returned empty data. Guest and account copies were kept.')
    }
    if (!this.client.save(applyItems(current, items))) throw new Error('Guest Journal reached the cloud, but the local view could not update. The guest copy was kept.')
  }

  private async requireToken() {
    const token = await this.client.token()
    if (!token) throw new Error('Journal cloud access is unavailable. Your local copy was kept.')
    return token
  }

  private async send(token: string, operation: CloudOperation) {
    if (!validCloudOperation(operation)) throw new Error('A local Journal item needs recovery before sync. It was kept.')
    const response = await fetch('/api/journal', {
      method: 'POST',
      headers: { Authorization: token.startsWith('Guest ') ? token : `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
      cache: 'no-store',
    })
    if (response.status === 409) throw new Error('Journal changed on another device. Both copies were kept; review this device before retrying.')
    if (!response.ok) throw new Error('Could not save Journal to the cloud. Your local copy was kept.')
  }

  private async list(token: string) {
    const items: CloudItem[] = []
    let after: string | null = null
    const seen = new Set<string>()
    for (let page = 0; page < 10_000; page++) {
      const url: string = after ? `/api/journal?after=${encodeURIComponent(after)}` : '/api/journal'
      const response = await fetch(url, { headers: { Authorization: token.startsWith('Guest ') ? token : `Bearer ${token}` }, cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load cloud Journal. Your local copy was kept.')
      const body: unknown = await response.json()
      if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items) ||
        !body.items.every(validCloudItem) || !('after' in body) ||
        (body.after !== null && typeof body.after !== 'string')) {
        throw new Error('Cloud Journal response is incomplete. Your local copy was kept.')
      }
      for (const item of body.items) {
        const key = `${item.kind}:${item.id}`
        if (seen.has(key)) throw new Error('Cloud Journal response repeated an item. Your local copy was kept.')
        seen.add(key)
        items.push(item)
      }
      if (body.after === null) return items
      if (body.after === after || !body.items.length) throw new Error('Cloud Journal response is incomplete. Your local copy was kept.')
      after = body.after
    }
    throw new Error('Cloud Journal has too many pages. Your local copy was kept.')
  }

  private async perform() {
    this.client.status('Syncing Journal…')
    const token = await this.requireToken()
    const original = this.client.getData()
    if (!meta(original).migrated) {
      const preserved = preserveInitialJournal(original, await this.list(token))
      preserved.journalCloud = { ...meta(original), pending: [] }
      if (!this.client.save(preserved)) throw new Error('Could not prepare local Journal for cloud merge. Your notes were kept.')
      for (const operation of importOperations(preserved)) await this.send(token, operation)
      const current = this.client.getData()
      if (!this.client.save({ ...current, journalCloud: { ...meta(current), migrated: true } })) {
        throw new Error('Could not mark Journal migration complete. Your local copy was kept.')
      }
    }
    while (!this.stopped) {
      const current = this.client.getData()
      const pending = [...meta(current).pending].sort((a, b) => priority(a) - priority(b))
      if (!pending.length) break
      const operation = pending[0]
      await this.send(token, operation)
      const latest = this.client.getData()
      const nextPending = meta(latest).pending.filter(item =>
        item.kind !== operation.kind || item.id !== operation.id || JSON.stringify(item) !== JSON.stringify(operation))
      if (!this.client.save({ ...latest, journalCloud: { ...meta(latest), pending: nextPending } })) {
        throw new Error('Could not confirm Journal sync locally. Your local copy was kept.')
      }
    }
    if (this.stopped) return
    const items = await this.list(token)
    const latest = this.client.getData()
    if (items.length === 0 && (latest.journal.length || latest.journalFolders?.length)) {
      throw new Error('Cloud Journal returned empty data. Your local copy was kept.')
    }
    if (!this.client.save(applyItems(latest, items))) {
      throw new Error('Could not save cloud Journal locally. Your local copy was kept.')
    }
    this.client.status('Journal saved in cloud.')
  }
}

export function guestJournalCount(account?: LiveOSData) {
  const guest = loadData()
  const existing = new Set(account?.journal.map(entry => entry.id))
  return guest.error ? 0 : guest.data.journal.filter(entry => !existing.has(entry.id)).length
}
