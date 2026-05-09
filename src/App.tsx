import './App.css'
import './components/landingpage.css'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AppPage } from './pages/AppPage'
import { SignLangPage } from './pages/SignLangPage'
import { speak } from './lib/speech'
import { useTheme } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'

// ─── Lazy-loaded page-level components ────────────────────────────────────────
const LandingPage = lazy(() => import('./components/LandingPage').then(m => ({ default: m.LandingPage })))
const AuthPage    = lazy(() => import('./components/AuthPage').then(m => ({ default: m.AuthPage })))

function PageSpinner() {
  return (
    <div className="authPage">
      <div className="authCard" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div className="authLogoIcon" style={{ fontSize: 40 }}>👁</div>
        <div style={{ marginTop: 16, opacity: 0.6 }}>Loading…</div>
      </div>
    </div>
  )
}

// ─── Root component — handles auth state + routing ────────────────────────────
function App() {
  const { user, loading, signUpEmail, signInEmail, signInGoogle, logOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [installPrompt, setInstallPrompt]     = useState<any>(null)
  const [showInstallButton, setShowInstallButton] = useState(false)

  // Redirect authenticated users away from / and /auth to /app
  useEffect(() => {
    if (loading) return
    const path = window.location.pathname
    if (user && (path === '/' || path === '/auth')) {
      navigate('/app', { replace: true })
    }
  }, [user, loading, navigate])

  // PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallButton(true)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    ;(installPrompt as any).prompt()
    const { outcome } = await (installPrompt as any).userChoice
    if (outcome === 'accepted') { setShowInstallButton(false); speak('App installed') }
    setInstallPrompt(null)
  }

  function handleSignOut() {
    logOut()
    navigate('/', { replace: true })
  }

  if (loading) return <PageSpinner />

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>

        {/* ── / — Landing page ── */}
        <Route
          path="/"
          element={
            <LandingPage
              user={user}
              theme={theme}
              onToggleTheme={toggleTheme}
              onGetStarted={() => navigate('/auth')}
              onGoToApp={() => navigate('/app')}
              onSignOut={handleSignOut}
            />
          }
        />

        {/* ── /auth — Sign in / register ── */}
        <Route
          path="/auth"
          element={
            user
              ? <Navigate to="/app" replace />
              : <AuthPage
                  onSignUpEmail={signUpEmail}
                  onSignInEmail={signInEmail}
                  onSignInGoogle={signInGoogle}
                />
          }
        />

        {/* ── /app — Main detection page ── */}
        <Route
          path="/app"
          element={
            <AppShell
              user={user}
              loading={false}
              theme={theme}
              onToggleTheme={toggleTheme}
              onSignOut={handleSignOut}
              showInstallButton={showInstallButton}
              onInstall={handleInstall}
            >
              {user && <AppPage user={user} />}
            </AppShell>
          }
        />

        {/* ── /sign-lang — ASL recognition + fingerspelling ── */}
        <Route
          path="/sign-lang"
          element={
            <AppShell
              user={user}
              loading={false}
              theme={theme}
              onToggleTheme={toggleTheme}
              onSignOut={handleSignOut}
              showInstallButton={showInstallButton}
              onInstall={handleInstall}
            >
              {user && <SignLangPage user={user} />}
            </AppShell>
          }
        />

        {/* ── Catch-all ── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Suspense>
  )
}

export default App
