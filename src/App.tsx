import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CameraView, type CameraViewHandle } from './components/CameraView'
import { ASLRecognizer } from './components/ASLRecognizer'
import { SignDisplay } from './components/SignDisplay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { speak, stopSpeaking } from './lib/speech'
import { useTheme } from './hooks/useTheme'

function App() {
  const [isDetecting, setIsDetecting]     = useState(false)
  const [status, setStatus]               = useState<string>('Ready')
  const [lastSpoken, setLastSpoken]       = useState<string>('')
  const [voiceStatus, setVoiceStatus]     = useState<string>('Voice readying…')
  const [signFromText, setSignFromText]   = useState<string>('')
  const [signFromSpeech, setSignFromSpeech] = useState<string>('')
  const [isASLEnabled, setIsASLEnabled]   = useState(false)
  const [aslRecognized, setAslRecognized] = useState<string>('')
  const [isHandActive, setIsHandActive]   = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const cameraRef = useRef<CameraViewHandle | null>(null)
  const { theme, toggleTheme } = useTheme()

  const controls = useMemo(
    () => ({
      onStatus: (s: string) => setStatus(s),
      onSpeak: (text: string) => {
        setLastSpoken(text)
        speak(text)
      },
    }),
    [],
  )

  // ─── Voice commands ──────────────────────────────────────────────────────────
  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition
    if (!SR) {
      setVoiceStatus('Voice control not supported in this browser')
      return
    }

    const rec: any = new SR()
    rec.continuous      = true
    rec.interimResults  = false
    rec.lang            = 'en-US'

    rec.onstart = () => setVoiceStatus('Listening for: start, stop, read, describe, currency')
    rec.onerror = () => setVoiceStatus('Mic error — retrying…')
    rec.onend   = () => {
      try { rec.start() } catch { /* ignore */ }
    }

    rec.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim()
      setVoiceStatus(`Heard: "${transcript}"`)

      if (transcript.includes('start')) {
        setIsDetecting(true)
        speak('Starting detection')
      } else if (transcript.includes('stop')) {
        setIsDetecting(false)
        stopSpeaking()
        speak('Detection stopped')
      } else if (transcript.includes('read text') || transcript.includes('read')) {
        cameraRef.current?.readText()
      } else if (transcript.includes('describe')) {
        cameraRef.current?.describeScene()
      } else if (transcript.includes('currency')) {
        cameraRef.current?.detectCurrency()
      } else if (transcript.includes('hand') || transcript.includes('gesture')) {
        cameraRef.current?.handGesture()
      } else {
        // Any other phrase → show its sign representation
        setSignFromSpeech(transcript)
      }
    }

    try { rec.start() } catch { /* ignore */ }

    return () => {
      try {
        rec.onend = null
        rec.stop()
      } catch { /* ignore */ }
    }
  }, [isDetecting])

  // ─── PWA install prompt ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallButton(true)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    ;(installPrompt as any).prompt()
    const { outcome } = await (installPrompt as any).userChoice
    if (outcome === 'accepted') {
      setShowInstallButton(false)
      speak('App installed successfully')
    }
    setInstallPrompt(null)
  }

  // Sign display text: prefer typed, fall back to captured speech
  const signDisplayText = signFromText || signFromSpeech

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="appHeaderLeft">
          <div className="appTitle">Advance Assistance System</div>
          <div className="appSubtitle">
            Object detection · OCR · Currency · Hand gesture · ASL recognition
          </div>
        </div>
        <div className="appHeaderRight">
          <button
            className="themeToggle"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle light/dark theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {showInstallButton && (
            <button
              className="installBtn"
              onClick={handleInstall}
              aria-label="Install app"
              title="Install app to home screen"
            >
              📱 Install
            </button>
          )}
        </div>
      </header>

      <main className="appMain">
        {/* ── Camera ── */}
        <section className="card cameraCard">
          <ErrorBoundary label="Camera" onError={(e) => setStatus(`Camera error: ${e.message}`)}>
            <CameraView
              ref={cameraRef}
              isDetecting={isDetecting}
              onStatus={controls.onStatus}
              onSpeak={controls.onSpeak}
            />
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
            <button className="btn" onClick={() => setIsDetecting(true)}  disabled={isDetecting}>Start</button>
            <button className="btn" onClick={() => { setIsDetecting(false); stopSpeaking() }} disabled={!isDetecting}>Stop</button>
          </div>

          <div className="buttonRow">
            <button
              className="btn"
              onClick={() => {
                if (!isDetecting) setIsDetecting(true)
                cameraRef.current?.readText()
              }}
            >
              Read text
            </button>
            <button
              className="btn"
              onClick={() => {
                if (!isDetecting) setIsDetecting(true)
                cameraRef.current?.describeScene()
              }}
            >
              Describe scene
            </button>
          </div>

          <div className="buttonRow">
            <button
              className="btn"
              onClick={() => {
                if (!isDetecting) setIsDetecting(true)
                cameraRef.current?.detectCurrency()
              }}
            >
              Currency value
            </button>
            <button
              className="btn"
              onClick={() => {
                if (!isDetecting) setIsDetecting(true)
                cameraRef.current?.handGesture()
                setIsHandActive((prev) => !prev)
              }}
              style={isHandActive ? { background: '#00e676', color: '#000', borderColor: '#00e676' } : {}}
            >
              {isHandActive ? 'Stop hand' : 'Hand gesture'}
            </button>
          </div>

          <div className="hint">
            Tip: on mobile, allow camera permission and keep the phone steady for best results.
          </div>

          <div className="statusRow">
            <div className="statusLabel">Last spoken</div>
            <div className="statusValue" aria-live="polite">{lastSpoken || '—'}</div>
          </div>
        </section>

        {/* ── Sign panel ── */}
        <section className="card signCard" aria-label="Sign language tools">

          {/* Text → Sign */}
          <div className="signSection">
            <div className="signHeader">Text / speech → ASL fingerspelling</div>

            <div className="signRow">
              <input
                className="signInput"
                type="text"
                placeholder="Type a phrase to fingerspell (A-Z)"
                onChange={(e) => setSignFromText(e.target.value)}
              />
            </div>

            {signFromSpeech && !signFromText && (
              <>
                <div className="signLabel">From voice (last phrase that was not a command):</div>
                <div className="signSurface" aria-live="polite">{signFromSpeech}</div>
              </>
            )}

            <div className="signLabel" style={{ marginTop: '10px' }}>
              Fingerspelling {signDisplayText ? `"${signDisplayText.slice(0, 20).toUpperCase()}"` : '(awaiting input)'}:
            </div>

            {/* ← SignDisplay replaces the plain char grid */}
            <SignDisplay text={signDisplayText} />
          </div>

          {/* Camera → ASL text */}
          <div className="signSection">
            <div className="signHeader">Camera → ASL recognition (A-Z)</div>
            <div className="buttonRow" style={{ marginBottom: '12px' }}>
              <button
                className="btn"
                onClick={() => {
                  if (!isASLEnabled && !isDetecting) setIsDetecting(true)
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
                <ASLRecognizer
                  videoRef={cameraRef.current.getVideoRef()!}
                  isEnabled={isASLEnabled}
                  onRecognized={(letter) => setAslRecognized((prev) => prev + letter)}
                  onStatus={(s) => setStatus(s)}
                />
              </ErrorBoundary>
            )}

            {aslRecognized && (
              <div style={{ marginTop: '12px' }}>
                <div className="signLabel">Recognized ASL text:</div>
                <div className="signSurface">{aslRecognized}</div>
                <button
                  className="btn"
                  onClick={() => {
                    setAslRecognized('')
                    speak('ASL text cleared')
                  }}
                  style={{ marginTop: '8px' }}
                >
                  Clear ASL text
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