import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'
import { createWorker, PSM } from 'tesseract.js'
import {
  FilesetResolver,
  FaceDetector,
  FaceLandmarker,
  GestureRecognizer,
  ObjectDetector,
  type FaceDetectorResult,
  type FaceLandmarkerResult,
  type GestureRecognizerResult,
  type ObjectDetectorResult,
} from '@mediapipe/tasks-vision'
import {
  detectCurrencyFromBase64,
  elementToBase64,
  fileToBase64,
} from '../lib/currencyDetection'
import { detectASLFromFrame, type ASLResult } from '../lib/aslDetection'

// ─── Types ───────────────────────────────────────────────────────────────────

type Props = {
  isDetecting: boolean
  onStatus: (s: string) => void
  onSpeak: (text: string) => void
}

export type ActiveMode = 'idle' | 'objects' | 'faces' | 'faceLandmarks' | 'gesture' | 'ocr' | 'currency' | 'asl'

export type CameraViewHandle = {
  setMode: (mode: ActiveMode) => void
  readText: () => Promise<void>
  detectCurrencyFromCamera: () => Promise<void>
  detectCurrencyFromFile: (file: File) => Promise<void>
  getVideoRef: () => React.RefObject<HTMLVideoElement | null> | null
  activeMode: ActiveMode
}

// MediaPipe hand skeleton connections (21 landmarks)
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

// MediaPipe face mesh connections (subset — contours only for clarity)
// Using the 468-landmark tesselation key edges
const FACE_OVAL: [number, number][] = [
  [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],
  [356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],
  [379,378],[378,400],[400,377],[377,152],[152,148],[148,176],[176,149],
  [149,150],[150,136],[136,172],[172,58],[58,132],[132,93],[93,234],
  [234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10],
]
const FACE_LEFT_EYE: [number, number][] = [
  [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],
  [155,133],[133,173],[173,157],[157,158],[158,159],[159,160],[160,161],[161,246],[246,33],
]
const FACE_RIGHT_EYE: [number, number][] = [
  [362,382],[382,381],[381,380],[380,374],[374,373],[373,390],[390,249],
  [249,263],[263,466],[466,388],[388,387],[387,386],[386,385],[385,384],[384,398],[398,362],
]
const FACE_LIPS: [number, number][] = [
  [61,146],[146,91],[91,181],[181,84],[84,17],[17,314],[314,405],[405,321],
  [321,375],[375,291],[291,61],
  [78,95],[95,88],[88,178],[178,87],[87,14],[14,317],[317,402],[402,318],
  [318,324],[324,308],[308,78],
]
const FACE_NOSE: [number, number][] = [
  [168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,19],[19,94],[94,2],
]

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

// CDN base for MediaPipe WASM
const MP_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'

// ─── Component ───────────────────────────────────────────────────────────────

export const CameraView = forwardRef<CameraViewHandle, Props>(function CameraView(
  { isDetecting, onStatus, onSpeak },
  ref,
) {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null)
  const camera      = useCamera(isDetecting)

  // Active mode — only one runs at a time
  const [activeMode, setActiveModeState] = useState<ActiveMode>('idle')
  const activeModeRef = useRef<ActiveMode>('idle')

  // Lazy-loaded model refs
  const faceDetectorRef    = useRef<FaceDetector | null>(null)
  const faceLandmarkerRef  = useRef<FaceLandmarker | null>(null)
  const gestureRecogRef    = useRef<GestureRecognizer | null>(null)
  const objectDetectorRef  = useRef<ObjectDetector | null>(null)
  const ocrWorkerRef       = useRef<any>(null)
  const lastAnnounceRef    = useRef<number>(0)
  const lastGestureRef     = useRef<string>('')
  const isBusyRef          = useRef(false)

  // Keep ref in sync with state
  function setMode(mode: ActiveMode) {
    activeModeRef.current = mode
    setActiveModeState(mode)
  }

  // Report camera status
  useEffect(() => {
    if (!isDetecting) { onStatus('Idle'); return }
    if (camera.error)  { onStatus(`Camera error: ${camera.error}`); return }
    if (!camera.isReady) { onStatus('Starting camera…'); return }
    if (activeMode === 'idle') onStatus('Camera ready — choose a feature below')
  }, [isDetecting, camera.error, camera.isReady, activeMode, onStatus])

  // Stop all loops when detection is turned off
  useEffect(() => {
    if (!isDetecting) setMode('idle')
  }, [isDetecting])

  // ─── Canvas sync helper ─────────────────────────────────────────────────────
  function syncCanvas(video: HTMLVideoElement) {
    const c = canvasRef.current
    if (!c) return
    if (c.width  !== video.videoWidth)  c.width  = video.videoWidth
    if (c.height !== video.videoHeight) c.height = video.videoHeight
  }

  function clearCanvas() {
    const c = canvasRef.current
    if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }

  // ─── MediaPipe vision resolver (shared) ────────────────────────────────────
  async function getVision() {
    return FilesetResolver.forVisionTasks(MP_WASM)
  }

  // ─── Object Detection loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'objects') { clearCanvas(); return }
    if (!camera.isReady) return

    const videoEl = camera.videoRef.current
    if (!videoEl) return

    let cancelled = false

    async function startLoop() {
      onStatus('Loading object detector…')

      if (!objectDetectorRef.current) {
        const vision = await getVision()
        objectDetectorRef.current = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          scoreThreshold: 0.4,
          maxResults: 10,
        })
      }

      onStatus('Detecting objects…')

      const loop = () => {
        if (cancelled || activeModeRef.current !== 'objects') { clearCanvas(); return }
        if (!videoEl!.videoWidth || !videoEl!.videoHeight) { requestAnimationFrame(loop); return }

        syncCanvas(videoEl!)
        const canvas = canvasRef.current!
        const ctx    = canvas.getContext('2d')!
        const W = canvas.width
        const H = canvas.height

        let result: ObjectDetectorResult
        try {
          result = objectDetectorRef.current!.detectForVideo(videoEl!, performance.now())
        } catch {
          requestAnimationFrame(loop)
          return
        }

        ctx.clearRect(0, 0, W, H)
        ctx.font         = '14px system-ui'
        ctx.textBaseline = 'top'

        for (const det of result.detections) {
          const bb = det.boundingBox
          if (!bb) continue
          const { originX: x, originY: y, width: w, height: h } = bb
          const cat   = det.categories[0]
          const name  = cat?.categoryName ?? 'object'
          const score = cat?.score ?? 0
          const label = `${name} ${(score * 100).toFixed(0)}%`

          // Bounding box — white stroke
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth   = 2.5
          ctx.strokeRect(x, y, w, h)

          // Label pill
          const pad = 5
          const tw  = ctx.measureText(label).width
          ctx.fillStyle = 'rgba(0,0,0,0.72)'
          ctx.fillRect(x, y, tw + pad * 2, 22)
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, x + pad, y + 3)
        }

        // Announce every 8 s
        const count = result.detections.length
        if (count > 0 && Date.now() - lastAnnounceRef.current > 8000) {
          lastAnnounceRef.current = Date.now()
          const names = [...new Set(
            result.detections.slice(0, 5).map(d => d.categories[0]?.categoryName ?? 'object')
          )]
          onSpeak(`I can see ${names.join(', ')}`)
        }

        if (count > 0) {
          onStatus(`${count} object${count > 1 ? 's' : ''} detected`)
        } else {
          onStatus('No objects detected')
        }

        requestAnimationFrame(loop)
      }

      requestAnimationFrame(loop)
    }

    startLoop().catch((e) => onStatus(e instanceof Error ? e.message : 'Object detection error'))
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, camera.isReady])

  // ─── Face Detection loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'faces') { clearCanvas(); return }
    if (!camera.isReady) return

    const videoEl = camera.videoRef.current
    if (!videoEl) return

    let cancelled = false

    async function startLoop() {
      onStatus('Loading face detector…')

      if (!faceDetectorRef.current) {
        const vision = await getVision()
        faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        })
      }

      onStatus('Detecting faces…')

      const loop = () => {
        if (cancelled || activeModeRef.current !== 'faces') { clearCanvas(); return }
        if (!videoEl!.videoWidth || !videoEl!.videoHeight) { requestAnimationFrame(loop); return }

        syncCanvas(videoEl!)
        const canvas = canvasRef.current!
        const ctx    = canvas.getContext('2d')!
        const W = canvas.width
        const H = canvas.height

        let result: FaceDetectorResult
        try {
          result = faceDetectorRef.current!.detectForVideo(videoEl!, performance.now())
        } catch {
          requestAnimationFrame(loop)
          return
        }

        ctx.clearRect(0, 0, W, H)

        for (const det of result.detections) {
          const bb = det.boundingBox
          if (!bb) continue
          const { originX: x, originY: y, width: w, height: h } = bb

          // Bounding box
          ctx.strokeStyle = '#00e5ff'
          ctx.lineWidth   = 2.5
          ctx.strokeRect(x, y, w, h)

          // Confidence label
          const score = det.categories[0]?.score ?? 0
          const label = `Face ${(score * 100).toFixed(0)}%`
          ctx.font         = '14px system-ui'
          ctx.textBaseline = 'top'
          const pad = 5
          const tw  = ctx.measureText(label).width
          ctx.fillStyle = 'rgba(0,0,0,0.7)'
          ctx.fillRect(x, y - 22, tw + pad * 2, 20)
          ctx.fillStyle = '#00e5ff'
          ctx.fillText(label, x + pad, y - 20)

          // Key points (eyes, nose, mouth corners)
          if (det.keypoints) {
            for (const kp of det.keypoints) {
              ctx.beginPath()
              ctx.arc(kp.x * W, kp.y * H, 4, 0, 2 * Math.PI)
              ctx.fillStyle = '#ff1744'
              ctx.fill()
            }
          }
        }

        // Announce
        const count = result.detections.length
        if (count > 0 && Date.now() - lastAnnounceRef.current > 6000) {
          lastAnnounceRef.current = Date.now()
          onSpeak(count === 1 ? 'I can see one face' : `I can see ${count} faces`)
        } else if (count === 0) {
          onStatus('No face detected')
        } else {
          onStatus(`${count} face${count > 1 ? 's' : ''} detected`)
        }

        requestAnimationFrame(loop)
      }

      requestAnimationFrame(loop)
    }

    startLoop().catch((e) => onStatus(e instanceof Error ? e.message : 'Face detection error'))
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, camera.isReady])

  // ─── ASL Detection loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'asl') { clearCanvas(); return }
    if (!camera.isReady) return

    const videoEl = camera.videoRef.current
    if (!videoEl) return

    let cancelled    = false
    let isProcessing = false

    onStatus('ASL detection active — show a hand sign')

    const loop = async () => {
      if (cancelled || activeModeRef.current !== 'asl') { clearCanvas(); return }

      if (!isProcessing && videoEl.videoWidth && videoEl.videoHeight) {
        isProcessing = true
        try {
          const result: ASLResult = await detectASLFromFrame(videoEl)
          if (cancelled || activeModeRef.current !== 'asl') return

          // ── Draw bounding boxes ──────────────────────────────────────────
          syncCanvas(videoEl)
          const canvas = canvasRef.current!
          const ctx    = canvas.getContext('2d')!
          const W = canvas.width
          const H = canvas.height
          ctx.clearRect(0, 0, W, H)

          for (const pred of result.predictions) {
            // Roboflow coords are center-based → convert to top-left
            const x = pred.x - pred.width  / 2
            const y = pred.y - pred.height / 2
            const w = pred.width
            const h = pred.height

            // Box
            ctx.strokeStyle = '#FFD600'
            ctx.lineWidth   = 2.5
            ctx.strokeRect(x, y, w, h)

            // Label background + text
            const label = `${pred.letter}  ${(pred.confidence * 100).toFixed(0)}%`
            ctx.font         = 'bold 18px system-ui'
            ctx.textBaseline = 'bottom'
            const tw = ctx.measureText(label).width
            ctx.fillStyle = 'rgba(0,0,0,0.75)'
            ctx.fillRect(x, y - 26, tw + 12, 26)
            ctx.fillStyle = '#FFD600'
            ctx.fillText(label, x + 6, y - 4)
          }

          // ── Status + voice announce ──────────────────────────────────────
          if (result.best) {
            const { letter, confidence } = result.best
            onStatus(`ASL: ${letter}  (${(confidence * 100).toFixed(0)}%)`)

            const now = Date.now()
            if (
              now - lastAnnounceRef.current > 2000 ||
              letter !== lastGestureRef.current
            ) {
              lastAnnounceRef.current = now
              lastGestureRef.current  = letter
              onSpeak(`Letter ${letter}`)
            }
          } else {
            onStatus('No ASL sign detected — show a hand sign')
            clearCanvas()
          }
        } catch (e) {
          if (!cancelled) onStatus(e instanceof Error ? e.message : 'ASL API error')
        } finally {
          isProcessing = false
        }
      }

      // ~4 fps — avoids hammering the Roboflow API
      if (!cancelled) setTimeout(() => { if (!cancelled) loop() }, 250)
    }

    loop()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, camera.isReady])

  // ─── Face Landmarker loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'faceLandmarks') { clearCanvas(); return }
    if (!camera.isReady) return

    const videoEl = camera.videoRef.current
    if (!videoEl) return

    let cancelled = false

    async function startLoop() {
      onStatus('Loading face landmarker…')

      if (!faceLandmarkerRef.current) {
        const vision = await getVision()
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 4,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        })
      }

      onStatus('Mapping face landmarks…')

      // Helper: draw a set of connections on the canvas
      function drawConnections(
        ctx: CanvasRenderingContext2D,
        lms: { x: number; y: number }[],
        connections: [number, number][],
        W: number,
        H: number,
        color: string,
      ) {
        ctx.strokeStyle = color
        ctx.lineWidth   = 1.2
        for (const [i, j] of connections) {
          const a = lms[i], b = lms[j]
          if (!a || !b) continue
          ctx.beginPath()
          ctx.moveTo(a.x * W, a.y * H)
          ctx.lineTo(b.x * W, b.y * H)
          ctx.stroke()
        }
      }

      const loop = () => {
        if (cancelled || activeModeRef.current !== 'faceLandmarks') { clearCanvas(); return }
        if (!videoEl!.videoWidth || !videoEl!.videoHeight) { requestAnimationFrame(loop); return }

        syncCanvas(videoEl!)
        const canvas = canvasRef.current!
        const ctx    = canvas.getContext('2d')!
        const W = canvas.width
        const H = canvas.height

        let result: FaceLandmarkerResult
        try {
          result = faceLandmarkerRef.current!.detectForVideo(videoEl!, performance.now())
        } catch {
          requestAnimationFrame(loop)
          return
        }

        ctx.clearRect(0, 0, W, H)

        for (const face of result.faceLandmarks) {
          // Draw mesh contours
          drawConnections(ctx, face, FACE_OVAL,      W, H, '#00e5ff')
          drawConnections(ctx, face, FACE_LEFT_EYE,  W, H, '#69ff47')
          drawConnections(ctx, face, FACE_RIGHT_EYE, W, H, '#69ff47')
          drawConnections(ctx, face, FACE_LIPS,      W, H, '#ff6d00')
          drawConnections(ctx, face, FACE_NOSE,      W, H, '#e040fb')

          // Landmark dots (sparse — every 4th point to avoid clutter)
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          for (let i = 0; i < face.length; i += 4) {
            const p = face[i]
            ctx.beginPath()
            ctx.arc(p.x * W, p.y * H, 1.5, 0, 2 * Math.PI)
            ctx.fill()
          }
        }

        const count = result.faceLandmarks.length
        if (count > 0) {
          onStatus(`${count} face${count > 1 ? 's' : ''} — landmarks mapped`)
        } else {
          onStatus('No face detected — look at the camera')
        }

        requestAnimationFrame(loop)
      }

      requestAnimationFrame(loop)
    }

    startLoop().catch((e) => onStatus(e instanceof Error ? e.message : 'Face landmarker error'))
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, camera.isReady])

  // ─── Gesture / Hand skeleton loop ──────────────────────────────────────────
  useEffect(() => {
    if (activeMode !== 'gesture') { clearCanvas(); return }
    if (!camera.isReady) return

    const videoEl = camera.videoRef.current
    if (!videoEl) return

    let cancelled = false

    async function startLoop() {
      onStatus('Loading gesture model…')

      if (!gestureRecogRef.current) {
        const vision = await getVision()
        gestureRecogRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      }

      onStatus('Show your hand to the camera')

      const loop = () => {
        if (cancelled || activeModeRef.current !== 'gesture') {
          clearCanvas()
          return
        }

        if (!videoEl!.videoWidth || !videoEl!.videoHeight) {
          requestAnimationFrame(loop)
          return
        }

        syncCanvas(videoEl!)
        const canvas = canvasRef.current!
        const ctx    = canvas.getContext('2d')!
        const W = canvas.width
        const H = canvas.height

        let result: GestureRecognizerResult
        try {
          result = gestureRecogRef.current!.recognizeForVideo(videoEl!, performance.now())
        } catch {
          requestAnimationFrame(loop)
          return
        }

        ctx.clearRect(0, 0, W, H)

        for (const handLandmarks of result.landmarks) {
          // Connections
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
          // Dots
          for (const p of handLandmarks) {
            ctx.beginPath()
            ctx.arc(p.x * W, p.y * H, 5, 0, 2 * Math.PI)
            ctx.fillStyle   = '#ff1744'
            ctx.fill()
            ctx.strokeStyle = '#fff'
            ctx.lineWidth   = 1.5
            ctx.stroke()
          }
        }

        if (result.gestures.length > 0) {
          const top    = result.gestures[0][0]
          const side   = result.handedness[0]?.[0]?.categoryName ?? ''
          const label  = GESTURE_LABELS[top.categoryName] ?? top.categoryName
          const text   = `${side} hand: ${label} (${(top.score * 100).toFixed(0)}%)`
          onStatus(`Gesture: ${text}`)

          const now = Date.now()
          if (now - lastAnnounceRef.current > 2000 || top.categoryName !== lastGestureRef.current) {
            lastAnnounceRef.current = now
            lastGestureRef.current  = top.categoryName
            onSpeak(text)
          }
        } else {
          onStatus('No hand detected — show your hand')
        }

        requestAnimationFrame(loop)
      }

      requestAnimationFrame(loop)
    }

    startLoop().catch((e) => {
      onStatus(e instanceof Error ? e.message : 'Gesture detection error')
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, camera.isReady])

  // ─── Frame grabber (OCR / currency) ────────────────────────────────────────
  async function grabFrame() {
    const videoEl = camera.videoRef.current
    if (!videoEl || !videoEl.videoWidth) throw new Error('Camera not ready')
    const scale = 1.5
    const off   = document.createElement('canvas')
    off.width   = Math.floor(videoEl.videoWidth  * scale)
    off.height  = Math.floor(videoEl.videoHeight * scale)
    const ctx   = off.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.filter = 'grayscale(1) contrast(1.35) brightness(1.05)'
    ctx.drawImage(videoEl, 0, 0, off.width, off.height)
    return off
  }

  async function ensureOcr() {
    if (ocrWorkerRef.current) return
    onStatus('Initializing OCR…')
    const w = await createWorker(['eng', 'hin'], 1, {
      logger: (m: any) => {
        if (typeof m?.progress === 'number' && m.status)
          onStatus(`${m.status} ${(m.progress * 100).toFixed(0)}%`)
      },
    })
    await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })
    ocrWorkerRef.current = w
  }

  // ─── Read Text (one-shot) ───────────────────────────────────────────────────
  async function handleReadText() {
    if (isBusyRef.current) return
    isBusyRef.current = true
    try {
      await ensureOcr()
      const frame = await grabFrame()
      onStatus('Reading text…')
      const { data } = await ocrWorkerRef.current.recognize(frame)
      const text = data.text?.replace(/\s+/g, ' ').trim()
      if (text && text.length > 3) {
        onSpeak(text.slice(0, 300))
        onStatus('Text read')
      } else {
        onSpeak('No readable text found')
        onStatus('No text found')
      }
    } catch (e) {
      onSpeak('Could not read text')
      onStatus(e instanceof Error ? e.message : 'OCR error')
    } finally {
      isBusyRef.current = false
    }
  }

  // ─── Currency Detection via Roboflow API ───────────────────────────────────
  // Shared result renderer — draws boxes on canvas and speaks the result
  async function runCurrencyDetection(base64: string) {
    onStatus('Sending to Roboflow…')
    const result = await detectCurrencyFromBase64(base64)

    if (!result.best || result.predictions.length === 0) {
      onSpeak('No currency note detected. Hold the note flat and well-lit.')
      onStatus('No currency detected')
      return
    }

    // Draw bounding boxes on the canvas
    const videoEl = camera.videoRef.current
    const canvas  = canvasRef.current
    if (canvas && videoEl) {
      syncCanvas(videoEl)
      const ctx = canvas.getContext('2d')!
      const W   = canvas.width
      const H   = canvas.height
      ctx.clearRect(0, 0, W, H)

      for (const pred of result.predictions) {
        // Roboflow returns center x/y + width/height
        const x = pred.x - pred.width  / 2
        const y = pred.y - pred.height / 2
        const w = pred.width
        const h = pred.height

        ctx.strokeStyle = '#ffd600'
        ctx.lineWidth   = 3
        ctx.strokeRect(x, y, w, h)

        const label = `${pred.class.replace('_', ' ')} ${(pred.confidence * 100).toFixed(0)}%`
        ctx.font         = '15px system-ui'
        ctx.textBaseline = 'top'
        const pad = 5
        const tw  = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.fillRect(x, y, tw + pad * 2, 22)
        ctx.fillStyle = '#ffd600'
        ctx.fillText(label, x + pad, y + 3)
      }
    }

    const denom = result.denomination
    const conf  = ((result.best.confidence) * 100).toFixed(0)
    const text  = denom
      ? `This is a ${denom} rupee note (${conf}% confidence)`
      : `Detected: ${result.best.class.replace(/_/g, ' ')} (${conf}%)`

    onSpeak(text)
    onStatus(text)
  }

  async function handleDetectCurrencyFromCamera() {
    if (isBusyRef.current) return
    isBusyRef.current = true
    try {
      const videoEl = camera.videoRef.current
      if (!videoEl || !videoEl.videoWidth) throw new Error('Camera not ready')
      const base64 = elementToBase64(videoEl)
      await runCurrencyDetection(base64)
    } catch (e) {
      onSpeak('Currency detection failed')
      onStatus(e instanceof Error ? e.message : 'Currency error')
    } finally {
      isBusyRef.current = false
    }
  }

  async function handleDetectCurrencyFromFile(file: File) {
    if (isBusyRef.current) return
    isBusyRef.current = true
    try {
      onStatus('Reading uploaded image…')
      const base64 = await fileToBase64(file)
      await runCurrencyDetection(base64)
    } catch (e) {
      onSpeak('Currency detection failed')
      onStatus(e instanceof Error ? e.message : 'Currency error')
    } finally {
      isBusyRef.current = false
    }
  }

  // ─── Imperative handle ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    setMode,
    readText: handleReadText,
    detectCurrencyFromCamera: handleDetectCurrencyFromCamera,
    detectCurrencyFromFile:   handleDetectCurrencyFromFile,
    getVideoRef: () => camera.videoRef,
    get activeMode() { return activeModeRef.current },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [camera.videoRef])

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cameraWrap">
      <div className="cameraStage" role="group" aria-label="Camera preview">
        <video ref={camera.videoRef} className="cameraVideo" autoPlay muted playsInline />
        <canvas ref={canvasRef} className="cameraOverlay" />
      </div>
      <div className="cameraFooter">
        {camera.error && <div className="errorText">{camera.error}</div>}
      </div>
    </div>
  )
})
