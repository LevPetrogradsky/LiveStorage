import { journalFolderColors, journalFolderIcons, maxJournalFolderNameLength, type JournalEntry, type JournalFolder } from '../data.ts'
import { isJournalPhoto } from './photo.ts'
import { journalDevices } from './device.ts'
import { validApproximateLocation } from './location.ts'

export type CloudKind = 'folder' | 'entry'
type CloudBase = {
  id: string
  deleted: boolean
}
export type CloudItem =
  | (CloudBase & { kind: 'folder'; payload: JournalFolder | null })
  | (CloudBase & { kind: 'entry'; payload: JournalEntry | null })
export type CloudOperation = CloudItem & { mode: 'import' | 'change'; previous?: JournalFolder | JournalEntry | null }

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 50 && Number.isFinite(Date.parse(value))

export function validCloudFolder(value: unknown): value is JournalFolder {
  return record(value) && id(value.id) && typeof value.name === 'string' &&
    value.name.length > 0 && value.name.length <= maxJournalFolderNameLength &&
    value.name === value.name.trim() &&
    (value.order === undefined || (typeof value.order === 'number' && Number.isSafeInteger(value.order) && value.order >= 0)) &&
    (value.color === undefined || journalFolderColors.some(color => color === value.color)) &&
    (value.icon === undefined || journalFolderIcons.some(icon => icon === value.icon))
}

export function validCloudEntry(value: unknown): value is JournalEntry {
  return record(value) && id(value.id) && typeof value.text === 'string' &&
    value.text.length <= 3_000_000 && timestamp(value.createdAt) &&
    (value.createdOn === undefined || journalDevices.some(device => device === value.createdOn)) &&
    (value.updatedAt === undefined || timestamp(value.updatedAt)) &&
    (value.photo === undefined || isJournalPhoto(value.photo)) &&
    (value.taskId === undefined || id(value.taskId)) &&
    (value.linkedEntryId === undefined || (id(value.linkedEntryId) && value.linkedEntryId !== value.id)) &&
    (value.location === undefined || validApproximateLocation(value.location)) &&
    (value.folderId === undefined || id(value.folderId))
}

export function validCloudItem(value: unknown): value is CloudItem {
  if (!record(value) || (value.kind !== 'folder' && value.kind !== 'entry') ||
    !id(value.id) || typeof value.deleted !== 'boolean') return false
  if (value.deleted) return value.payload === null
  return value.kind === 'folder'
    ? validCloudFolder(value.payload) && value.payload.id === value.id
    : validCloudEntry(value.payload) && value.payload.id === value.id
}

export function validCloudOperation(value: unknown): value is CloudOperation {
  if (!record(value)) return false
  const mode = value.mode
  const previous = value.previous
  return (mode === 'import' || mode === 'change') &&
    validCloudItem(value) && (mode !== 'import' || !value.deleted) &&
    (previous === undefined || previous === null ||
      (value.kind === 'folder' ? validCloudFolder(previous) : validCloudEntry(previous)))
}
