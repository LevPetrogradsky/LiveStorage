import type { JournalEntry } from '../data.ts'

export function journalTime(date: string, language: 'en' | 'ru' = 'en', format: '12' | '24' = '12'): string {
  return new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit', hour12: format === '12' }).format(new Date(date))
}

export function journalDate(date: string, language: 'en' | 'ru' = 'en'): string {
  return new Intl.DateTimeFormat(language, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

export function journalDayLabel(date: Date, now: Date, language: 'en' | 'ru' = 'en'): string {
  const day = date.toDateString()
  if (day === now.toDateString()) return language === 'ru' ? 'Сегодня' : 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return day === yesterday.toDateString() ? (language === 'ru' ? 'Вчера' : 'Yesterday') : journalDate(date.toISOString(), language)
}

export function groupJournalEntries(entries: JournalEntry[], search: string, now = new Date(), language: 'en' | 'ru' = 'en') {
  const query = search.trim().toLocaleLowerCase()
  const groups = new Map<string, { label: string; entries: JournalEntry[] }>()

  const sorted = [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  for (const entry of sorted) {
    const date = new Date(entry.createdAt)
    const key = date.toDateString()
    const label = journalDayLabel(date, now, language)
    const searchable = [entry.text, label, journalDate(entry.createdAt, language)].join(' ').toLocaleLowerCase()
    if (query && !searchable.includes(query)) continue

    let group = groups.get(key)
    if (!group) {
      group = { label, entries: [] }
      groups.set(key, group)
    }
    group.entries.push(entry)
  }

  return [...groups.entries()].map(([key, group]) => ({ key, ...group }))
}
