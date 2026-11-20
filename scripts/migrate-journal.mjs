import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const sql = neon(process.env.DATABASE_URL)
const schema = await readFile(new URL('../db/journal-sync.sql', import.meta.url), 'utf8')
for (const statement of schema.split(';').map(part => part.trim()).filter(Boolean)) {
  await sql.query(statement)
}
const rows = await sql`SELECT to_regclass('public.lifeos_journal_items') AS items,
  to_regclass('public.lifeos_journal_guest_vaults') AS guests`
if (!rows[0]?.items || !rows[0]?.guests) throw new Error('Journal tables were not created')
process.stdout.write('Journal tables are ready.\n')
