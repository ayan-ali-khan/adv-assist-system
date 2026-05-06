import { useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

async function upsertProfile(u: User) {
  try {
    await setDoc(
      doc(db, 'users', u.uid),
      {
        displayName: u.displayName ?? u.email ?? 'User',
        email:       u.email ?? null,
        lastSeen:    serverTimestamp(),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[Auth] upsertProfile failed:', e)
  }
}

export function useAuth() {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setLoading(false)
      if (u) await upsertProfile(u)
    })
    return unsub
  }, [])

  const signUpEmail = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    const updatedUser = { ...cred.user, displayName } as User
    setUser(updatedUser)
    await setDoc(
      doc(db, 'users', cred.user.uid),
      {
        displayName,
        email,
        createdAt: serverTimestamp(),
        lastSeen:  serverTimestamp(),
      },
      { merge: true },
    )
  }

  const signInEmail = async (email: string, password: string): Promise<void> => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    setUser(result.user)
  }

  const signInGoogle = async (): Promise<void> => {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)
    // Set user immediately — don't wait for onAuthStateChanged to fire
    setUser(result.user)
    await upsertProfile(result.user)
  }

  const logOut = async () => {
    await signOut(auth)
    setUser(null)
  }

  return { user, loading, signUpEmail, signInEmail, signInGoogle, logOut }
}
