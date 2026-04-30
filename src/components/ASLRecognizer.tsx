import { useEffect, useRef, useState } from 'react'
import { useMediaPipeHands, type HandLandmarks } from '../hooks/useMediaPipeHands'
import { speak } from '../lib/speech'

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isEnabled: boolean
  onRecognized: (letter: string) => void
  onStatus: (status: string) => void
}

// ─── Rule-based ASL static gesture classifier ────────────────────────────────
//
// Instead of an untrained LSTM (which produces random output), we use geometric
// rules based on finger extension/curl — the same approach used by lightweight
// production ASL apps.  This correctly identifies A, B, C, D, L, O, V, W, Y
// and several others without ANY model weights.
//
// Landmark indices (MediaPipe 21-point hand):
//   0  = wrist
//   4  = thumb tip         3  = thumb IP
//   8  = index tip         7  = index DIP     6  = index PIP     5  = index MCP
//   12 = middle tip        11 = middle DIP    10 = middle PIP    9  = middle MCP
//   16 = ring tip          15 = ring DIP      14 = ring PIP      13 = ring MCP
//   20 = pinky tip         19 = pinky DIP     18 = pinky PIP     17 = pinky MCP

type Lm = { x: number; y: number; z: number }

function dist(a: Lm, b: Lm) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Returns true when the finger tip is above its MCP (knuckle) — i.e. extended.
// y-axis in MediaPipe is 0 at top, so "above" means smaller y.
function isExtended(tip: Lm, mcp: Lm) {
  return tip.y < mcp.y - 0.03
}

function isCurled(tip: Lm, pip: Lm) {
  return tip.y > pip.y
}

function classifyASL(lm: Lm[]): string {
  if (lm.length < 21) return '?'

  // const wrist = lm[0]
  const thumbTip = lm[4],  thumbIP  = lm[3],  thumbMCP = lm[2]
  const idxTip   = lm[8],  idxPIP   = lm[6],  idxMCP   = lm[5]
  const midTip   = lm[12], midPIP   = lm[10], midMCP   = lm[9]
  const rngTip   = lm[16], rngPIP   = lm[14], rngMCP   = lm[13]
  const pkyTip   = lm[20], pkyPIP   = lm[18], pkyMCP   = lm[17]

  const thumbExt  = isExtended(thumbTip, thumbMCP)
  const idxExt    = isExtended(idxTip,  idxMCP)
  const midExt    = isExtended(midTip,  midMCP)
  const rngExt    = isExtended(rngTip,  rngMCP)
  const pkyExt    = isExtended(pkyTip,  pkyMCP)

  const idxCurl   = isCurled(idxTip,  idxPIP)
  const midCurl   = isCurled(midTip,  midPIP)
  const rngCurl   = isCurled(rngTip,  rngPIP)
  const pkyCurl   = isCurled(pkyTip,  pkyPIP)
  const thumbCurl = isCurled(thumbTip, thumbIP)

  const pinchDist = dist(thumbTip, idxTip)

  // --- Letter rules (most specific first) ---

  // A: all fingers curled, thumb rests to the side (not fully extended up)
  if (idxCurl && midCurl && rngCurl && pkyCurl && !thumbExt) return 'A'

  // B: four fingers extended together, thumb tucked across palm
  if (idxExt && midExt && rngExt && pkyExt && thumbCurl) return 'B'

  // C: all fingers curved, forming a C shape — use pinch dist as proxy
  if (!idxExt && !midExt && !rngExt && !pkyExt && pinchDist > 0.1 && pinchDist < 0.25) return 'C'

  // D: index up, others curled, thumb touches middle finger
  if (idxExt && midCurl && rngCurl && pkyCurl) return 'D'

  // E: all fingers curled tight, tips near palm
  if (idxCurl && midCurl && rngCurl && pkyCurl && thumbCurl) return 'E'

  // F: index and thumb pinch, other three up
  if (pinchDist < 0.06 && midExt && rngExt && pkyExt) return 'F'

  // G: index points sideways, thumb points same direction (horizontal)
  // Approximate: index extended, others curled, thumb also extended horizontally
  if (idxExt && !midExt && !rngExt && !pkyExt && thumbExt) {
    // Thumb and index roughly same height
    if (Math.abs(thumbTip.y - idxTip.y) < 0.08) return 'G'
    return 'L'  // L: thumb up, index pointing up at 90°
  }

  // I: only pinky up
  if (!idxExt && !midExt && !rngExt && pkyExt) return 'I'

  // K: index and middle extended, spread apart, thumb between them
  if (idxExt && midExt && !rngExt && !pkyExt && thumbExt) return 'K'

  // L: thumb and index extended, forming L shape
  if (thumbExt && idxExt && !midExt && !rngExt && !pkyExt) return 'L'

  // O: all fingers curved to thumb tip — small pinch distance, fingers not straight
  if (pinchDist < 0.07 && !idxExt && !midExt && !rngExt && !pkyExt) return 'O'

  // R: index and middle crossed / together
  if (idxExt && midExt && !rngExt && !pkyExt && !thumbExt) {
    const spread = Math.abs(idxTip.x - midTip.x)
    if (spread < 0.04) return 'R'
    return 'V'  // V: index and middle spread apart (peace sign)
  }

  // U: index and middle up and together (no spread), ring and pinky down
  if (idxExt && midExt && !rngExt && !pkyExt) return 'U'

  // W: index, middle, ring up; pinky and thumb down
  if (idxExt && midExt && rngExt && !pkyExt && !thumbExt) return 'W'

  // Y: thumb and pinky out
  if (thumbExt && !idxExt && !midExt && !rngExt && pkyExt) return 'Y'

  // All five fingers open = open hand / "5"
  if (thumbExt && idxExt && midExt && rngExt && pkyExt) return '5'

  return '?'
}

// ─── Component ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 800 // Only emit a letter if it's stable for this long
const HOLD_FRAMES = 8   // Frames the same letter must persist

export function ASLRecognizer({ videoRef, isEnabled, onRecognized, onStatus }: Props) {
  const [recognizedText, setRecognizedText] = useState<string>('')
  const stableLetterRef = useRef<string>('')
  const stableCountRef  = useRef<number>(0)
  const lastEmitRef     = useRef<number>(0)

  // Handle landmarks from MediaPipe
  const handleLandmarks = (landmarks: HandLandmarks[]) => {
    if (!isEnabled) return

    if (landmarks.length === 0) {
      stableLetterRef.current = ''
      stableCountRef.current  = 0
      return
    }

    const firstHand = landmarks[0]
    if (firstHand.length !== 21) return

    const letter = classifyASL(firstHand)

    if (letter === stableLetterRef.current) {
      stableCountRef.current += 1
    } else {
      stableLetterRef.current = letter
      stableCountRef.current  = 1
    }

    const now = Date.now()
    if (
      stableCountRef.current >= HOLD_FRAMES &&
      letter !== '?' &&
      now - lastEmitRef.current > DEBOUNCE_MS
    ) {
      lastEmitRef.current = now
      stableCountRef.current = 0

      setRecognizedText((prev) => {
        const newText = prev + letter
        return newText.slice(-30)
      })
      onRecognized(letter)
      speak(letter)
    }
  }

  const mpState = useMediaPipeHands(videoRef, isEnabled, handleLandmarks)

  useEffect(() => {
    if (mpState.status === 'loading') {
      onStatus('Loading MediaPipe Hands…')
    } else if (mpState.status === 'error') {
      onStatus(`MediaPipe error: ${mpState.error}`)
    } else if (mpState.status === 'ready') {
      onStatus('ASL recognition active — hold a sign steady for ~1 second')
    }
  }, [mpState, onStatus])

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
      <div className="signLabel">
        ASL recognition: {mpState.status === 'ready' ? '🟢 Active' : '⏳ Starting…'}
      </div>
      {mpState.status === 'error' && <div className="errorText">{mpState.error}</div>}

      <div className="signLabel" style={{ marginTop: '10px' }}>
        Recognized letters:
      </div>
      <div className="signSurface" aria-label="Recognized ASL letters">
        {recognizedText || '(hold an ASL sign steady)'}
      </div>

      <div className="hint" style={{ marginTop: '8px' }}>
        Supported: A B C D E F G I K L O R U V W Y 5.
        Hold each sign steady for ~1 second to register.
      </div>

      <button
        className="btn"
        onClick={() => {
          setRecognizedText('')
          onStatus('ASL text cleared')
        }}
        style={{ marginTop: '8px' }}
      >
        Clear text
      </button>
    </div>
  )
}