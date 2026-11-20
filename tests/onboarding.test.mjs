import assert from 'node:assert/strict'
import test from 'node:test'
import { completionKey, initialOnboardingMode } from '../src/onboarding/state.ts'

const storage = (values = {}) => ({ getItem: key => values[key] ?? null })

test('new users see onboarding while existing data and completed users do not', () => {
  assert.equal(initialOnboardingMode('lifeos.v1', storage()), 'first-run')
  assert.equal(initialOnboardingMode('lifeos.v1', storage({ 'lifeos.v1': '{old data}' })), null)
  assert.equal(initialOnboardingMode('lifeos.v1', storage({ [completionKey('lifeos.v1')]: 'done' })), null)
  assert.equal(initialOnboardingMode('lifeos.v1.neon.existing', storage(), '', true), null)
})

test('preview is available without replacing data and accounts have separate markers', () => {
  const accountKey = 'lifeos.v1.neon.example'
  assert.notEqual(completionKey(accountKey), completionKey('lifeos.v1'))
  assert.equal(initialOnboardingMode(accountKey, storage({ [accountKey]: '{old data}' }), '?onboarding=preview'), 'preview')
})
