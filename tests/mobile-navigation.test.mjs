import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileNavigationLayout } from '../src/mobile-navigation.ts'

test('visible navigation buttons use the requested row counts', () => {
  for (const count of [1, 2, 3, 4, 5]) assert.deepEqual(mobileNavigationLayout(count), { columns: count, rows: 1 })
  assert.deepEqual(mobileNavigationLayout(6), { columns: 3, rows: 2 })
  assert.deepEqual(mobileNavigationLayout(7), { columns: 4, rows: 2 })
  assert.deepEqual(mobileNavigationLayout(8), { columns: 4, rows: 2 })
})
