import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData, validateLiveOSData } from '../src/data.ts'
import { applyFocusPreset, focusPresets, focusPresetCopy } from '../src/presets/focusPresets.ts'

test('all four focus presets are available with distinct identifiers', () => {
  assert.deepEqual(focusPresets.map(preset => preset.label), [
    'Work', 'Creativity', 'Grounding', 'Bible reading',
  ])
  assert.deepEqual(focusPresets.map(preset => focusPresetCopy(preset.id, 'ru').label), ['Работа', 'Творчество', 'Заземление', 'Чтение Библии'])
  assert.equal(focusPresetCopy('grounding', 'ru').description, 'Сделай короткую паузу и обрати внимание на себя.')
  assert.equal(new Set(focusPresets.map(preset => preset.id)).size, 4)
})

test('applying a preset saves existing focus settings without changing the check-in choice', () => {
  const data = emptyData()
  data.focusCheckinEnabled = false
  data.activeSession = {
    id: 'active-1',
    taskId: null,
    taskTitle: 'Open focus',
    startedAt: '2026-11-14T09:00:00.000Z',
    pausedDurationMs: 5000,
  }

  const next = applyFocusPreset(data, 'creativity')
  assert.equal(next.focusPresetId, 'creativity')
  assert.equal(next.breakReminderMinutes, 0)
  assert.equal(next.activeSession?.silenceBreakReminders, true)
  assert.equal(next.activeSession?.id, 'active-1')
  assert.equal(next.activeSession?.pausedDurationMs, 5000)
  assert.equal(next.focusCheckinEnabled, false)
  assert.equal(validateLiveOSData(JSON.parse(JSON.stringify(next))), true)
})
