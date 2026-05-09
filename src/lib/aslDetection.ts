const API_KEY = import.meta.env.VITE_ROBOFLOW_API_KEY as string

const MODEL_URL = '/roboflow-infer/american-sign-language-letters/6'

// All 26 ASL static-hand letters
// const ASL_CLASSES = 'A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z'

export type ASLPrediction = {
  letter: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

export type ASLResult = {
  predictions: ASLPrediction[]
  best: ASLPrediction | null
  _raw?: unknown
}

/** Capture current video frame as base64 JPEG (no data-URL prefix) */
export function videoFrameToBase64(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas')
  canvas.width  = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}

/** Walk an unknown object tree looking for an array of prediction-like objects */
// function extractPredictions(obj: unknown, depth = 0): any[] {
//   if (depth > 6 || obj === null || typeof obj !== 'object') return []

//   // If it's an array and looks like predictions, return it
//   if (Array.isArray(obj)) {
//     const hasPredShape = obj.some(
//       (item) => item && typeof item === 'object' && ('class' in item || 'label' in item || 'letter' in item)
//     )
//     if (hasPredShape) return obj
//     // Recurse into array elements
//     for (const item of obj) {
//       const found = extractPredictions(item, depth + 1)
//       if (found.length > 0) return found
//     }
//     return []
//   }

//   // Recurse into object values — prioritise keys that sound like predictions
//   const priority = ['predictions', 'detections', 'results', 'outputs', 'classes']
//   const record = obj as Record<string, unknown>

//   for (const key of priority) {
//     if (key in record) {
//       const found = extractPredictions(record[key], depth + 1)
//       if (found.length > 0) return found
//     }
//   }

//   // Fall back to all keys
//   for (const val of Object.values(record)) {
//     const found = extractPredictions(val, depth + 1)
//     if (found.length > 0) return found
//   }

//   return []
// }

/** Normalise a raw prediction item into ASLPrediction */
function normalisePred(p: any): ASLPrediction | null {
  // class name could be in .class, .label, .letter, .class_name
  const rawClass: string =
    p.class ?? p.label ?? p.letter ?? p.class_name ?? p.category ?? ''
  if (!rawClass) return null

  const letter = rawClass.toUpperCase().trim().charAt(0)
  if (!/^[A-Z]$/.test(letter)) return null

  const confidence: number =
    typeof p.confidence === 'number' ? p.confidence :
    typeof p.score      === 'number' ? p.score      : 0

  return {
    letter,
    confidence,
    x:      p.x      ?? p.bbox?.x      ?? 0,
    y:      p.y      ?? p.bbox?.y      ?? 0,
    width:  p.width  ?? p.bbox?.width  ?? 0,
    height: p.height ?? p.bbox?.height ?? 0,
  }
}

export async function detectASLFromFrame(video: HTMLVideoElement): Promise<ASLResult> {
  if (!API_KEY) throw new Error('VITE_ROBOFLOW_API_KEY is not set in .env')
  if (!video.videoWidth) throw new Error('Video not ready')

  const base64Image = videoFrameToBase64(video)

  let response: Response
  try {
    response = await fetch(`${MODEL_URL}?api_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: base64Image,  // raw base64, no data:image/jpeg prefix
    })
  } catch (networkErr) {
    throw new Error(`Network error: ${(networkErr as Error).message}`)
  }

  if (!response.ok) {
    let body = ''
    try { body = await response.text() } catch { /* ignore */ }
    throw new Error(`Roboflow ${response.status}: ${body.slice(0, 200)}`)
  }

  const json = await response.json()
  console.debug('[ASL] raw response:', json)

  // This model returns { predictions: [{class, confidence, x, y, width, height}] }
  const rawPreds: any[] = json.predictions ?? []

  const predictions: ASLPrediction[] = rawPreds
    .map(normalisePred)
    .filter((p): p is ASLPrediction => p !== null)

  const best = predictions.length > 0
    ? predictions.reduce((a, b) => b.confidence > a.confidence ? b : a)
    : null

  return { predictions, best, _raw: json }
}
