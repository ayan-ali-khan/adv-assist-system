import { lazy, Suspense, useRef, useState } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { speak } from '../lib/speech'
import type { CameraViewHandle } from '../components/CameraView'
import type { User } from 'firebase/auth'
import { useDetectionLogger } from '../hooks/useDetectionLogger'

const CameraView    = lazy(() => import('../components/CameraView').then(m => ({ default: m.CameraView })))
const ASLRecognizer = lazy(() => import('../components/ASLRecognizer').then(m => ({ default: m.ASLRecognizer })))
const SignDisplay   = lazy(() => import('../components/SignDisplay').then(m => ({ default: m.SignDisplay })))

type Props = { user: User }

export function SignLangPage({ user }: Props) {
  const [cameraOn, setCameraOn]         = useState(false)
  const [status, setStatus]             = useState<string>('Press Start to begin')
  const [isASLEnabled, setIsASLEnabled] = useState(false)
  const [aslRecognized, setAslRecognized] = useState<string>('')
  const [signFromText, setSignFromText] = useState<string>('')
  const [signFromSpeech]                = useState<string>('')

  const cameraRef = useRef<CameraViewHandle | null>(null)
  const { startSession, endSession, logDetection, saveASLTranscript } = useDetectionLogger(user)

  function handleStart() {
    setCameraOn(true)
    startSession()
  }

  function handleStop() {
    setCameraOn(false)
    setIsASLEnabled(false)
    cameraRef.current?.setMode('idle')
    endSession()
  }

  const signDisplayText = signFromText || signFromSpeech

  return (
    <main className="appMain signLangMain">

      {/* ── Camera (left) ── */}
      <section className="card cameraCard">
        <ErrorBoundary label="Camera" onError={(e) => setStatus(`Camera error: ${e.message}`)}>
          <Suspense fallback={<div className="cameraWrap" style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>Loading camera…</div>}>
            <CameraView
              ref={cameraRef}
              isDetecting={cameraOn}
              onStatus={setStatus}
              onSpeak={(text) => speak(text)}
            />
          </Suspense>
        </ErrorBoundary>

        {/* Camera controls below video */}
        <div style={{ padding: '12px', display: 'flex', gap: 10 }}>
          <button className="btn" onClick={handleStart} disabled={cameraOn} style={{ flex: 1 }}>
            Start camera
          </button>
          <button className="btn" onClick={handleStop} disabled={!cameraOn} style={{ flex: 1 }}>
            Stop
          </button>
        </div>

        <div style={{ padding: '0 12px 12px', fontSize: 13, opacity: 0.6 }} aria-live="polite">
          {status}
        </div>
      </section>

      {/* ── Sign Language Panel (right) ── */}
      <section className="card signLangPanel" aria-label="Sign language tools">

        {/* ── ASL Recognition ── */}
        <div className="signSection">
          <div className="signHeader">Camera → ASL Recognition (A–Z)</div>
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
              {isASLEnabled ? 'Stop ASL' : 'Start ASL Recognition'}
            </button>
          </div>

          {isASLEnabled && cameraRef.current?.getVideoRef() && (
            <ErrorBoundary label="ASL Recognizer" onError={(e) => setStatus(`ASL error: ${e.message}`)}>
              <Suspense fallback={<div style={{ opacity: 0.5, fontSize: 13 }}>Loading ASL…</div>}>
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

        {/* ── Fingerspelling Display ── */}
        <div className="signSection">
          <div className="signHeader">Text → ASL Fingerspelling</div>
          <div className="signRow">
            <input
              className="signInput"
              type="text"
              placeholder="Type a phrase to fingerspell (A–Z)"
              onChange={(e) => setSignFromText(e.target.value)}
            />
          </div>
          <div className="signLabel" style={{ marginTop: 10 }}>
            {signDisplayText
              ? `Fingerspelling "${signDisplayText.slice(0, 20).toUpperCase()}":`
              : 'Awaiting input…'}
          </div>
          <Suspense fallback={null}>
            <SignDisplay text={signDisplayText} />
          </Suspense>
        </div>

      </section>
    </main>
  )
}
