/**
 * AppShell — shared header + auth guard for /app and /sign-lang routes.
 */
import { type ReactNode, useState, useRef, useEffect } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'

type Props = {
  user: User | null
  loading: boolean
  theme: string
  onToggleTheme: () => void
  onSignOut: () => void
  showInstallButton: boolean
  onInstall: () => void
  children: ReactNode
}

export function AppShell({
  user,
  loading,
  theme,
  onToggleTheme,
  onSignOut,
  showInstallButton,
  onInstall,
  children,
}: Props) {
  const navigate    = useNavigate()
  const location    = useLocation()
  const isSignLang  = location.pathname === '/sign-lang'
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef     = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (loading) {
    return (
      <div className="authPage">
        <div className="authCard" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <div className="authLogoIcon" style={{ fontSize: 40 }}>👁</div>
          <div style={{ marginTop: 16, opacity: 0.6 }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />

  const displayName = user.displayName || user.email || 'Account'

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="appHeaderLeft">
          <div className="titleRow">
            <img src="/favicon.png" alt="logo" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
            <span className="appTitle">SAARTHI AI</span>
          </div>
          <div className="appSubtitle">
            An AI-Powered Inclusive Support System for People with Disabilities
          </div>
        </div>

        <div className="appHeaderRight">
          {/* Nav links — Detection + Sign Language only */}
          <nav className="appNav">
            <button
              className={`appNavLink${!isSignLang ? ' appNavLink--active' : ''}`}
              onClick={() => navigate('/app')}
            >
              Detection
            </button>
            <button
              className={`appNavLink${isSignLang ? ' appNavLink--active' : ''}`}
              onClick={() => navigate('/sign-lang')}
            >
              Sign Language
            </button>
          </nav>

          {/* Theme toggle */}
          <button className="iconBtn themeToggle" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          {/* Install */}
          {showInstallButton && (
            <button className="installBtn" onClick={onInstall}>Install</button>
          )}

          {/* User dropdown */}
          <div className="userDropWrap" ref={dropRef}>
            <button
              className="userDropTrigger"
              onClick={() => setDropOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={dropOpen}
            >
              <span className="userDropAvatar">
                {displayName.charAt(0).toUpperCase()}
              </span>
              {/* <span className="userDropName">{displayName}</span> */}
              <span className="userDropCaret">{dropOpen ? '▲' : '▼'}</span>
            </button>

            {dropOpen && (
              <div className="userDropMenu" role="menu">
                <div className="userDropInfo">
                  <div className="userDropInfoName">{displayName}</div>
                  <div className="userDropInfoEmail">{user.email}</div>
                </div>
                <div className="userDropDivider" />
                <button
                  className="userDropItem userDropItem--danger"
                  role="menuitem"
                  onClick={() => { setDropOpen(false); onSignOut() }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
  )
}
