import './App.css'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { speak, stopSpeaking } from './lib/speech'
import { useTheme } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'
import { useDetectionLogger } from './hooks/useDetectionLogger'
import type { CameraViewHandle, ActiveMode } from './components/CameraView'
import './components/landingpage.css'

// ─── Lazy-loaded heavy components ─────────────────────────────────────────────
const CameraView    = lazy(() => import('./components/CameraView').then(m => ({ default: m.CameraView })))
const ASLRecognizer = lazy(() => import('./components/ASLRecognizer').then(m => ({ default: m.ASLRecognizer })))
const SignDisplay   = lazy(() => import('./components/SignDisplay').then(m => ({ default: m.SignDisplay })))
const AuthPage      = lazy(() => import('./components/AuthPage').then(m => ({ default: m.AuthPage })))
const LandingPage   = lazy(() => import('./components/LandingPage').then(m => ({ default: m.LandingPage })))

function PageSpinner() {
  return (
    <div className="authPage">
      <div className="authCard" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div className="authLogoIcon" style={{ fontSize: 40 }}>👁</div>
        <div style={{ marginTop: 16, opacity: 0.6 }}>Loading…</div>
      </div>
    </div>
  )
}

// ─── Feature button config ────────────────────────────────────────────────────
type Feature = {
  id: ActiveMode
  label: string
  activeLabel: string
  description: string
  oneShot?: boolean
}

const FEATURES: Feature[] = [
  { id: 'faces',         label: 'Face Detector',   activeLabel: 'Stop Face Detect',  description: 'Detect faces and key points' },
  { id: 'faceLandmarks', label: 'Face Landmarker', activeLabel: 'Stop Landmarker',   description: 'Map 468 facial landmarks' },
  { id: 'gesture',       label: 'Hand Gesture',    activeLabel: 'Stop Gesture',      description: 'Recognize hand gestures and skeleton' },
  { id: 'ocr',           label: 'Read Text',       activeLabel: 'Reading…',          description: 'OCR — read text from camera', oneShot: true },
  { id: 'currency',      label: 'Currency Value',  activeLabel: 'Detecting…',        description: 'Identify Indian Rupee notes', oneShot: true },
]

type Page = 'landing' | 'auth' | 'app'

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [cameraOn, setCameraOn]             = useState(false)
  const [activeMode, setActiveMode]         = useState<ActiveMode>('idle')
  const [status, setStatus]                 = useState<string>('Press Start to begin')
  const [lastSpoken, setLastSpoken]         = useState<string>('')
  const [voiceStatus, setVoiceStatus]       = useState<string>('Voice readying…')
  const [signFromText, setSignFromText]     = useState<string>('')
  const [signFromSpeech, setSignFromSpeech] = useState<string>('')
  const [isASLEnabled, setIsASLEnabled]     = useState(false)
  const [aslRecognized, setAslRecognized]   = useState<string>('')
  const [installPrompt, setInstallPrompt]   = useState<any>(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const [page, setPage]                     = useState<Page>('landing')

  const cameraRef    = useRef<CameraViewHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { theme, toggleTheme } = useTheme()

  // ─── Auth + logging ──────────────────────────────────────────────────────────
  const { user, loading, signUpEmail, signInEmail, signInGoogle, logOut } = useAuth()
  const { startSession, endSession, logDetection, saveASLTranscript } =
    useDetectionLogger(user)

  // ─── Page routing based on auth state ────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (user) {
      // Existing session → go straight to app
      setPage((prev) => prev === 'landing' ? 'app' : prev)
    } else {
      // Logged out → back to landing
      setPage('landing')
    }
  }, [user, loading])

  // ─── onSpeak — log every spoken detection ────────────────────────────────────
  const controls = useMemo(
    () => ({
      onStatus: (s: string) => setStatus(s),
      onSpeak: (text: string) => {
        setLastSpoken(text)
        speak(text)
        if (text.includes('rupee') || text.includes('currency'))
          logDetection('currency', text)
        else if (
          text.includes('sign') || text.includes('hand') ||
          text.includes('fist') || text.includes('palm') ||
          text.includes('gesture')
        )
          logDetection('gesture', text)
        else if (text.includes('face') || text.includes('landmark'))
          logDetection('face', text)
        else
          logDetection('ocr', text)
      },
    }),
    [logDetection],
  )

  // ─── Voice commands ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || page !== 'app') return

    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SR) { setVoiceStatus('Voice not supported'); return }

    const rec: any = new SR()
    rec.continuous     = true
    rec.interimResults = false
    rec.lang           = 'en-US'

    rec.onstart = () => setVoiceStatus('Listening…')
    rec.onerror = () => setVoiceStatus('Mic error — retrying…')
    rec.onend   = () => { try { rec.start() } catch { /* ignore */ } }

    rec.onresult = (event: any) => {
      const t = event.results[event.results.length - 1][0].transcript.toLowerCase().trim()
      setVoiceStatus(`Heard: "${t}"`)

      if (t.includes('start'))                                        { handleStart(); speak('Camera started') }
      else if (t.includes('stop'))                                    { stopAll(); speak('Stopped') }
      else if (t.includes('face landmark') || t.includes('landmark')) toggleFeature('faceLandmarks')
      else if (t.includes('face'))                                    toggleFeature('faces')
      else if (t.includes('gesture') || t.includes('hand'))          toggleFeature('gesture')
      else if (t.includes('read text') || t.includes('read'))        toggleFeature('ocr')
      else if (t.includes('currency') || t.includes('money'))        toggleFeature('currency')
      else setSignFromSpeech(t)
    }

    try { rec.start() } catch { /* ignore */ }
    return () => { try { rec.onend = null; rec.stop() } catch { /* ignore */ } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, cameraOn, user, page])

  // ─── PWA install ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallButton(true)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  // ─── Helpers ─────────────────────────────────────────────────────────────────
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
    setIsASLEnabled(false)
    stopSpeaking()
    cameraRef.current?.setMode('idle')
    endSession()
  }

  function handleSignOut() {
    stopAll()
    logOut()
    // page will be set to 'landing' by the useEffect above when user becomes null
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    ;(installPrompt as any).prompt()
    const { outcome } = await (installPrompt as any).userChoice
    if (outcome === 'accepted') { setShowInstallButton(false); speak('App installed') }
    setInstallPrompt(null)
  }

  const signDisplayText  = signFromText || signFromSpeech
  const currencySelected = activeMode === 'currency'

  // ─── Loading splash ───────────────────────────────────────────────────────────
  if (loading) {
    return <PageSpinner />
  }

  // ─── Landing page ─────────────────────────────────────────────────────────────
  if (page === 'landing') {
    return (
      <Suspense fallback={<PageSpinner />}>
        <LandingPage
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onGetStarted={() => setPage('auth')}
          onGoToApp={() => setPage('app')}
          onSignOut={handleSignOut}
        />
      </Suspense>
    )
  }

  // ─── Auth page ────────────────────────────────────────────────────────────────
  if (page === 'auth' && !user) {
    return (
      <Suspense fallback={<PageSpinner />}>
        <AuthPage
          onSignUpEmail={signUpEmail}
          onSignInEmail={signInEmail}
          onSignInGoogle={signInGoogle}
        />
      </Suspense>
    )
  }

  // ─── Main app ─────────────────────────────────────────────────────────────────
  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="appHeaderLeft">
          <div className="titleRow">
            <div className="titleIcon">
              {/* your icon SVG */}
            </div>
            <span className="appTitle">SAARTHI AI</span>
          </div>
          <div className="appSubtitle">
            An AI-Powered Inclusive Support System for People with Disabilities
          </div>
        </div>

        <div className="appHeaderRight">
          <button className="homeBtn" onClick={() => setPage('landing')}>
            {/* home SVG */}
            Home
          </button>

          <div className="authPill">
            <span className="authName">{user?.displayName || user?.email}</span>
            <div className="authDivider" />
            <button className="authSignOut" onClick={handleSignOut}>Sign out</button>
          </div>

          <button className="iconBtn themeToggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          {showInstallButton && (
            <button className="installBtn" onClick={handleInstall}>
              {/* download SVG */}
              Install
            </button>
          )}
        </div>
      </header>

      <main className="appMain">

        {/* ── Camera ── */}
        <section className="card cameraCard">
          <ErrorBoundary label="Camera" onError={(e) => setStatus(`Camera error: ${e.message}`)}>
            <Suspense fallback={<div className="cameraWrap" style={{minHeight:200,display:'flex',alignItems:'center',justifyContent:'center',opacity:0.5}}>Loading camera…</div>}>
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
            <button className="btn" onClick={handleStart} disabled={cameraOn}>
              Start camera
            </button>
            <button className="btn" onClick={stopAll} disabled={!cameraOn}>
              Stop all
            </button>
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
                  <span className="featureBtnLabel">
                    {isActive && !f.oneShot ? f.activeLabel : f.label}
                  </span>
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
                aria-label="Upload currency image"
              />
            </div>
          )}

          <div className="statusRow" style={{ marginTop: 4 }}>
            <div className="statusLabel">Last spoken</div>
            <div className="statusValue" aria-live="polite">{lastSpoken || '—'}</div>
          </div>
        </section>

        {/* ── Sign panel ── */}
        <section className="card signCard" aria-label="Sign language tools">
          <div className="signSection">
            <div className="signHeader">Text / speech → ASL fingerspelling</div>
            <div className="signRow">
              <input
                className="signInput"
                type="text"
                placeholder="Type a phrase to fingerspell (A–Z)"
                onChange={(e) => setSignFromText(e.target.value)}
              />
            </div>
            {signFromSpeech && !signFromText && (
              <>
                <div className="signLabel">From voice:</div>
                <div className="signSurface" aria-live="polite">{signFromSpeech}</div>
              </>
            )}
            <div className="signLabel" style={{ marginTop: 10 }}>
              {signDisplayText
                ? `Fingerspelling "${signDisplayText.slice(0, 20).toUpperCase()}":`
                : 'Awaiting input…'}
            </div>
            <Suspense fallback={null}>
              <SignDisplay text={signDisplayText} />
            </Suspense>
          </div>

          <div className="signSection">
            <div className="signHeader">Camera → ASL recognition (A–Z)</div>
            <div className="buttonRow" style={{ marginBottom: 12 }}>
              <button
                className="btn"
                onClick={() => {
                  if (!isASLEnabled && !cameraOn) { setCameraOn(true); startSession() }
                  setIsASLEnabled(!isASLEnabled)
                }}
                style={{
                  background: isASLEnabled ? '#fff' : '#000',
                  color:      isASLEnabled ? '#000' : '#fff',
                }}
              >
                {isASLEnabled ? 'Stop ASL' : 'Start ASL recognition'}
              </button>
            </div>

            {isASLEnabled && cameraRef.current?.getVideoRef() && (
              <ErrorBoundary label="ASL Recognizer" onError={(e) => setStatus(`ASL error: ${e.message}`)}>
                <Suspense fallback={<div style={{opacity:0.5,fontSize:13}}>Loading ASL…</div>}>
                  <ASLRecognizer
                    videoRef={cameraRef.current.getVideoRef()!}
                    isEnabled={isASLEnabled}
                    onRecognized={(letter) => {
                      setAslRecognized((prev) => prev + letter)
                      logDetection('asl', letter)
                    }}
                    onStatus={setStatus}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {aslRecognized && (
              <div style={{ marginTop: 12 }}>
                <div className="signLabel">Recognized ASL text:</div>
                <div className="signSurface">{aslRecognized}</div>
                <button
                  className="btn"
                  onClick={() => {
                    saveASLTranscript(aslRecognized)
                    setAslRecognized('')
                    speak('ASL text saved and cleared')
                  }}
                  style={{ marginTop: 8 }}
                >
                  Save &amp; Clear
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
