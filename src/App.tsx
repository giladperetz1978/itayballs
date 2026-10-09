import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, Check, ChevronLeft, Circle, CircleDot, Clapperboard, Clock3, Crosshair, Film, FolderOpen, KeyRound, LayoutDashboard, ListFilter, LoaderCircle, LockKeyhole, Maximize, Pause, Play, Plus, ScanLine, Settings2, ShieldCheck, SkipBack, SkipForward, Sparkles, Target, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react'
import { clipWindow, formatTime, mergeShots } from './domain'
import type { Hoop, Point, Shot } from './domain'
import { analyzeGemini, analyzeLocal, detectBall, seekVideo } from './analysis'
import { Settings } from './Settings'
import './App.css'

type Media = { file: File; url: string }
type Filter = 'all' | 'pending' | 'confirmed'

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const clipEnd = useRef<number | null>(null)
  const [media, setMedia] = useState<Media | null>(null)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [aspect, setAspect] = useState(16 / 9)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [shots, setShots] = useState<Shot[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [engine, setEngine] = useState<'gemini' | 'local'>('gemini')
  const [busy, setBusy] = useState<'gemini' | 'local' | 'export' | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('ממתין לסרטון')
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [hoop, setHoop] = useState<Hoop | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [ball, setBall] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const confirmed = shots.filter((shot) => shot.confirmed)
  const visibleShots = shots.filter((shot) => filter === 'all' || (filter === 'confirmed' ? shot.confirmed : !shot.confirmed))
  const active = shots.find((shot) => shot.id === selected)
  const ready = duration > 0 && !!media
  const boxWidth = aspect < 16 / 9 ? aspect / (16 / 9) * 100 : 100
  const boxHeight = aspect > 16 / 9 ? (16 / 9) / aspect * 100 : 100

  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url) }, [media])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (!shots.length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [shots.length])

  useEffect(() => {
    if (!apiKey) return
    const lock = () => { abortRef.current?.abort(); setApiKey(null) }
    const expiry = setTimeout(lock, 15 * 60 * 1000)
    let background: ReturnType<typeof setTimeout> | undefined
    const visibility = () => {
      clearTimeout(background)
      if (document.hidden) background = setTimeout(lock, 60000)
    }
    document.addEventListener('visibilitychange', visibility)
    return () => { clearTimeout(expiry); clearTimeout(background); document.removeEventListener('visibilitychange', visibility) }
  }, [apiKey])

  useEffect(() => {
    if (!playing) return
    let frame: number
    const tick = () => {
      const video = videoRef.current
      if (video && clipEnd.current !== null && video.currentTime >= clipEnd.current) {
        video.pause()
        video.currentTime = clipEnd.current
        clipEnd.current = null
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  useEffect(() => {
    if (!tracking || !media || busy) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const scan = async () => {
      const video = videoRef.current
      if (video && video.readyState >= 2 && !video.seeking) {
        try {
          const point = await detectBall(video)
          if (alive) setBall(point)
        } catch {
          if (alive) { setError('מודל המעקב לא נטען. בדקו חיבור לרשת ונסו שוב.'); setTracking(false) }
          return
        }
      }
      if (alive) timer = setTimeout(scan, 150)
    }
    void scan()
    return () => { alive = false; clearTimeout(timer) }
  }, [tracking, media, busy])

  function loadFile(file?: File) {
    if (!file || busy) return
    if (!/^video\/(mp4|webm|quicktime)$/.test(file.type) && !/\.(mp4|webm|mov)$/i.test(file.name)) { setError('בחרו סרטון MP4, WebM או MOV.'); return }
    if (file.size > 500 * 1024 * 1024) { setError('גודל הסרטון המרבי הוא 500 MB.'); return }
    if (shots.length && !window.confirm('להחליף את הסרטון? הסימונים הנוכחיים יימחקו.')) return
    videoRef.current?.pause()
    setDuration(0); setCurrent(0); setShots([]); setSelected(null); setHoop(null); setBall(null); setTracking(false); setCalibrating(false); setError(''); setProgress(0); setFilter('all'); setPlaying(false)
    clipEnd.current = null
    setStatus('טוען סרטון')
    const normalized = file.type ? file : new File([file], file.name, { type: /\.webm$/i.test(file.name) ? 'video/webm' : /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4', lastModified: file.lastModified })
    setMedia({ file: normalized, url: URL.createObjectURL(normalized) })
  }

  function loaded() {
    const video = videoRef.current!
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 1800) { setError('נדרש סרטון תקין באורך של עד 30 דקות.'); setMedia(null); setDuration(0); return }
    setDuration(video.duration)
    setAspect(video.videoWidth / video.videoHeight)
    setStatus('מוכן לניתוח')
  }

  async function playShot(shot: Shot) {
    const video = videoRef.current
    if (!video || busy) return
    setSelected(shot.id)
    const window = clipWindow(shot.time, duration)
    try { await seekVideo(video, window.start); clipEnd.current = window.end; await video.play() }
    catch { setError('לא ניתן לנגן את הקטע. נסו להפעיל שוב.'); clipEnd.current = null }
  }

  async function togglePlay() {
    const video = videoRef.current
    if (!video || busy) return
    if (!video.paused) video.pause()
    else {
      try { await video.play() } catch { setError('הדפדפן לא הצליח לנגן את הסרטון.') }
    }
  }

  function seek(time: number) {
    if (!videoRef.current || busy) return
    clipEnd.current = null
    const next = Math.min(duration, Math.max(0, time))
    videoRef.current.currentTime = next
    setCurrent(next)
  }

  function markShot() {
    if (!ready || busy) return
    const time = videoRef.current!.currentTime
    if (shots.some((shot) => Math.abs(shot.time - time) < 1.5)) { setError('כבר קיימת קליעה בסמוך לזמן הזה.'); return }
    const shot: Shot = { id: crypto.randomUUID(), time, confidence: 1, source: 'manual', confirmed: true, note: 'סימון ידני' }
    setShots((previous) => mergeShots(previous, [shot])); setSelected(shot.id); setError('')
  }

  function beginAnalysis() {
    if (engine === 'gemini') {
      if (!apiKey) { setSettingsOpen(true); return }
      setConsentOpen(true)
    } else if (!hoop) {
      setCalibrating(true); videoRef.current?.pause(); setStatus('בחירת מרכז הטבעת'); setError('בחרו את מרכז טבעת הסל בתמונה וכוונו את רוחב הסימון.')
    } else void runAnalysis()
  }

  async function runAnalysis() {
    if (!media || !ready || busy) return
    setConsentOpen(false)
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(engine); setProgress(0); setError(''); setTracking(false); setBall(null)
    const video = videoRef.current!
    video.pause()
    clipEnd.current = null
    const originalTime = video.currentTime
    const report = (percent: number, message: string) => { setProgress(percent); setStatus(message) }
    try {
      if (engine === 'gemini' && apiKey) {
        await analyzeGemini(media.file, duration, apiKey, controller.signal, report, (incoming) => setShots((previous) => mergeShots(previous, incoming)))
      } else if (engine === 'local' && hoop) {
        await analyzeLocal(video, hoop, controller.signal, report, (shot) => setShots((previous) => mergeShots(previous, [shot])), setBall)
      }
    } catch (cause) {
      if (controller.signal.aborted) setStatus('הניתוח בוטל · תוצאות שהושלמו נשמרו')
      else {
        const message = cause instanceof Error ? cause.message : ''
        setError(/429|RESOURCE_EXHAUSTED/.test(message) ? 'מכסת Gemini נוצלה. בדקו חיוב ומגבלות ב-Google AI Studio.' : /40[13]|API_KEY|PERMISSION/.test(message) ? 'Google דחתה את המפתח או את ההרשאות. בדקו את המפתח בהגדרות.' : /404|NOT_FOUND/.test(message) ? 'Gemini 3.8 Flash אינו זמין למפתח הזה כרגע.' : 'הניתוח נכשל. בדקו רשת, הרשאות מודל ותקינות הסרטון. תוצאות שהושלמו נשמרו.')
        setStatus('הניתוח לא הושלם')
      }
    } finally {
      if (engine === 'local') { try { await seekVideo(video, originalTime) } catch { setStatus('הניתוח הסתיים בפריים האחרון שנקרא') } }
      setBusy(null); setBall(null); abortRef.current = null
    }
  }

  async function exportClips(items: Shot[]) {
    if (!media || !items.length || busy) return
    if (import.meta.env.VITE_STATIC_HOSTING === 'true') {
      setError('ייצוא MP4 אינו זמין בגרסת GitHub Pages. לייצוא וידאו יש להפעיל את האפליקציה במחשב עם שרת החיתוך. אפשר לשמור סימונים כ-JSON כאן.')
      return
    }
    if (!window.confirm('ליצור MP4? הסרטון יישלח לשרת האפליקציה לחיתוך, ויימחק מהשרת בסיום. מפתח Gemini לא נשלח לשרת.')) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy('export'); setError(''); setStatus('מכין MP4 להורדה'); videoRef.current?.pause()
    try {
      const form = new FormData()
      form.append('video', media.file)
      form.append('windows', JSON.stringify(items.map((shot) => clipWindow(shot.time, duration))))
      const response = await fetch('/api/export', { method: 'POST', body: form, signal: controller.signal })
      if (!response.ok) throw new Error('Export failed')
      download(await response.blob(), items.length === 1 ? `basket-${formatTime(items[0].time).replace(':', '-')}.mp4` : 'courtside-highlights.mp4')
      setStatus('קובץ MP4 מוכן')
    } catch { if (controller.signal.aborted) setStatus('הייצוא בוטל'); else { setError('הייצוא נכשל. ודאו ששרת החיתוך פעיל ושהסרטון נתמך.'); setStatus('הייצוא לא הושלם') } }
    finally { setBusy(null); abortRef.current = null }
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  function saveMarkers() {
    download(new Blob([JSON.stringify({ video: media?.file.name, duration, shots, windows: shots.map((shot) => ({ id: shot.id, ...clipWindow(shot.time, duration) })) }, null, 2)], { type: 'application/json' }), 'courtside-markers.json')
  }

  return <div className="app-shell" dir="rtl">
    <aside className="sidebar">
      <a className="brand" href="#studio" aria-label="Courtside"><CircleDot size={31} strokeWidth={1.6} /><span>COURTSIDE<span className="brand-sub">EVERY BUCKET COUNTS</span></span></a>
      <div className="side-section-label">סביבת העבודה</div>
      <nav><a className="nav-item active" href="#studio"><LayoutDashboard size={19} />חדר העריכה<span className="nav-indicator" /></a><a className="nav-item" href="#shots"><Clapperboard size={19} />הקליעות שלי<span className="nav-count">{shots.length}</span></a><button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings2 size={19} />הגדרות</button></nav>
      <div className="side-session"><span className="side-section-label">על המגרש</span><div className="session-format"><strong>3 <span>×</span> 3</strong><span>סל אחד. משחק שלם.</span></div><div className="session-line"><CircleDot size={15} />{media ? 'משחק פעיל' : 'אין משחק פעיל'}</div></div>
      <div className="side-bottom"><span className="status-dot" />סביבת עבודה פרטית<button className="icon-button" title={apiKey ? 'נעילת המפתח' : 'פתיחת כספת'} aria-label={apiKey ? 'נעילת המפתח' : 'פתיחת כספת'} onClick={() => { if (apiKey) { abortRef.current?.abort(); setApiKey(null) } else setSettingsOpen(true) }}><LockKeyhole size={16} /></button></div>
    </aside>
    <main id="studio" className="main">
      <header className="topbar"><div className="breadcrumb">סביבת העבודה<ChevronLeft size={14} /><strong>סטודיו המשחק</strong></div><button className={`key-status ${apiKey ? 'unlocked' : ''}`} onClick={() => setSettingsOpen(true)}><span className="status-dot" />Gemini 3.8 Flash<KeyRound size={14} /></button></header>
      <div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">GAME ROOM / 01</span><h1>סטודיו המשחק<span className="heading-dot">.</span></h1><div className="game-meta"><span>כדורסל 3×3</span><span className="tiny-dot" />חצי מגרש<span className="tiny-dot" /><span>±3 שניות לכל קליעה</span></div></div><button className="button primary" onClick={() => inputRef.current?.click()} disabled={!!busy}><Upload size={17} />{media ? 'החלפת סרטון' : 'העלאת משחק'}</button></div>
        <section className="stats-strip" aria-label="נתוני משחק"><div className="stat"><span><Film size={17} />אורך המשחק</span><strong dir="ltr">{ready ? formatTime(duration) : '--:--'}</strong></div><div className="stat"><span><Target size={17} />קליעות מאושרות</span><strong>{String(confirmed.length).padStart(2, '0')}<small>קליעות</small></strong></div><div className="stat"><span><ScanLine size={17} />ממתינות לבדיקה</span><strong>{String(shots.length - confirmed.length).padStart(2, '0')}<small>רגעים</small></strong></div><div className="stat"><span><Clock3 size={17} />זמן היילייטס</span><strong dir="ltr">{formatTime(confirmed.reduce((total, shot) => { const window = clipWindow(shot.time, duration); return total + window.end - window.start }, 0))}</strong></div></section>
        {error && <div className="error-box app-error" role="alert"><span>{error}</span><button className="icon-button" title="סגירת הודעה" aria-label="סגירת הודעה" onClick={() => setError('')}><X size={16} /></button></div>}
        <div className="workspace-grid">
          <section className="editor" aria-label="נגן ועורך">
            <div className="section-heading"><h2><span className="section-number">01</span>המגרש שלך</h2><span className="source-label">{media ? media.file.name : 'אין סרטון נבחר'}<Circle size={7} fill="currentColor" /></span></div>
            <div className={`video-stage ${dragging ? 'dragging' : ''} ${calibrating ? 'calibrating' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]) }}>
              {media ? <><div className="video-content" style={{ width: `${boxWidth}%`, height: `${boxHeight}%`, left: `${(100 - boxWidth) / 2}%`, top: `${(100 - boxHeight) / 2}%` }} onClick={(event) => {
                if (!calibrating || busy) return
                const rect = event.currentTarget.getBoundingClientRect()
                setHoop({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, width: hoop?.width || 0.09 }); setCalibrating(false); setError(''); setStatus('מיקום הסל נשמר')
              }}><video ref={videoRef} src={media.url} playsInline preload="auto" muted={muted} onLoadedMetadata={loaded} onTimeUpdate={() => setCurrent(videoRef.current?.currentTime || 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setError('הסרטון אינו נתמך בדפדפן הזה. נסו MP4 בקידוד H.264.'); setDuration(0) }} />{hoop && <div className="hoop-marker" style={{ left: `${hoop.x * 100}%`, top: `${hoop.y * 100}%`, width: `${hoop.width * 100}%` }}><span>סל</span></div>}{ball && (tracking || busy === 'local') && Math.abs(ball.time - current) < 0.7 && <div className="ball-marker" style={{ left: `${ball.x * 100}%`, top: `${ball.y * 100}%` }}><span>כדור</span></div>}</div><div className="stage-label"><span className="status-dot" />{calibrating ? 'בחירת מרכז הטבעת' : busy === 'local' ? 'מעקב מקומי' : active ? `קליעה ${String(shots.indexOf(active) + 1).padStart(2, '0')}` : 'סרטון מקורי'}</div>{calibrating && <div className="calibration-cross"><Crosshair size={28} /></div>}</> : <div className="upload-scene"><img className="court-photo" src={`${import.meta.env.BASE_URL}court.jpg`} alt="מגרש כדורסל פתוח" /><div className="scene-shade" /><span className="scene-tag"><span className="status-dot" />READY WHEN YOU ARE</span><div className="upload-content"><div className="upload-icon"><Upload size={27} strokeWidth={1.6} /></div><h2>המשחק מתחיל כאן</h2><button className="button light" onClick={() => inputRef.current?.click()}><Plus size={17} />בחירת סרטון</button><span className="upload-formats" dir="ltr">MP4 · MOV · WEBM / MAX 500 MB</span></div><div className="scene-footer"><span>HALF COURT. FULL GAME.</span><span>3 × 3</span></div></div>}
            </div>
            <div className="player-controls" dir="ltr"><button className="icon-button play-button" disabled={!ready || !!busy} onClick={() => void togglePlay()} title={playing ? 'השהיה' : 'ניגון'} aria-label={playing ? 'השהיה' : 'ניגון'}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><button className="icon-button" disabled={!ready || !!busy} title="5 שניות אחורה" aria-label="5 שניות אחורה" onClick={() => seek(current - 5)}><SkipBack size={17} /></button><button className="icon-button" disabled={!ready || !!busy} title="5 שניות קדימה" aria-label="5 שניות קדימה" onClick={() => seek(current + 5)}><SkipForward size={17} /></button><span className="player-time">{formatTime(current)} <span>/ {formatTime(duration)}</span></span><div className="control-spacer" /><select aria-label="מהירות ניגון" defaultValue="1" disabled={!ready || !!busy} onChange={(event) => { if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value) }}><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button className="icon-button" disabled={!ready} title={muted ? 'הפעלת שמע' : 'השתקה'} aria-label={muted ? 'הפעלת שמע' : 'השתקה'} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button className="icon-button" disabled={!ready} title="מסך מלא" aria-label="מסך מלא" onClick={() => { void videoRef.current?.parentElement?.requestFullscreen?.().catch(() => setError('מסך מלא אינו זמין בדפדפן הזה.')) }}><Maximize size={17} /></button></div>
            <div className="timeline" dir="ltr"><div className="timeline-ticks">{Array.from({ length: 5 }, (_, index) => <span key={index}>{ready ? formatTime(duration * index / 4) : '--:--'}</span>)}</div><div className="timeline-track"><div className="timeline-fill" style={{ width: `${duration ? current / duration * 100 : 0}%` }} />{shots.map((shot, index) => <button key={shot.id} className={`timeline-marker ${shot.confirmed ? 'confirmed' : ''}`} style={{ left: `${shot.time / duration * 100}%` }} title={`קליעה ${index + 1} · ${formatTime(shot.time)}`} aria-label={`קליעה ${index + 1} בציר הזמן`} disabled={!!busy} onClick={() => void playShot(shot)} />)}<input type="range" aria-label="מיקום בסרטון" min="0" max={duration || 1} step="0.01" value={current} disabled={!ready || !!busy} onChange={(event) => seek(Number(event.target.value))} /></div><div className="timeline-legend" dir="rtl"><span><i className="legend-dot green" />מאושרת</span><span><i className="legend-dot amber" />לבדיקה</span><span className="timeline-window">חלון קליעה <b dir="ltr">−3s / +3s</b></span></div></div>
            <div className="editor-tools"><button className={`button secondary ${calibrating ? 'selected' : ''}`} disabled={!ready || !!busy} onClick={() => { setCalibrating(!calibrating); videoRef.current?.pause() }}><Crosshair size={17} />{hoop ? 'מיקום הסל' : 'סימון הסל'}</button><label className="tracking-toggle"><input type="checkbox" checked={tracking} disabled={!ready || !!busy} onChange={(event) => { setTracking(event.target.checked); setBall(null) }} /><span className="switch" /><span>מעקב כדור</span></label><button className="button mark-button" disabled={!ready || !!busy} onClick={markShot}><Plus size={17} />סימון קליעה</button></div>
            {hoop && <label className="rim-width">רוחב הטבעת<input type="range" min="0.02" max="0.3" step="0.005" value={hoop.width} disabled={!!busy} onChange={(event) => setHoop({ ...hoop, width: Number(event.target.value) })} /><span dir="ltr">{Math.round(hoop.width * 100)}%</span></label>}
            <div className="analysis-bar"><div className="analysis-engine"><div className="engine-symbol"><Sparkles size={21} /></div><div><label htmlFor="engine-select">מנוע הניתוח</label><select id="engine-select" value={engine} disabled={!!busy} onChange={(event) => setEngine(event.target.value as 'gemini' | 'local')}><option value="gemini">Gemini 3.8 Flash</option><option value="local">מעקב מקומי · ניסיוני</option></select></div></div><span className="analysis-detail">{engine === 'gemini' ? apiKey ? 'מפתח אישי מחובר' : 'נדרש מפתח אישי' : 'ללא העלאת הסרטון'}</span><button className="button dark" disabled={!ready || !!busy} onClick={beginAnalysis}><Sparkles size={16} />ניתוח המשחק</button></div>
            <div className="processing-status" role="status" aria-live="polite"><span>{busy ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />}{status}</span>{busy && <button className="text-button" onClick={() => abortRef.current?.abort()}><X size={14} />ביטול</button>}</div>{busy && busy !== 'export' && <progress className="analysis-progress" value={progress} max="100" />}
          </section>
          <aside id="shots" className="clips-panel"><div className="section-heading"><h2><span className="section-number">02</span>הרגעים שלך</h2><span className="count-badge">{shots.length}</span></div><div className="clip-tabs" role="tablist" aria-label="סינון קליעות">{([['all', 'הכול'], ['pending', 'לבדיקה'], ['confirmed', 'מאושרות']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}{value === 'pending' && shots.length > confirmed.length && <span className="pending-dot" />}</button>)}</div>
            <div className="clips-body">{visibleShots.length ? <div className="shot-list">{visibleShots.map((shot) => { const index = shots.indexOf(shot); const window = clipWindow(shot.time, duration); return <article className={`shot-item ${selected === shot.id ? 'selected' : ''}`} key={shot.id}><div className="shot-top"><button className="shot-play" title="ניגון קטע הקליעה" aria-label={`ניגון קליעה ${index + 1}`} disabled={!!busy} onClick={() => void playShot(shot)}><Play size={18} fill="currentColor" /><span>{String(index + 1).padStart(2, '0')}</span></button><div className="shot-title"><strong>קליעה {String(index + 1).padStart(2, '0')}</strong><span dir="ltr">{formatTime(window.start)} – {formatTime(window.end)}</span></div><span className={`shot-state ${shot.confirmed ? 'confirmed' : ''}`}>{shot.confirmed ? 'מאושרת' : 'לבדיקה'}</span></div><p className="shot-note">{shot.note}</p><div className="shot-actions"><span className="shot-source" title="ביטחון מדווח של המודל, לא מדד דיוק מכויל">{shot.source === 'manual' ? 'ידני' : shot.source === 'gemini' ? 'GEMINI' : 'LOCAL'}{shot.source !== 'manual' && ` · ${Math.round(shot.confidence * 100)}%`}</span><button className={`icon-button ${shot.confirmed ? 'is-confirmed' : ''}`} title={shot.confirmed ? 'החזרה לבדיקה' : 'אישור קליעה'} aria-label={shot.confirmed ? 'החזרה לבדיקה' : 'אישור קליעה'} disabled={!!busy} onClick={() => setShots((previous) => previous.map((item) => item.id === shot.id ? { ...item, confirmed: !item.confirmed } : item))}><Check size={17} /></button><button className="icon-button" title="הורדת הקליעה" aria-label="הורדת הקליעה" disabled={!!busy} onClick={() => void exportClips([shot])}><ArrowDownToLine size={16} /></button><button className="icon-button delete-button" title="מחיקת קליעה" aria-label="מחיקת קליעה" disabled={!!busy} onClick={() => { if (selected === shot.id) { setSelected(null); clipEnd.current = null }; setShots((previous) => previous.filter((item) => item.id !== shot.id)) }}><Trash2 size={15} /></button></div>{selected === shot.id && <div className="time-editor"><label>רגע הקליעה<input aria-label="זמן הקליעה בשניות" dir="ltr" type="number" min="0" max={duration} step="0.1" value={Number(shot.time.toFixed(1))} disabled={!!busy} onChange={(event) => { const time = Number(event.target.value); if (Number.isFinite(time) && time >= 0 && time <= duration) { clipEnd.current = null; setShots((previous) => previous.map((item) => item.id === shot.id ? { ...item, time } : item).sort((first, second) => first.time - second.time)) } }} /></label><span>שניות</span></div>}</article> })}</div> : <div className="clips-empty"><div className="empty-frame"><Clapperboard size={28} strokeWidth={1.2} /><span className="empty-plus">+</span></div><h3>{filter === 'all' ? 'עוד אין רגעים ברשימה' : filter === 'pending' ? 'אין קליעות לבדיקה' : 'אין קליעות מאושרות'}</h3><span className="empty-subtitle">{filter === 'all' ? 'הקליעה הראשונה עוד לפנינו' : '00 קליעות'}</span><div className="empty-time" dir="ltr"><span>−3s</span><Target size={19} /><span>+3s</span></div></div>}</div>
            <div className="export-area"><div className="export-summary"><span>קליעות מאושרות</span><strong>{confirmed.length}<span> / {shots.length}</span></strong></div><button className="button primary full-width" disabled={!confirmed.length || !!busy} onClick={() => void exportClips(confirmed)}><ArrowDownToLine size={17} />ייצוא היילייטס<small>MP4</small></button><button className="text-button markers-export" disabled={!shots.length || !!busy} onClick={saveMarkers}><ListFilter size={14} />שמירת סימונים JSON</button></div>
          </aside>
        </div>
        <footer className="page-footer"><span><ShieldCheck size={14} />{engine === 'local' ? 'עיבוד מקומי במכשיר' : 'העלאה ל-Google רק באישור שלך'}</span><span dir="ltr">COURTSIDE / EVERY BUCKET COUNTS</span></footer>
      </div>
    </main>
    <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mov" className="visually-hidden" aria-label="בחירת סרטון משחק" onChange={(event) => { loadFile(event.target.files?.[0]); event.target.value = '' }} />
    {settingsOpen && <Settings unlocked={!!apiKey} onUnlock={setApiKey} onLock={() => { abortRef.current?.abort(); setApiKey(null) }} onClose={() => setSettingsOpen(false)} />}
    {consentOpen && <dialog className="consent-dialog" ref={(element) => { if (element && !element.open) element.showModal() }} onCancel={() => setConsentOpen(false)} aria-labelledby="consent-title"><div className="dialog-top"><Sparkles size={24} /><button className="icon-button" title="סגירה" aria-label="סגירה" onClick={() => setConsentOpen(false)}><X size={20} /></button></div><h2 id="consent-title">ניתוח עם Gemini 3.8 Flash</h2><p>הסרטון יישלח ישירות ל-Google באמצעות המפתח האישי שלך. ייתכנו חיובים בחשבון Google. יש לוודא שיש לך אישור מהמצולמים.</p><p>תוצאות AI דורשות בדיקה. בסיום תתבצע בקשת מחיקה של הסרטון מ-Google; אם תיכשל או שהדף ייסגר, הקובץ עשוי להישמר שם עד 48 שעות, בכפוף למדיניות Google.</p><div className="consent-file"><FolderOpen size={18} /><span>{media?.file.name}</span><b dir="ltr">{media ? Math.ceil(media.file.size / 1024 / 1024) : 0} MB</b></div><button className="button primary full-width" onClick={() => void runAnalysis()}><Sparkles size={17} />אישור ושליחה לניתוח</button></dialog>}
  </div>
}

export default App
