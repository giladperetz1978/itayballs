import { mkdir } from 'node:fs/promises'
import { runFfmpeg } from '../server/export.mjs'

export default async function setup() {
  await mkdir('tests/fixtures', { recursive: true })
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'tests/fixtures/game.mp4'])
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'tests/fixtures/portrait.mp4'])
}