import { spawn } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

export function validateWindows(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error('Select between 1 and 100 clips')
  for (const window of value) {
    if (!window || typeof window.start !== 'number' || typeof window.end !== 'number' || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start < 0 || window.end > 1800 || window.end <= window.start || window.end - window.start > 6.001) throw new Error('Invalid clip window')
  }
  return value
}

export function runFfmpeg(args, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const process = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { windowsHide: true, signal })
    let stderr = ''
    let processError
    const timer = setTimeout(() => process.kill('SIGKILL'), 120000)
    process.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000) })
    process.on('error', (error) => { processError = error })
    process.on('close', (code) => {
      clearTimeout(timer)
      if (processError) reject(processError)
      else if (code === 0) resolve()
      else reject(new Error(stderr || 'Video conversion failed'))
    })
  })
}