import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { speak, stopSpeaking } from '../lib/speech'
import type { CameraViewHandle, ActiveMode } from '../components/CameraView'
import type { User } from 'firebase/auth'
import { useDetectionLogger } from '../hooks/useDetectionLogger'

const CameraView = lazy(() => import('../components/CameraView').then(m => ({ default: m.CameraView })))

type Feature = {
  id: ActiveMode
  label: string
  activeLabel: string
  description: string
  oneShot?: boolean
}

const FEATURES: Feature[] = [
  { id: 'objects',       label: 'Object Detection', activeLabel: 'Stop Detection',   description: 'Detect & label objects via MediaPipe EfficientDet' },
  { id: 'faces',         label: 'Face Detector',    activeLabel: 'Stop Face Detect', description: 'Detect faces and key points' },
  { id: 'faceLandmarks', label: 'Face Landmarker',  activeLabel: 'Stop Landmarker',  description: 'Map 468 facial landmarks' },
  { id: 'gesture',       label: 'Hand Gesture',     activeLabel: 'Stop Gesture',     description: 'Recognize hand gestures and skeleton' },
  { id: 'ocr',           label: 'Read Text',        activeLabel: 'Reading…',         description: 'OCR — read text from camera', oneShot: true },
  { id: 'currency',      label: 'Currency Value',   activeLabel: 'Detecting…',       description: 'Identify Indian Rupee notes', oneShot: true },
]

type Props = { user: User }

export function AppPage({ user }: Props) {
  const [cameraOn, setCameraOn]   = useState(false)
  const [activeMode, setActiveMode] = useState<ActiveMode>('idle')
  const [status, setStatus]       = useState<string>('Press Start to begin')
  const [lastSpoken, setLastSpoken] = useState<string>('')
  const [voiceStatus, setVoiceStatus] = useState<string>('Voice readying…')
  const [, setInstallPrompt] = useState<any>(null)

  const cameraRef    = useRef<CameraViewHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { startSession, endSession, logDetection } = useDetectionLogger(user)

  const controls = useMemo(() => ({
    onStatus: (s: string) => setStatus(s),
    onSpeak: (text: string) => {
      setLastSpoken(text)
      speak(text)
      if (text.includes('rupee') || text.includes('currency'))
        logDetection('currency', text)
      else if (text.includes('sign') || text.includes('hand') || text.includes('fist') || text.includes('palm') || text.includes('gesture'))
        logDetection('gesture', text)
      else if (text.includes('face') || text.includes('landmark'))
        logDetection('face', text)
      else
        logDetection('ocr', text)
    },
  }), [logDetection])

  // ─── Voice commands ──────────────────────────────────────────────────────────
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setVoiceStatus('Voice not supported'); return }

    const rec: any = new SR()
    rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US'
    rec.onstart = () => setVoiceStatus('Listening…')
    rec.onerror = () => setVoiceStatus('Mic error — retrying…')
    rec.onend   = () => { try { rec.start() } catch { /* ignore */ } }
    rec.onresult = (event: any) => {
      const t = event.results[event.results.length - 1][0].transcript.toLowerCase().trim()
      setVoiceStatus(`Heard: "${t}"`)
      if (t.includes('start'))                                         { handleStart(); speak('Camera started') }
      else if (t.includes('stop'))                                     { stopAll(); speak('Stopped') }
      else if (t.includes('object') || t.includes('detect'))          toggleFeature('objects')
      else if (t.includes('face landmark') || t.includes('landmark')) toggleFeature('faceLandmarks')
      else if (t.includes('face'))                                     toggleFeature('faces')
      else if (t.includes('gesture') || t.includes('hand'))           toggleFeature('gesture')
      else if (t.includes('read text') || t.includes('read'))         toggleFeature('ocr')
      else if (t.includes('currency') || t.includes('money'))         toggleFeature('currency')
    }
    try { rec.start() } catch { /* ignore */ }
    return () => { try { rec.onend = null; rec.stop() } catch { /* ignore */ } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, cameraOn])

  // ─── PWA install ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  function toggleFeature(id: ActiveMode) {
    if (!cameraOn) return
    if (id === 'ocr')      { cameraRef.current?.readText(); return }
    if (id === 'currency') { cameraRef.current?.detectCurrencyFromCamera(); return }
    const next: ActiveMode = activeMode === id ? 'idle' : id
    setActiveMode(next)
    cameraRef.current?.setMode(next)
  }

  function handleUploadClick() { fileInputRef.current?.click() }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await cameraRef.current?.detectCurrencyFromFile(file)
  }

  function handleStart() { setCameraOn(true); startSession() }

  function stopAll() {
    setCameraOn(false)
    setActiveMode('idle')
    stopSpeaking()
    cameraRef.current?.setMode('idle')
    endSession()
  }

  const currencySelected = activeMode === 'currency'

  return (
    <main className="appMain">

      {/* ── Camera ── */}
      <section className="card cameraCard">
        <ErrorBoundary label="Camera" onError={(e) => setStatus(`Camera error: ${e.message}`)}>
          <Suspense fallback={<div className="cameraWrap" style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>Loading camera…</div>}>
            <CameraView
              ref={cameraRef}
              isDetecting={cameraOn}
              onStatus={controls.onStatus}
              onSpeak={controls.onSpeak}
            />
          </Suspense>
        </ErrorBoundary>
      </section>

      {/* ── Controls ── */}
      <section className="card controlsCard" aria-label="Controls">
        <div className="statusRow">
          <div className="statusLabel">Status</div>
          <div className="statusValue" aria-live="polite">{status}</div>
        </div>
        <div className="statusRow">
          <div className="statusLabel">Voice</div>
          <div className="statusValue" aria-live="polite">{voiceStatus}</div>
        </div>

        <div className="buttonRow">
          <button className="btn" onClick={handleStart} disabled={cameraOn}>Start camera</button>
          <button className="btn" onClick={stopAll} disabled={!cameraOn}>Stop all</button>
        </div>

        <div className="featureGrid">
          {FEATURES.map((f) => {
            const isActive = activeMode === f.id
            return (
              <button
                key={f.id}
                className={`featureBtn${isActive ? ' featureBtn--active' : ''}`}
                onClick={() => toggleFeature(f.id)}
                disabled={!cameraOn}
                title={f.description}
              >
                <span className="featureBtnLabel">{isActive && !f.oneShot ? f.activeLabel : f.label}</span>
                <span className="featureBtnDesc">{f.description}</span>
              </button>
            )
          })}
        </div>

        {currencySelected && (
          <div className="currencyUploadRow">
            <span className="currencyUploadLabel">Or detect from an image:</span>
            <button className="btn uploadBtn" onClick={handleUploadClick} disabled={!cameraOn}>
              📁 Upload image
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} aria-label="Upload currency image" />
          </div>
        )}

        <div className="statusRow" style={{ marginTop: 4 }}>
          <div className="statusLabel">Last spoken</div>
          <div className="statusValue" aria-live="polite">{lastSpoken || '—'}</div>
        </div>
      </section>
    </main>
  )
}
