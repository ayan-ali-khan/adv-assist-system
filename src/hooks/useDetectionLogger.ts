import { useCallback, useRef } from 'react'
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { User } from 'firebase/auth'

export type LogType = 'gesture' | 'asl' | 'face' | 'ocr' | 'currency'

export function useDetectionLogger(user: User | null) {
  const sessionIdRef = useRef<string | null>(null)

  // ── Start a new session ────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (!user) return
    try {
      const sessionRef = await addDoc(
        collection(db, 'users', user.uid, 'sessions'),
        { startedAt: serverTimestamp(), active: true },
      )
      sessionIdRef.current = sessionRef.id
    } catch (e) {
      console.warn('[Logger] startSession failed:', e)
    }
  }, [user])

  // ── End the current session ────────────────────────────────────────────────
  const endSession = useCallback(async () => {
    if (!user || !sessionIdRef.current) return
    try {
      await updateDoc(
        doc(db, 'users', user.uid, 'sessions', sessionIdRef.current),
        { endedAt: serverTimestamp(), active: false },
      )
    } catch (e) {
      console.warn('[Logger] endSession failed:', e)
    }
    sessionIdRef.current = null
  }, [user])

  // ── Log any detection event ────────────────────────────────────────────────
  const logDetection = useCallback(
    async (type: LogType, result: string, confidence?: number) => {
      if (!user || !sessionIdRef.current) return
      try {
        await addDoc(
          collection(
            db,
            'users', user.uid,
            'sessions', sessionIdRef.current,
            'logs',
          ),
          {
            uid:        user.uid,
            sessionId:  sessionIdRef.current,
            type,
            result,
            confidence: confidence ?? null,
            timestamp:  serverTimestamp(),
          },
        )
      } catch (e) {
        console.warn('[Logger] logDetection failed:', e)
      }
    },
    [user],
  )

  // ── Save full ASL transcript ───────────────────────────────────────────────
  const saveASLTranscript = useCallback(
    async (text: string) => {
      if (!user || !text.trim()) return
      try {
        await addDoc(
          collection(db, 'users', user.uid, 'aslTranscripts'),
          {
            text,
            sessionId: sessionIdRef.current ?? null,
            savedAt:   serverTimestamp(),
          },
        )
      } catch (e) {
        console.warn('[Logger] saveASLTranscript failed:', e)
      }
    },
    [user],
  )

  return { startSession, endSession, logDetection, saveASLTranscript }
}
