import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpeg from 'ffmpeg-static'

const fakeKey = 'AIza-test-only-not-a-real-key-123456789'
const password = 'test-password-12345'

async function uploadGame(page: Page, filename = 'game.mp4') {
  await page.getByLabel('בחירת סרטון משחק').setInputFiles(`tests/fixtures/${filename}`)
  await expect(page.getByRole('button', { name: 'סימון קליעה', exact: true })).toBeEnabled()
}

async function saveKey(page: Page) {
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click()
  await page.getByLabel('מפתח Gemini אישי').fill(fakeKey)
  await page.getByLabel('סיסמה להצפנה').fill(password)
  await page.getByRole('button', { name: 'הצפנה ושמירה במכשיר' }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
}

test('desktop and phone layouts have no overflow and render the court asset', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'סטודיו המשחק.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ניתוח המשחק', exact: true })).toBeDisabled()
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.locator('.court-photo').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1024 : 844 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/layout-${width}.png`, fullPage: true, animations: 'disabled' })
  }
  expect(errors).toEqual([])
})

test('upload, manual marking, timed playback, correction, export and deletion', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('בחירת סרטון משחק').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not video') })
  await expect(page.getByRole('alert')).toContainText('בחרו סרטון')
  await uploadGame(page)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 5 })
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  const colors = await page.locator('video').evaluate((video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36
    const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0, 64, 36)
    return new Set(context.getImageData(0, 0, 64, 36).data).size
  })
  expect(colors).toBeGreaterThan(30)
  await page.getByRole('button', { name: 'סימון קליעה', exact: true }).click()
  await expect(page.locator('.shot-item')).toHaveCount(1)
  await expect(page.locator('.shot-title')).toContainText('00:02 – 00:08')
  await page.getByRole('button', { name: 'ניגון קליעה 1', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeLessThan(3)
  await page.getByRole('button', { name: 'השהיה', exact: true }).click()
  await page.getByRole('button', { name: 'ניגון', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused), { timeout: 12000 }).toBe(true)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(8, 1)
  await page.getByLabel('זמן הקליעה בשניות').fill('6')
  await expect(page.locator('.shot-title')).toContainText('00:03 – 00:09')
  page.once('dialog', (dialog) => dialog.accept())
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'הורדת הקליעה', exact: true }).click()
  const download = await downloadPromise
  await download.saveAs('test-results/exported-clip.mp4')
  const probe = await promisify(execFile)(ffmpeg!, ['-i', 'test-results/exported-clip.mp4', '-f', 'null', '-'])
  expect(probe.stderr).toMatch(/Duration: 00:00:06\./)
  expect(probe.stderr).toContain('Audio: aac')
  await page.getByRole('button', { name: 'החזרה לבדיקה', exact: true }).click()
  await page.getByRole('tab', { name: 'לבדיקה', exact: true }).click()
  await expect(page.locator('.shot-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'אישור קליעה', exact: true }).click()
  await expect(page.locator('.shot-item')).toHaveCount(0)
  await page.getByRole('tab', { name: 'הכול', exact: true }).click()
  await page.getByRole('button', { name: 'מחיקת קליעה', exact: true }).click()
  await expect(page.locator('.shot-item')).toHaveCount(0)
})

test('personal key is encrypted, reload locks it, wrong passwords fail, and deletion removes it', async ({ page }) => {
  await page.goto('/')
  await saveKey(page)
  const storage = await page.evaluate(() => JSON.stringify(localStorage))
  expect(storage).toContain('ciphertext')
  expect(storage).not.toContain(fakeKey)
  expect(storage).not.toContain(password)
  await page.reload()
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click()
  await page.getByLabel('סיסמת הכספת').fill('wrong-password')
  await page.getByRole('button', { name: 'פתיחת הכספת', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('הפתיחה נכשלה')
  await page.getByLabel('סיסמת הכספת').fill(password)
  await page.getByRole('button', { name: 'פתיחת הכספת', exact: true }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'הגדרות', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'מחיקת המפתח', exact: true }).click()
  await expect(page.getByLabel('מפתח Gemini אישי')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('courtside.gemini.vault.v1'))).toBeNull()
})

test('Gemini 3.8 Flash request uses consent, direct upload, four FPS, review and cleanup', async ({ page }) => {
  let uploads = 0
  let deleted = false
  let generated = false
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'DELETE') { deleted = true; return route.fulfill({ json: {} }) }
    if (url.pathname === '/upload/v1beta/files') {
      uploads++
      expect(request.headers()['x-goog-api-key']).toBe(fakeKey)
      expect(request.headers()['x-goog-upload-command']).toBe('start')
      return route.fulfill({ headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/test', 'access-control-expose-headers': 'x-goog-upload-url' }, json: {} })
    }
    if (url.pathname === '/upload/test') return route.fulfill({ json: { file: { name: 'files/test', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test', mimeType: 'video/mp4', state: 'ACTIVE' } } })
    if (url.pathname.includes('gemini-3.8-flash:generateContent')) {
      generated = true
      expect(request.postDataJSON().contents[0].parts[0].videoMetadata.fps).toBe(4)
      return route.fulfill({ json: { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ shots: [{ time: 5, confidence: 0.92, note: 'קליעת בדיקה מדומה' }] }) }] } }] } })
    }
    return route.fulfill({ status: 500, json: { error: 'Unexpected mock request' } })
  })
  await page.goto('/')
  await saveKey(page)
  await uploadGame(page)
  await page.getByRole('button', { name: 'ניתוח המשחק', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('ייתכנו חיובים')
  expect(uploads).toBe(0)
  await page.getByRole('button', { name: 'אישור ושליחה לניתוח' }).click()
  await expect(page.locator('.shot-item')).toHaveCount(1)
  await expect(page.locator('.shot-state')).toHaveText('לבדיקה')
  await expect.poll(() => deleted).toBe(true)
  expect(generated).toBe(true)
  await expect(page.getByRole('button', { name: 'ניתוח המשחק', exact: true })).toBeEnabled()
})

test('portrait video maps the rim to actual video bounds on mobile and exports without audio', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await uploadGame(page, 'portrait.mp4')
  await page.getByRole('button', { name: 'סימון הסל', exact: true }).click()
  const bounds = await page.locator('.video-content').boundingBox()
  expect(bounds).not.toBeNull()
  await page.locator('.video-content').click({ position: { x: bounds!.width / 2, y: bounds!.height / 3 } })
  await expect(page.locator('.hoop-marker')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const response = await request.post('/api/export', { multipart: { video: { name: 'portrait.mp4', mimeType: 'video/mp4', buffer: await readFile('tests/fixtures/portrait.mp4') }, windows: JSON.stringify([{ start: 0, end: 4 }]) } })
  expect(response.status()).toBe(200)
  await writeFile('test-results/portrait-export.mp4', await response.body())
  const probe = await promisify(execFile)(ffmpeg!, ['-i', 'test-results/portrait-export.mp4', '-f', 'null', '-'])
  expect(probe.stderr).toMatch(/Duration: 00:00:04\./)
  await page.screenshot({ path: 'test-results/portrait-mobile.png', fullPage: true, animations: 'disabled' })
})

test('combined highlights preserve both clip windows and reject foreign origins', async ({ request }) => {
  const rejected = await request.post('/api/export', { headers: { origin: 'https://foreign.example' } })
  expect(rejected.status()).toBe(403)
  const response = await request.post('/api/export', { multipart: { video: { name: 'game.mp4', mimeType: 'video/mp4', buffer: await readFile('tests/fixtures/game.mp4') }, windows: JSON.stringify([{ start: 0, end: 4 }, { start: 9, end: 12 }]) } })
  expect(response.status()).toBe(200)
  await writeFile('test-results/highlights.mp4', await response.body())
  const probe = await promisify(execFile)(ffmpeg!, ['-i', 'test-results/highlights.mp4', '-f', 'null', '-'])
  expect(probe.stderr).toMatch(/Duration: 00:00:07\./)
  expect(probe.stderr).toContain('Audio: aac')
})

test('local detector loads real model weights and completes video inference', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('/')
  await uploadGame(page, 'portrait.mp4')
  await page.getByRole('button', { name: 'סימון הסל', exact: true }).click()
  await page.locator('.video-content').click()
  await page.getByLabel('מנוע הניתוח').selectOption('local')
  await page.getByRole('button', { name: 'ניתוח המשחק', exact: true }).click()
  await expect(page.locator('.processing-status')).toContainText('המעקב המקומי הסתיים', { timeout: 160000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ניתוח המשחק', exact: true })).toBeEnabled()
})