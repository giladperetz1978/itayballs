import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runFfmpeg, validateWindows } from './export.mjs'

const app = express()
const port = Number(process.env.PORT || 3001)
let exporting = false
app.disable('x-powered-by')
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com https://storage.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
  const origin = request.get('origin')
  if (request.path.startsWith('/api/') && origin) {
    try {
      if (new URL(origin).host !== request.get('host') && origin !== process.env.APP_ORIGIN) return response.status(403).json({ error: 'Origin is not allowed' })
    } catch { return response.status(403).json({ error: 'Invalid origin' }) }
  }
  next()
})
app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'courtside-export' }))
app.post('/api/export', async (request, response) => {
  if (exporting) return response.status(429).json({ error: 'An export is already running' })
  exporting = true
  let directory
  const controller = new AbortController()
  response.on('close', () => { if (!response.writableFinished) controller.abort() })
  try {
    directory = await mkdtemp(join(tmpdir(), 'courtside-'))
    const upload = multer({
      dest: directory,
      limits: { fileSize: 500 * 1024 * 1024, files: 1, fields: 1, fieldSize: 20000, parts: 2 },
      fileFilter: (_request, file, callback) => callback(null, ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.mimetype)),
    }).single('video')
    await new Promise((resolveUpload, rejectUpload) => upload(request, response, (error) => error ? rejectUpload(error) : resolveUpload()))
    if (!request.file) return response.status(400).json({ error: 'A supported video is required' })
    let windows
    try { windows = validateWindows(JSON.parse(request.body.windows)) }
    catch { return response.status(400).json({ error: 'Invalid clip windows' }) }
    const format = request.file.mimetype === 'video/webm' ? 'matroska' : 'mov'
    const clips = []
    for (const [index, window] of windows.entries()) {
      controller.signal.throwIfAborted()
      const filename = `clip-${index}.mp4`
      await runFfmpeg(['-threads', '2', '-filter_threads', '2', '-protocol_whitelist', 'file,pipe', '-ss', String(window.start), '-f', format, '-i', request.file.path, '-t', String(window.end - window.start), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-movflags', '+faststart', join(directory, filename)], controller.signal)
      clips.push(filename)
    }
    let output = join(directory, clips[0])
    if (clips.length > 1) {
      const manifest = join(directory, 'clips.txt')
      await writeFile(manifest, clips.map((filename) => `file '${filename}'`).join('\n'))
      output = join(directory, 'highlights.mp4')
      await runFfmpeg(['-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '1', '-i', manifest, '-c', 'copy', '-movflags', '+faststart', output], controller.signal)
    }
    response.setHeader('Cache-Control', 'no-store')
    await new Promise((resolveDownload, rejectDownload) => response.download(output, clips.length > 1 ? 'courtside-highlights.mp4' : 'basket.mp4', (error) => error ? rejectDownload(error) : resolveDownload()))
  } catch (error) {
    if (!response.headersSent && !response.destroyed) response.status(error instanceof multer.MulterError ? 400 : 500).json({ error: 'Video export failed' })
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    exporting = false
  }
})
app.use('/api', (_request, response) => response.status(404).json({ error: 'Unknown endpoint' }))
app.use(express.static(resolve('dist'), { index: 'index.html' }))
const server = app.listen(port, '127.0.0.1', () => console.log(`Courtside export server: http://127.0.0.1:${port}`))
server.requestTimeout = 15 * 60 * 1000