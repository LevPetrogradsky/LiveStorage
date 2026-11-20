import type { BreakReminderMinutes, LiveOSData } from '../data'

export type FocusPresetId = 'work' | 'creativity' | 'grounding' | 'bible-reading'

export interface FocusPreset {
  id: FocusPresetId
  label: string
  description: string
  reminderMinutes: BreakReminderMinutes
  silenceBreakReminders: boolean
}

export const focusPresets: readonly FocusPreset[] = [
  {
    id: 'work',
    label: 'Work',
    description: 'Focus on one task.',
    reminderMinutes: 20,
    silenceBreakReminders: false,
  },
  {
    id: 'creativity',
    label: 'Creativity',
    description: 'Leave more room for ideas.',
    reminderMinutes: 0,
    silenceBreakReminders: true,
  },
  {
    id: 'grounding',
    label: 'Grounding',
    description: 'Take a short pause and check in with yourself.',
    reminderMinutes: 5,
    silenceBreakReminders: false,
  },
  {
    id: 'bible-reading',
    label: 'Bible reading',
    description: 'Make time for quiet, attentive reading.',
    reminderMinutes: 15,
    silenceBreakReminders: false,
  },
]

const russianPresetCopy: Record<FocusPresetId, Pick<FocusPreset, 'label' | 'description'>> = {
  work: { label: 'Работа', description: 'Сосредоточься на одной задаче.' },
  creativity: { label: 'Творчество', description: 'Оставь больше пространства для идей.' },
  grounding: { label: 'Заземление', description: 'Сделай короткую паузу и обрати внимание на себя.' },
  'bible-reading': { label: 'Чтение Библии', description: 'Выдели время на спокойное, внимательное чтение.' },
}

export function focusPresetCopy(id: FocusPresetId, language: 'en' | 'ru' = 'en') {
  return language === 'ru' ? russianPresetCopy[id] : findFocusPreset(id)!
}

export function findFocusPreset(id: FocusPresetId | undefined): FocusPreset | undefined {
  return focusPresets.find(preset => preset.id === id)
}

export function applyFocusPreset(data: LiveOSData, id: FocusPresetId): LiveOSData & { focusPresetId: FocusPresetId } {
  const preset = findFocusPreset(id)
  if (!preset) throw new Error('Unknown focus preset')

  return {
    ...data,
    focusPresetId: id,
    breakReminderMinutes: preset.reminderMinutes,
    activeSession: data.activeSession
      ? { ...data.activeSession, silenceBreakReminders: preset.silenceBreakReminders }
      : null,
  }
}
