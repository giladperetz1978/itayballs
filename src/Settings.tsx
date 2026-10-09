import { useRef, useState } from 'react'
import { KeyRound, LockKeyhole, ShieldCheck, Trash2, X, ExternalLink } from 'lucide-react'
import { decryptKey, encryptKey } from './vault'
import type { EncryptedKey } from './vault'

const STORAGE_KEY = 'courtside.gemini.vault.v1'

export function Settings({ unlocked, onUnlock, onLock, onClose }: { unlocked: boolean; onUnlock: (key: string) => void; onLock: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [stored, setStored] = useState(() => { try { return !!localStorage.getItem(STORAGE_KEY) } catch { return false } })
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const secure = !!globalThis.crypto?.subtle

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setWorking(true)
    try {
      if (stored) {
        const record = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as EncryptedKey
        onUnlock(await decryptKey(record, password))
      } else {
        const cleaned = apiKey.trim()
        if (cleaned.length < 20) throw new Error('Invalid API key')
        const encrypted = await encryptKey(cleaned, password)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted))
        onUnlock(cleaned)
        setStored(true)
      }
      setApiKey('')
      setPassword('')
      onClose()
    } catch {
      setError(stored ? 'הפתיחה נכשלה. בדקו את הסיסמה. אם הכספת פגומה, מחקו אותה והזינו את המפתח מחדש.' : 'השמירה נכשלה. נדרשים מפתח תקין, סיסמה בת 10 תווים ואחסון מקומי זמין.')
    } finally { setWorking(false) }
  }

  function removeKey() {
    if (!window.confirm('למחוק את המפתח המוצפן מהמכשיר הזה?')) return
    try {
      localStorage.removeItem(STORAGE_KEY)
      onLock()
      setStored(false)
      setPassword('')
      setApiKey('')
      setError('')
    } catch { setError('לא ניתן לגשת לאחסון המקומי.') }
  }

  return <dialog ref={(element) => { dialog.current = element; if (element && !element.open) element.showModal() }} onCancel={(event) => { event.preventDefault(); if (!working) onClose() }} onClick={(event) => { if (event.target === dialog.current && !working) onClose() }} aria-labelledby="settings-title" className="settings-dialog">
    <div className="dialog-top"><span className="eyebrow">PERSONAL VAULT</span><button className="icon-button" title="סגירה" aria-label="סגירה" disabled={working} onClick={onClose}><X size={20} /></button></div>
    <div className="dialog-icon"><KeyRound size={27} /></div>
    <h2 id="settings-title">המפתח שלך. במכשיר שלך.</h2>
    <p className="muted">Gemini 3.8 Flash</p>
    <div className="security-note"><ShieldCheck size={19} /><span>המפתח מוצפן מקומית ב־AES-256-GCM ונשלח רק ל-Google. הסיסמה לא נשמרת ולא ניתנת לשחזור.</span></div>
    {!secure && <div role="alert" className="error-box">הצפנה מחייבת חיבור HTTPS. פתחו את האפליקציה בכתובת מאובטחת.</div>}
    {unlocked ? <div className="unlocked-state"><span className="status-dot" />הכספת פתוחה במפגש הנוכחי<button className="button secondary" onClick={() => { onLock(); setPassword('') }}><LockKeyhole size={17} />נעילת המפתח</button></div> : <form onSubmit={submit}>
      {!stored && <label className="field">מפתח Gemini אישי<input type="password" autoComplete="off" dir="ltr" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="AIza..." required minLength={20} disabled={working} /></label>}
      <label className="field">{stored ? 'סיסמת הכספת' : 'סיסמה להצפנה'}<input autoFocus type="password" autoComplete={stored ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={stored ? 'הסיסמה שבחרת במכשיר הזה' : 'לפחות 10 תווים'} minLength={stored ? 1 : 10} required disabled={working} /></label>
      <button className="button primary full-width" disabled={working || !secure}><LockKeyhole size={17} />{working ? 'מעבד...' : stored ? 'פתיחת הכספת' : 'הצפנה ושמירה במכשיר'}</button>
    </form>}
    {error && <p role="alert" className="error-box">{error}</p>}
    <div className="dialog-bottom"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">מפתח ב-Google AI Studio<ExternalLink size={14} /></a>{stored && <button className="text-button danger" disabled={working} onClick={removeKey}><Trash2 size={15} />מחיקת המפתח</button>}</div>
    <p className="fine-print">נעילה אוטומטית לאחר 15 דקות או דקה ברקע. ניתוח בענן כפוף לתמחור ולמדיניות Google. הצפנה מקומית אינה מגינה מפני מכשיר פרוץ או קוד זדוני בזמן שהכספת פתוחה.</p>
  </dialog>
}