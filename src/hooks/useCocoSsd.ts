import { useEffect, useMemo, useState } from 'react'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import '@tensorflow/tfjs'

export type CocoModelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; model: cocoSsd.ObjectDetection }
  | { status: 'error'; error: string }

export function useCocoSsd(isEnabled: boolean) {
  const [state, setState] = useState<CocoModelState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const model = await cocoSsd.load()
        if (!cancelled) setState({ status: 'ready', model })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load COCO-SSD model'
        if (!cancelled) setState({ status: 'error', error: msg })
      }
    }

    if (isEnabled) load()
    else setState({ status: 'idle' })

    return () => {
      cancelled = true
    }
  }, [isEnabled])

  return useMemo(() => state, [state])
}

