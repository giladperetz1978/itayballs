import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipWindow, crossesHoop, mergeShots, parseGeminiShots } from '../src/domain.ts'
import { encryptKey, decryptKey } from '../src/vault.ts'

test('clips contain three seconds either side, bounded by the recording', () => {
  assert.deepEqual(clipWindow(10, 60), { start: 7, end: 13 })
  assert.deepEqual(clipWindow(1, 60), { start: 0, end: 4 })
  assert.deepEqual(clipWindow(59, 60), { start: 56, end: 60 })
  assert.throws(() => clipWindow(NaN, 60))
  assert.throws(() => clipWindow(70, 60))
})

test('only a recent downward crossing inside the rim is a candidate', () => {
  const hoop = { x: 0.5, y: 0.3, width: 0.1 }
  const above = { x: 0.5, y: 0.27, time: 1, confidence: 0.9 }
  const below = { x: 0.51, y: 0.34, time: 1.2, confidence: 0.9 }
  assert.equal(crossesHoop(above, below, hoop), true)
  assert.equal(crossesHoop(below, { ...above, time: 1.4 }, hoop), false)
  assert.equal(crossesHoop(above, { ...below, time: 3 }, hoop), false)
  assert.equal(crossesHoop({ ...above, x: 0.8 }, { ...below, x: 0.8 }, hoop), false)
})

test('Gemini output is validated and overlapping detections are deduplicated', () => {
  const shots = parseGeminiShots({ shots: [{ time: 4, confidence: 0.8, note: 'made' }, { time: 4.5, confidence: 0.7, note: 'made' }] }, 20)
  assert.equal(shots.length, 1)
  assert.equal(shots[0].confirmed, false)
  assert.equal(mergeShots(shots, shots).length, 1)
  assert.throws(() => parseGeminiShots({ shots: [{ time: 100, confidence: 0.9, note: '' }] }, 20))
  assert.throws(() => parseGeminiShots({ shots: [{ time: '00:04', confidence: 0.9, note: '' }] }, 20))
})

test('the vault round-trips, randomizes ciphertext and rejects a wrong password', async () => {
  const first = await encryptKey('test-key-not-a-secret', 'a-long-password')
  const second = await encryptKey('test-key-not-a-secret', 'a-long-password')
  assert.notEqual(first.ciphertext, second.ciphertext)
  assert.equal(JSON.stringify(first).includes('test-key-not-a-secret'), false)
  assert.equal(await decryptKey(first, 'a-long-password'), 'test-key-not-a-secret')
  await assert.rejects(() => decryptKey(first, 'wrong-password'))
  await assert.rejects(() => encryptKey('key', 'short'))
})