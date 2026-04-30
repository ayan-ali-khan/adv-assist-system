import { useEffect, useMemo, useRef, useState } from 'react'
import { Hands } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'

export type HandLandmark = {
  x: number
  y: number
  z: number
}

export type HandLandmarks = HandLandmark[]

export type MediaPipeHandsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; hands: Hands; camera: Camera | null }
  | { status: 'error'; error: string }

export function useMediaPipeHands(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isEnabled: boolean,
  onLandmarks: (landmarks: HandLandmarks[]) => void,
) {
  const [state, setState] = useState<MediaPipeHandsState>({ status: 'idle' })
  const handsRef = useRef<Hands | null>(null)
  const cameraRef = useRef<Camera | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!isEnabled) {
        setState({ status: 'idle' })
        return
      }

      setState({ status: 'loading' })

      try {
        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
          },
        })

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

        hands.onResults((results) => {
          if (cancelled) return

          const landmarks: HandLandmarks[] = []
          if (results.multiHandLandmarks) {
            for (const handLandmarks of results.multiHandLandmarks) {
              const normalized: HandLandmark[] = handLandmarks.map((lm) => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
              }))
              landmarks.push(normalized)
            }
          }
          onLandmarks(landmarks)
        })

        const videoEl = videoRef.current
        if (!videoEl) {
          throw new Error('Video element not available')
        }

        const camera = new Camera(videoEl, {
          onFrame: async () => {
            if (cancelled || !handsRef.current) return
            await handsRef.current.send({ image: videoEl })
          },
          width: 1280,
          height: 720,
        })

        await camera.start()

        if (!cancelled) {
          handsRef.current = hands
          cameraRef.current = camera
          setState({ status: 'ready', hands, camera })
        } else {
          camera.stop()
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to initialize MediaPipe Hands'
        if (!cancelled) setState({ status: 'error', error: msg })
      }
    }

    init()

    return () => {
      cancelled = true
      if (cameraRef.current) {
        cameraRef.current.stop()
        cameraRef.current = null
      }
      if (handsRef.current) {
        handsRef.current.close()
        handsRef.current = null
      }
    }
  }, [isEnabled, videoRef, onLandmarks])

  return useMemo(() => state, [state])
}
