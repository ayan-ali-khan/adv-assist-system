/**
 * Roboflow Indian Currency Detection
 * Model: detect-indian-currency/1  (mAP 88.7%, Precision 93.4%)
 *
 * Sends a base64-encoded image to the Roboflow hosted API and returns
 * the best prediction.
 */

const API_KEY = import.meta.env.VITE_ROBOFLOW_API_KEY as string

// Proxied through Vite dev server to avoid CORS (see vite.config.ts).
// In production, route /roboflow → https://serverless.roboflow.com via your host.
const API_URL = '/roboflow/detect-indian-currency/1'

export type CurrencyPrediction = {
  class: string        // e.g. "500Rupee_note"
  confidence: number   // 0–1
  x: number
  y: number
  width: number
  height: number
}

export type CurrencyResult = {
  predictions: CurrencyPrediction[]
  /** Best prediction, or null if nothing detected */
  best: CurrencyPrediction | null
  /** Human-readable denomination, e.g. "500" */
  denomination: string | null
}

/** Extract the numeric denomination from a class name like "500Rupee_note" */
function parseDenomination(className: string): string | null {
  const m = className.match(/^(\d+)/)
  return m ? m[1] : null
}

/**
 * Convert an HTMLCanvasElement or HTMLVideoElement to a base64 JPEG string
 * (without the data:image/... prefix — Roboflow wants raw base64).
 */
export function elementToBase64(source: HTMLCanvasElement | HTMLVideoElement): string {
  const canvas = document.createElement('canvas')

  if (source instanceof HTMLVideoElement) {
    canvas.width  = source.videoWidth
    canvas.height = source.videoHeight
    canvas.getContext('2d')!.drawImage(source, 0, 0)
  } else {
    canvas.width  = source.width
    canvas.height = source.height
    canvas.getContext('2d')!.drawImage(source, 0, 0)
  }

  // toDataURL returns "data:image/jpeg;base64,<data>" — strip the prefix
  return canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
}

/**
 * Convert a File (from <input type="file">) to base64.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
  })
}

/**
 * Call the Roboflow API with a raw base64 image string.
 * Returns structured result with all predictions and the best one.
 */
export async function detectCurrencyFromBase64(base64: string): Promise<CurrencyResult> {
  if (!API_KEY) throw new Error('VITE_ROBOFLOW_API_KEY is not set in .env')

  const response = await fetch(`${API_URL}?api_key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: base64,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Roboflow API error ${response.status}: ${text}`)
  }

  const json = await response.json()
  const predictions: CurrencyPrediction[] = (json.predictions ?? []).map((p: any) => ({
    class:      p.class,
    confidence: p.confidence,
    x:          p.x,
    y:          p.y,
    width:      p.width,
    height:     p.height,
  }))

  // Pick highest-confidence prediction
  const best = predictions.length > 0
    ? predictions.reduce((a, b) => b.confidence > a.confidence ? b : a)
    : null

  return {
    predictions,
    best,
    denomination: best ? parseDenomination(best.class) : null,
  }
}
