import { useEffect, useMemo, useRef, useState } from 'react'

export type CameraState = {
  stream: MediaStream | null
  error: string | null
  isReady: boolean
}

export function useCamera(isEnabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<CameraState>({ stream: null, error: null, isReady: false })

  useEffect(() => {
    let cancelled = false

    async function start() {
      setState({ stream: null, error: null, isReady: false })
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        const el = videoRef.current
        if (!el) throw new Error('Video element not mounted')
        el.srcObject = stream
        await new Promise<void>((resolve) => {
          el.onloadedmetadata = () => resolve()
        })

        if (!cancelled) setState({ stream, error: null, isReady: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to access camera'
        if (!cancelled) setState({ stream: null, error: msg, isReady: false })
      }
    }

    function stop() {
      setState((s) => {
        s.stream?.getTracks().forEach((t) => t.stop())
        return { stream: null, error: null, isReady: false }
      })
      const el = videoRef.current
      if (el) el.srcObject = null
    }

    if (isEnabled) start()
    else stop()

    return () => {
      cancelled = true
      stop()
    }
  }, [isEnabled])

  return useMemo(
    () => ({
      videoRef,
      ...state,
    }),
    [state],
  )
}

