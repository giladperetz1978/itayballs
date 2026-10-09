export type Point = { x: number; y: number; time: number; confidence: number }
export type Hoop = { x: number; y: number; width: number }
export type Shot = { id: string; time: number; confidence: number; source: 'manual' | 'local' | 'gemini'; confirmed: boolean; note: string }

export function clipWindow(time: number, duration: number) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0 || time < 0 || time > duration) throw new Error('Invalid video time')
  return { start: Math.max(0, time - 3), end: Math.min(duration, time + 3) }
}

export function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${Math.floor(safe % 60).toString().padStart(2, '0')}`
}

export function crossesHoop(previous: Point, current: Point, hoop: Hoop) {
  const elapsed = current.time - previous.time
  if (elapsed <= 0 || elapsed > 0.65 || previous.y >= hoop.y || current.y < hoop.y) return false
  const fraction = (hoop.y - previous.y) / (current.y - previous.y)
  const crossingX = previous.x + (current.x - previous.x) * fraction
  return Math.abs(crossingX - hoop.x) <= hoop.width / 2 && Math.abs(current.x - previous.x) < hoop.width * 2
}

export function mergeShots(existing: Shot[], incoming: Shot[]) {
  const result = [...existing]
  for (const shot of incoming) {
    if (!result.some((other) => Math.abs(other.time - shot.time) < 1.5)) result.push(shot)
  }
  return result.sort((first, second) => first.time - second.time)
}

export function parseGeminiShots(value: unknown, duration: number): Shot[] {
  if (!value || typeof value !== 'object' || !('shots' in value) || !Array.isArray(value.shots)) throw new Error('Invalid analysis response')
  const shots: Shot[] = []
  for (const item of value.shots) {
    if (!item || typeof item !== 'object' || typeof item.time !== 'number' || !Number.isFinite(item.time) || item.time < 0 || item.time > duration || typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1 || typeof item.note !== 'string') throw new Error('Invalid shot in analysis response')
    shots.push({ id: crypto.randomUUID(), time: item.time, confidence: item.confidence, note: item.note.slice(0, 300), source: 'gemini', confirmed: false })
  }
  return mergeShots([], shots)
}