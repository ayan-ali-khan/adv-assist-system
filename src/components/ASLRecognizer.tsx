import { useEffect, useRef, useState } from 'react'
import { speak } from '../lib/speech'
import { detectASLFromFrame, type ASLPrediction } from '../lib/aslDetection'

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isEnabled: boolean
  onRecognized: (letter: string) => void
  onStatus: (status: string) => void
}

// How long (ms) between API calls — keeps cost low and avoids rate limits
const POLL_INTERVAL_MS = 1500
// Minimum confidence to accept a prediction
const MIN_CONFIDENCE   = 0.45
// How many consecutive polls must return the same letter before emitting
const STABLE_POLLS     = 2
// Min ms between emitting the same letter again
const DEBOUNCE_MS      = 900
// How many consecutive errors before stopping the loop
const MAX_ERRORS       = 3

export function ASLRecognizer({ videoRef, isEnabled, onRecognized, onStatus }: Props) {
  const [recognizedText, setRecognizedText] = useState<string>('')
  const [apiStatus, setApiStatus]           = useState<'idle' | 'loading' | 'active' | 'error'>('idle')
  const [apiError, setApiError]             = useState<string>('')
  const [lastPrediction, setLastPrediction] = useState<ASLPrediction | null>(null)

  // Canvas overlay for bounding boxes
  const canvasRef       = useRef<HTMLCanvasElement | null>(null)
  const stableLetterRef = useRef<string>('')
  const stableCountRef  = useRef<number>(0)
  const lastEmitRef     = useRef<number>(0)
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef      = useRef(false)
  const errorCountRef   = useRef(0)

  useEffect(() => {
    if (!isEnabled) {
      runningRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      clearOverlay()
      setApiStatus('idle')
      return
    }

    runningRef.current = true
    errorCountRef.current = 0
    setApiStatus('loading')
    setApiError('')
    onStatus('Connecting to ASL detection API…')

    scheduleNext(0)

    return () => {
      runningRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      clearOverlay()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled])

  function scheduleNext(delayMs: number) {
    timerRef.current = setTimeout(poll, delayMs)
  }

  async function poll() {
    if (!runningRef.current) return

    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) {
      scheduleNext(POLL_INTERVAL_MS)
      return
    }

    try {
      const result = await detectASLFromFrame(video)

      if (!runningRef.current) return

      setApiStatus('active')
      errorCountRef.current = 0  // reset on success
      drawOverlay(result.predictions, video)

      if (result.best && result.best.confidence >= MIN_CONFIDENCE) {
        const letter = result.best.letter
        setLastPrediction(result.best)
        onStatus(`Detected: ${letter} (${(result.best.confidence * 100).toFixed(0)}%)`)

        // Stability check — same letter must appear STABLE_POLLS times in a row
        if (letter === stableLetterRef.current) {
          stableCountRef.current++
        } else {
          stableLetterRef.current = letter
          stableCountRef.current  = 1
        }

        const now = Date.now()
        if (
          stableCountRef.current >= STABLE_POLLS &&
          now - lastEmitRef.current > DEBOUNCE_MS
        ) {
          lastEmitRef.current    = now
          stableCountRef.current = 0
          setRecognizedText((prev) => (prev + letter).slice(-40))
          onRecognized(letter)
          speak(letter)
        }
      } else {
        setLastPrediction(null)
        stableLetterRef.current = ''
        stableCountRef.current  = 0
        onStatus('No sign detected — show your hand clearly')
      }
    } catch (e) {
      if (!runningRef.current) return
      const msg = e instanceof Error ? e.message : 'API error'
      errorCountRef.current++
      setApiError(msg)
      setApiStatus('error')
      onStatus(`ASL error: ${msg}`)

      // Stop polling after too many consecutive errors to avoid spam
      if (errorCountRef.current >= MAX_ERRORS) {
        runningRef.current = false
        onStatus(`ASL stopped after ${MAX_ERRORS} errors. Press Retry.`)
        return
      }
    }

    scheduleNext(POLL_INTERVAL_MS)
  }

  // ─── Canvas overlay ──────────────────────────────────────────────────────────
  function drawOverlay(predictions: ASLPrediction[], video: HTMLVideoElement) {
    const canvas = canvasRef.current
    if (!canvas) return

    // Size canvas to match the video element's display size
    const rect = video.getBoundingClientRect()
    canvas.width  = rect.width
    canvas.height = rect.height

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Roboflow returns pixel coords relative to the original video resolution
    const scaleX = rect.width  / video.videoWidth
    const scaleY = rect.height / video.videoHeight

    for (const pred of predictions) {
      if (pred.confidence < MIN_CONFIDENCE) continue

      const x = (pred.x - pred.width  / 2) * scaleX
      const y = (pred.y - pred.height / 2) * scaleY
      const w = pred.width  * scaleX
      const h = pred.height * scaleY

      ctx.strokeStyle = '#00e676'
      ctx.lineWidth   = 2.5
      ctx.strokeRect(x, y, w, h)

      const label = `${pred.letter}  ${(pred.confidence * 100).toFixed(0)}%`
      ctx.font         = '16px system-ui'
      ctx.textBaseline = 'top'
      const pad = 5
      const tw  = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      ctx.fillRect(x, y, tw + pad * 2, 22)
      ctx.fillStyle = '#00e676'
      ctx.fillText(label, x + pad, y + 3)
    }
  }

  function clearOverlay() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (!isEnabled) {
    return (
      <div className="aslStatus">
        <div className="signLabel">ASL recognition: Off</div>
        <p className="hint">Enable ASL recognition to translate hand signs to speech.</p>
      </div>
    )
  }

  return (
    <div className="aslStatus">
      {/* Canvas overlay — positioned over the video via CSS */}
      <canvas
        ref={canvasRef}
        className="aslOverlay"
        aria-hidden="true"
      />

      <div className="signLabel">
        ASL recognition:{' '}
        {apiStatus === 'active'  ? '🟢 Active'    :
         apiStatus === 'loading' ? '⏳ Connecting…' :
         apiStatus === 'error'   ? '⚠️ Error'      : '⏸ Idle'}
      </div>

      {apiStatus === 'error' && (
        <div style={{ marginTop: 6 }}>
          <div className="errorText">{apiError}</div>
          <button
            className="btn"
            style={{ marginTop: 8, fontSize: 13 }}
            onClick={() => {
              errorCountRef.current = 0
              runningRef.current = true
              setApiStatus('loading')
              setApiError('')
              onStatus('Retrying ASL detection…')
              scheduleNext(0)
            }}
          >
            Retry
          </button>
        </div>
      )}

      {lastPrediction && (
        <div className="aslCurrentSign" aria-live="polite">
          <span className="aslLetter">{lastPrediction.letter}</span>
          <span className="aslConf">{(lastPrediction.confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      <div className="signLabel" style={{ marginTop: 10 }}>Recognized text:</div>
      <div className="signSurface" aria-label="Recognized ASL letters">
        {recognizedText || '(show an ASL sign to the camera)'}
      </div>

      <div className="hint" style={{ marginTop: 8 }}>
        Hold each sign steady. The API checks every ~1.2 seconds and speaks
        confirmed letters aloud.
      </div>

      <button
        className="btn"
        onClick={() => {
          setRecognizedText('')
          setLastPrediction(null)
          onStatus('ASL text cleared')
        }}
        style={{ marginTop: 8 }}
      >
        Clear text
      </button>
    </div>
  )
}
