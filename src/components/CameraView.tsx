import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useCocoSsd } from '../hooks/useCocoSsd'
import { createWorker, PSM } from 'tesseract.js'
import { GestureRecognizer, FilesetResolver, type GestureRecognizerResult } from '@mediapipe/tasks-vision'

type Props = {
  isDetecting: boolean
  onStatus: (s: string) => void
  onSpeak: (text: string) => void
}

type Detected = {
  bbox: [number, number, number, number]
  className: string
  score: number
}

// Every connection in MediaPipe 21-landmark hand graph
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [0, 9], [9, 10], [10, 11], [11, 12],  // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17],            // palm cross-bar
]

// Active "mode" so COCO loop knows when to stand down
type Mode = 'coco' | 'ocr' | 'currency' | 'hand' | 'idle'

export type CameraViewHandle = {
  readText: () => Promise<void>
  describeScene: () => Promise<void>
  detectCurrency: () => Promise<void>
  handGesture: () => Promise<void>
  getVideoRef: () => React.RefObject<HTMLVideoElement | null> | null
}

export const CameraView = forwardRef<CameraViewHandle, Props>(function CameraView(
  { isDetecting, onStatus, onSpeak },
  ref,
) {
  // Two separate canvases: one for COCO boxes, one for hand skeleton
  const cocoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const handCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const camera = useCamera(isDetecting)
  const coco = useCocoSsd(isDetecting)
  const lastAnnounceRef = useRef<number>(0)
  const lastResultsRef = useRef<Detected[]>([])
  const ocrWorkerRef = useRef<any>(null)
  const isBusyRef = useRef(false)
  const handDetectorRef = useRef<GestureRecognizer | null>(null)
  const modeRef = useRef<Mode>('idle')
  const lastGestureRef = useRef<string>('')

  const status = useMemo(() => {
    if (!isDetecting) return 'Idle'
    if (camera.error) return `Camera error: ${camera.error}`
    if (coco.status === 'error') return `Model error: ${coco.error}`
    if (coco.status === 'loading') return 'Loading model…'
    if (!camera.isReady) return 'Starting camera…'
    if (coco.status === 'ready') return 'Detecting…'
    return 'Starting…'
  }, [camera.error, camera.isReady, coco, isDetecting])

  useEffect(() => onStatus(status), [onStatus, status])

  // ─── Helper: sync a canvas size to the video ────────────────────────────────
  function syncCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
  }

  // ─── COCO-SSD render loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDetecting) return
    if (!camera.isReady) return
    if (coco.status !== 'ready') return

    const videoEl = camera.videoRef.current
    const canvasEl = cocoCanvasRef.current
    if (!videoEl || !canvasEl) return

    const ctx = canvasEl.getContext('2d')
    if (!ctx) return

    let cancelled = false
    let raf = 0
    let lastRun = 0
    const minIntervalMs = 250

    const render = async () => {
      raf = requestAnimationFrame(render)
      if (cancelled) return

      // Stand down entirely when another feature has the mic
      if (modeRef.current !== 'coco' && modeRef.current !== 'idle') {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height)
        return
      }

      if (isBusyRef.current) return
      if (!videoEl.videoWidth || !videoEl.videoHeight) return

      syncCanvas(canvasEl, videoEl)

      const now = performance.now()
      if (now - lastRun < minIntervalMs) return
      lastRun = now

      const predictions = await coco.model.detect(videoEl)
      if (cancelled) return

      const results: Detected[] = predictions
        .filter((p) => p.score >= 0.25)
        .slice(0, 10)
        .map((p) => ({
          bbox: [p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]],
          className: p.class,
          score: p.score,
        }))

      lastResultsRef.current = results

      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height)
      ctx.lineWidth = 3
      ctx.font = '16px system-ui'
      ctx.textBaseline = 'top'

      for (const r of results) {
        const [x, y, w, h] = r.bbox
        ctx.strokeStyle = '#ffffff'
        ctx.strokeRect(x, y, w, h)
        const label = `${r.className} ${(r.score * 100).toFixed(0)}%`
        const pad = 6
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(x, y, tw + pad * 2, 22)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, x + pad, y + 3)
      }

      const announceEveryMs = 10_000
      if (results.length > 0 && Date.now() - lastAnnounceRef.current > announceEveryMs) {
        lastAnnounceRef.current = Date.now()
        const unique = [...new Set(results.slice(0, 5).map((r) => r.className))]
        onSpeak(`I can see ${unique.join(', ')}`)
      }
    }

    modeRef.current = 'coco'
    raf = requestAnimationFrame(render)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      modeRef.current = 'idle'
      const c = cocoCanvasRef.current
      if (c) {
        const clear = c.getContext('2d')
        if (clear) clear.clearRect(0, 0, c.width, c.height)
      }
      lastResultsRef.current = []
    }
  }, [camera.isReady, camera.videoRef, coco, isDetecting, onSpeak])

  // ─── Frame grabber (for OCR / currency) ─────────────────────────────────────
  async function grabFrameAsCanvas() {
    const videoEl = camera.videoRef.current
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      throw new Error('Camera not ready')
    }
    const scale = 1.5
    const off = document.createElement('canvas')
    off.width = Math.floor(videoEl.videoWidth * scale)
    off.height = Math.floor(videoEl.videoHeight * scale)
    const ctx = off.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.imageSmoothingEnabled = true
    ctx.filter = 'grayscale(1) contrast(1.35) brightness(1.05)'
    ctx.drawImage(videoEl, 0, 0, off.width, off.height)
    return off
  }

  // ─── Shared OCR worker init ──────────────────────────────────────────────────
  async function ensureOcrWorker() {
    if (ocrWorkerRef.current) return
    onStatus('Initializing OCR…')
    const worker = await createWorker(['eng', 'hin'], 1, {
      logger: (m: any) => {
        if (typeof m?.progress === 'number' && m.status) {
          onStatus(`${m.status} ${(m.progress * 100).toFixed(0)}%`)
        }
      },
    })
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    })
    ocrWorkerRef.current = worker
  }

  // ─── Read Text ───────────────────────────────────────────────────────────────
  async function handleReadText() {
    await runExclusive('ocr', async () => {
      try {
        await ensureOcrWorker()
        const canvas = await grabFrameAsCanvas()
        onStatus('Reading text…')
        const { data } = await ocrWorkerRef.current.recognize(canvas)
        const text = data.text?.replace(/\s+/g, ' ').trim()
        if (text && text.length > 3) {
          onSpeak(text.slice(0, 300))
          onStatus('Text read')
        } else {
          onSpeak('No readable text found')
          onStatus('No text found')
        }
      } catch (e) {
        console.error(e)
        onSpeak('Could not read text')
        onStatus(e instanceof Error ? e.message : 'Text read error')
      }
    })
  }

  // ─── Describe Scene ──────────────────────────────────────────────────────────
  async function handleDescribeScene() {
    await runExclusive('idle', async () => {
      const items = lastResultsRef.current
      if (!items.length) {
        onSpeak('No objects detected right now')
        return
      }
      const top = [...new Set(items.map((r) => r.className))].slice(0, 6)
      const sentence =
        top.length === 1
          ? `I can see a ${top[0]}.`
          : `I can see ${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}.`
      onSpeak(sentence)
    })
  }

  // ─── Currency Detection ──────────────────────────────────────────────────────
  async function handleDetectCurrency() {
    await runExclusive('currency', async () => {
      try {
        onStatus('Looking for currency…')
        await ensureOcrWorker()
        const canvas = await grabFrameAsCanvas()
        const { data } = await ocrWorkerRef.current.recognize(canvas)
        const raw = (data.text ?? '').toLowerCase()
        const normalized = raw.replace(/[\s\n\r]+/g, ' ')

        type Candidate = { note: string; patterns: RegExp[] }
        const candidates: Candidate[] = [
          { note: '10',   patterns: [/₹\s*10\b/, /\b10\b(?!\d)/, /\bten\b/] },
          { note: '20',   patterns: [/₹\s*20\b/, /\b20\b(?!\d)/, /\btwenty\b/] },
          { note: '50',   patterns: [/₹\s*50\b/, /\b50\b(?!\d)/, /\bfifty\b/] },
          { note: '100',  patterns: [/₹\s*100\b/, /\b100\b(?!\d)/, /\bhundred\b/, /\bone hundred\b/] },
          { note: '200',  patterns: [/₹\s*200\b/, /\b200\b(?!\d)/] },
          { note: '500',  patterns: [/₹\s*500\b/, /\b500\b(?!\d)/, /\bfive hundred\b/] },
          { note: '2000', patterns: [/₹\s*2000\b/, /\b2000\b(?!\d)/, /\btwo thousand\b/] },
        ]

        const scores = candidates.map((c) => {
          let score = 0
          for (const re of c.patterns) {
            if (re.test(normalized)) score += 1
            const all = normalized.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))
            if (all && all.length > 1) score += all.length - 1
          }
          return { note: c.note, score }
        })

        const best = scores.reduce(
          (acc, cur) => (cur.score > acc.score ? cur : acc),
          { note: '', score: 0 } as { note: string; score: number },
        )

        if (best.score >= 2 && best.note) {
          onSpeak(`This looks like a ${best.note} rupee note.`)
          onStatus(`Detected possible ₹${best.note} note`)
        } else {
          onSpeak('I am not confident about the currency value. Please move the note closer and try again.')
          onStatus('Currency not confidently recognised')
        }
      } catch (e) {
        onSpeak('Currency detection failed')
        onStatus(e instanceof Error ? e.message : 'Currency detection error')
      }
    })
  }

  // ─── Hand Gesture ────────────────────────────────────────────────────────────
  async function handleHandGesture() {
    // If already running, stop it
    if (modeRef.current === 'hand') {
      modeRef.current = 'coco'
      onStatus('Hand detection stopped')
      return
    }

    // Don't start if another exclusive task is running
    if (isBusyRef.current) return

    try {
      onStatus('Loading gesture model…')

      if (!handDetectorRef.current) {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        )
        handDetectorRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      }

      const videoEl = camera.videoRef.current
      if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
        throw new Error('Camera not ready')
      }

      const handCanvas = handCanvasRef.current
      if (!handCanvas) throw new Error('Hand canvas not ready')

      const ctx = handCanvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context unavailable')

      // Switch mode — COCO loop will clear its canvas and stand down
      modeRef.current = 'hand'
      onStatus('Hand detection active — show your hand')
      onSpeak('Hand gesture detection started')

      const GESTURE_LABELS: Record<string, string> = {
        None:        'no specific gesture',
        Closed_Fist: 'closed fist',
        Open_Palm:   'open palm',
        Pointing_Up: 'pointing up',
        Thumb_Down:  'thumbs down',
        Thumb_Up:    'thumbs up',
        Victory:     'victory sign',
        ILoveYou:    'I love you sign',
      }

      // ── Continuous rAF loop — runs until mode changes ──────────────
      const runLoop = () => {
        if (modeRef.current !== 'hand') {
          ctx.clearRect(0, 0, handCanvas.width, handCanvas.height)
          return
        }

        // Sync canvas to video every frame
        if (handCanvas.width  !== videoEl.videoWidth)  handCanvas.width  = videoEl.videoWidth
        if (handCanvas.height !== videoEl.videoHeight) handCanvas.height = videoEl.videoHeight

        const W = handCanvas.width
        const H = handCanvas.height

        let result: GestureRecognizerResult
        try {
          result = handDetectorRef.current!.recognizeForVideo(videoEl, performance.now())
        } catch {
          requestAnimationFrame(runLoop)
          return
        }

        ctx.clearRect(0, 0, W, H)

        for (const handLandmarks of result.landmarks) {
          // Draw connections first (underneath dots)
          ctx.strokeStyle = '#00e676'
          ctx.lineWidth   = 2.5
          for (const [i, j] of HAND_CONNECTIONS) {
            const a = handLandmarks[i]
            const b = handLandmarks[j]
            if (!a || !b) continue
            ctx.beginPath()
            ctx.moveTo(a.x * W, a.y * H)
            ctx.lineTo(b.x * W, b.y * H)
            ctx.stroke()
          }

          // Draw landmark dots on top
          for (const p of handLandmarks) {
            ctx.beginPath()
            ctx.arc(p.x * W, p.y * H, 5, 0, 2 * Math.PI)
            ctx.fillStyle   = '#ff1744'
            ctx.fill()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth   = 1.5
            ctx.stroke()
          }
        }

        // Announce gesture (throttled)
        if (result.gestures.length > 0) {
          const topGesture = result.gestures[0][0]
          const side       = result.handedness[0]?.[0]?.categoryName ?? ''
          const label      = GESTURE_LABELS[topGesture.categoryName] ?? topGesture.categoryName
          const statusText = `${side} hand: ${label} (${(topGesture.score * 100).toFixed(0)}%)`
          onStatus(`Gesture: ${statusText}`)

          const nowMs = Date.now()
          if (
            nowMs - lastAnnounceRef.current > 2000 ||
            topGesture.categoryName !== lastGestureRef.current
          ) {
            lastAnnounceRef.current = nowMs
            lastGestureRef.current  = topGesture.categoryName
            onSpeak(statusText)
          }
        } else {
          onStatus('No hand in frame — show your hand')
        }

        requestAnimationFrame(runLoop)
      }

      requestAnimationFrame(runLoop)

    } catch (e) {
      modeRef.current = 'coco'
      onSpeak('Hand gesture detection failed')
      onStatus(e instanceof Error ? e.message : 'Gesture error')
    }
  }

  // ─── Exclusive task runner (OCR / currency only — not hand) ─────────────────
  async function runExclusive(mode: Mode, task: () => Promise<void>) {
    if (isBusyRef.current) return
    isBusyRef.current = true
    const prevMode = modeRef.current
    modeRef.current = mode
    try {
      await task()
    } finally {
      isBusyRef.current = false
      modeRef.current = prevMode
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      readText: handleReadText,
      describeScene: handleDescribeScene,
      detectCurrency: handleDetectCurrency,
      handGesture: handleHandGesture,
      getVideoRef: () => camera.videoRef,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera.videoRef],
  )

  return (
    <div className="cameraWrap">
      <div className="cameraStage" role="group" aria-label="Camera preview">
        <video ref={camera.videoRef} className="cameraVideo" autoPlay muted playsInline />
        {/* COCO-SSD overlay — always present, cleared when hand mode active */}
        <canvas ref={cocoCanvasRef} className="cameraOverlay" />
        {/* Hand skeleton overlay — separate layer, drawn only during hand detection */}
        <canvas ref={handCanvasRef} className="cameraOverlay cameraOverlayHand" />
      </div>

      <div className="cameraFooter">
        <div className="cameraFooterLabel">Detected objects are outlined in white.</div>
        {!isDetecting ? null : camera.error ? (
          <div className="errorText">{camera.error}</div>
        ) : coco.status === 'error' ? (
          <div className="errorText">{coco.error}</div>
        ) : null}
      </div>
    </div>
  )
})