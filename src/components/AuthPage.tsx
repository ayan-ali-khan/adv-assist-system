import { useState, type FormEvent } from 'react'

type Props = {
  onSignUpEmail:  (email: string, password: string, name: string) => Promise<void>
  onSignInEmail:  (email: string, password: string) => Promise<void>
  onSignInGoogle: () => Promise<void>
}

type Mode = 'login' | 'register'

export function AuthPage({ onSignUpEmail, onSignInEmail, onSignInGoogle }: Props) {
  const [mode, setMode]         = useState<Mode>('login')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        if (!name.trim()) { setError('Please enter your name'); setBusy(false); return }
        await onSignUpEmail(email.trim(), password, name.trim())
      } else {
        await onSignInEmail(email.trim(), password)
      }
    } catch (err: any) {
      // Map Firebase error codes to friendly messages
      const code: string = err?.code ?? ''
      if (code === 'auth/email-already-in-use')   setError('Email already in use. Try signing in.')
      else if (code === 'auth/invalid-email')      setError('Invalid email address.')
      else if (code === 'auth/weak-password')      setError('Password must be at least 6 characters.')
      else if (code === 'auth/user-not-found' ||
               code === 'auth/wrong-password' ||
               code === 'auth/invalid-credential') setError('Incorrect email or password.')
      else if (code === 'auth/too-many-requests')  setError('Too many attempts. Try again later.')
      else setError(err?.message ?? 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setBusy(true)
    try {
      await onSignInGoogle()
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="authPage">
      <div className="authCard">
        {/* Logo / title */}
        <div className="authLogo">
          <div className="authLogoIcon">👁</div>
          <div className="authLogoTitle">SAARTHI AI</div>
          <div className="authLogoSub">An AI-Powered Inclusive Support System for People with Disabilities</div>
        </div>

        {/* Tab switcher */}
        <div className="authTabs">
          <button
            className={`authTab${mode === 'login' ? ' authTab--active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`authTab${mode === 'register' ? ' authTab--active' : ''}`}
            onClick={() => { setMode('register'); setError('') }}
            type="button"
          >
            Create account
          </button>
        </div>

        {/* Email / password form */}
        <form className="authForm" onSubmit={handleSubmit} noValidate>
          {mode === 'register' && (
            <div className="authField">
              <label className="authLabel" htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                className="authInput"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="authField">
            <label className="authLabel" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="authInput"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="authField">
            <label className="authLabel" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="authInput"
              type="password"
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </div>

          {error && <div className="authError" role="alert">{error}</div>}

          <button className="authSubmitBtn" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Divider */}
        <div className="authDivider"><span>or</span></div>

        {/* Google */}
        <button className="authGoogleBtn" onClick={handleGoogle} disabled={busy} type="button">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  )
}
