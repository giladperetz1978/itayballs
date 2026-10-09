import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateWindows, runFfmpeg } from '../server/export.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('export accepts bounded six-second clips and rejects abusive input', () => {
  const windows = [{ start: 0, end: 4 }, { start: 7, end: 13 }]
  assert.deepEqual(validateWindows(windows), windows)
  for (const invalid of [[], null, [{ start: -1, end: 2 }], [{ start: 1, end: 10 }], [{ start: '1', end: 2 }], [{ start: 1, end: Infinity }], [{ start: 1800, end: 1806 }], [{ start: 2, end: 2 }]]) assert.throws(() => validateWindows(invalid))
})

test('cancelling FFmpeg waits for file handles to close before cleanup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'courtside-test-'))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 150)
  try {
    await assert.rejects(runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-c:v', 'libx264', join(directory, 'cancel.mp4')], controller.signal))
  } finally {
    clearTimeout(timer)
    await rm(directory, { recursive: true, force: true })
  }
})