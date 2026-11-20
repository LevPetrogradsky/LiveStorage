import { neon } from '@neondatabase/serverless'
import type { CloudItem, CloudOperation } from '../src/journal/cloud-model.ts'
import type { JournalStore } from './journal-handler.ts'

export function createJournalStore(connectionString: string): JournalStore {
  const sql = neon(connectionString)
  return {
    async guestExists(ownerId) {
      const rows = await sql`SELECT 1 FROM lifeos_journal_guest_vaults WHERE owner_id = ${ownerId} LIMIT 1`
      return rows.length > 0
    },
    async createGuest(ownerId) {
      await sql`INSERT INTO lifeos_journal_guest_vaults (owner_id) VALUES (${ownerId}) ON CONFLICT DO NOTHING`
    },
    async list(userId, after) {
      const kind = after?.[0] ?? ''
      const id = after?.[1] ?? ''
      const rows = await sql`
        SELECT kind, id, payload, deleted
        FROM lifeos_journal_items
        WHERE user_id = ${userId} AND (kind, id) > (${kind}, ${id})
        ORDER BY kind, id
        LIMIT 2
      `
      const items = rows.slice(0, 1).map(row => ({
        kind: row.kind, id: row.id, payload: row.payload, deleted: row.deleted,
      })) as CloudItem[]
      const last = items.at(-1)
      return { items, next: rows.length > 1 && last ? [last.kind, last.id] as [string, string] : null }
    },
    async write(userId, operation: CloudOperation) {
      const payload = operation.deleted ? null : JSON.stringify(operation.payload)
      if (operation.kind === 'entry' && !operation.deleted && operation.payload?.folderId) {
        const folders = await sql`
          SELECT 1 FROM lifeos_journal_items
          WHERE user_id = ${userId} AND kind = 'folder'
            AND id = ${operation.payload.folderId} AND NOT deleted
          LIMIT 1
        `
        if (!folders.length) throw new Error('Folder missing')
      }
      if (operation.mode === 'import') {
        const inserted = await sql`
          INSERT INTO lifeos_journal_items (user_id, kind, id, payload, deleted)
          VALUES (${userId}, ${operation.kind}, ${operation.id}, ${payload}::jsonb, false)
          ON CONFLICT (user_id, kind, id) DO NOTHING
          RETURNING id
        `
        if (!inserted.length) {
          const identical = await sql`
            SELECT 1 FROM lifeos_journal_items
            WHERE user_id = ${userId} AND kind = ${operation.kind} AND id = ${operation.id}
              AND NOT deleted AND payload = ${payload}::jsonb
            LIMIT 1
          `
          if (!identical.length) throw new Error('Journal conflict')
        }
        return
      }
      if (operation.previous === undefined) throw new Error('Journal conflict')
      const changed = operation.previous === null
        ? await sql`
          INSERT INTO lifeos_journal_items (user_id, kind, id, payload, deleted)
          VALUES (${userId}, ${operation.kind}, ${operation.id}, ${payload}::jsonb, ${operation.deleted})
          ON CONFLICT (user_id, kind, id) DO NOTHING
          RETURNING id
        `
        : await sql`
          UPDATE lifeos_journal_items SET payload = ${payload}::jsonb, deleted = ${operation.deleted}, changed_at = now()
          WHERE user_id = ${userId} AND kind = ${operation.kind} AND id = ${operation.id}
            AND NOT deleted AND payload = ${JSON.stringify(operation.previous)}::jsonb
          RETURNING id
        `
      if (!changed.length) throw new Error('Journal conflict')
      if (operation.kind === 'folder' && operation.deleted) {
        await sql`
          UPDATE lifeos_journal_items SET payload = payload - 'folderId', changed_at = now()
          WHERE user_id = ${userId} AND kind = 'entry' AND NOT deleted
            AND payload->>'folderId' = ${operation.id}
        `
      }
    },
  }
}
