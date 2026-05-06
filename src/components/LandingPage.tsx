import './landingpage.css'
import type { User } from 'firebase/auth'

type Props = {
  user: User | null
  onGetStarted: () => void
  onGoToApp: () => void
  onSignOut: () => void
  theme: string
  onToggleTheme: () => void
}

const FEATURES = [
  {
    icon: '👤',
    title: 'Face Detection',
    desc: 'Real-time bounding boxes and key points — eyes, nose, mouth — on every detected face with live confidence scores.',
    tag: 'MediaPipe',
  },
  {
    icon: '🗺️',
    title: 'Face Landmarker',
    desc: 'Maps 468 facial landmarks per face. Color-coded contours for oval, eyes, lips, and nose — up to 4 faces at once.',
    tag: 'MediaPipe',
  },
  {
    icon: '✋',
    title: 'Hand Gestures',
    desc: 'Recognizes 8 built-in gestures — Thumbs Up/Down, Open Palm, Fist, Victory, and more — with a full 21-point skeleton overlay.',
    tag: 'MediaPipe',
  },
  {
    icon: '📖',
    title: 'Text Reader (OCR)',
    desc: 'Captures a live frame, extracts text in English and Hindi, then reads the result aloud via speech synthesis.',
    tag: 'Tesseract.js',
  },
  {
    icon: '💵',
    title: 'Currency Detection',
    desc: 'Identifies Indian Rupee notes ₹10–₹2000 using a custom model trained on 4,000+ images at 88.7% mAP accuracy.',
    tag: 'Roboflow AI',
  },
  {
    icon: '🤟',
    title: 'ASL Recognition',
    desc: 'Recognizes A–Z hand signs, speaks each confirmed letter aloud, and builds a running transcript in real time.',
    tag: 'Roboflow AI',
  },
  {
    icon: '🎤',
    title: 'Voice Commands',
    desc: 'Always-on voice control — say "face", "gesture", "read", or "currency" to switch modes completely hands-free.',
    tag: 'Web Speech API',
  },
  {
    icon: '🔤',
    title: 'ASL Fingerspelling',
    desc: 'Type or speak any phrase and see it rendered as real ASL hand sign photographs — A through Z, letter by letter.',
    tag: 'Visual',
  },
]

const STATS = [
  { value: '88', suffix: '.7%', label: 'Currency Model mAP' },
  { value: '468', suffix: '', label: 'Face Landmarks' },
  { value: '8', suffix: '', label: 'Gesture Types' },
  { value: '26', suffix: '', label: 'ASL Letters' },
]

const STEPS = [
  {
    num: '01',
    badge: '⚡ 30 seconds',
    title: 'Create an account',
    desc: 'Sign up with email or Google. Your detection history and ASL transcripts are saved securely to your profile.',
  },
  {
    num: '02',
    badge: '🔒 100% local',
    title: 'Start the camera',
    desc: 'Click "Start camera" to activate your webcam. All inference runs locally in the browser — nothing is uploaded to any server.',
  },
  {
    num: '03',
    badge: '🎯 One at a time',
    title: 'Choose a feature',
    desc: 'Select any module from the panel. Each activates independently — only one model runs at a time for maximum performance.',
  },
]

const TECH = [
  { label: 'MediaPipe', color: '#4285f4' },
  { label: 'Roboflow', color: '#e04836' },
  { label: 'Tesseract.js', color: '#f5a623' },
  { label: 'Web Speech API', color: '#00b4d8' },
  { label: 'Firebase', color: '#ff6f00' },
  { label: 'React', color: '#61dafb' },
]

const MARQUEE_ITEMS = [
  '👤 Face Detection',
  '🗺️ 468 Facial Landmarks',
  '✋ Gesture Recognition',
  '📖 OCR Text Reader',
  '💵 Currency Detection',
  '🤟 ASL Recognition',
  '🎤 Voice Commands',
  '🔤 ASL Fingerspelling',
]

export function LandingPage({
  user,
  onGetStarted,
  onGoToApp,
  onSignOut,
  theme,
  onToggleTheme,
}: Props) {
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]

  return (
    <div className="aas-shell">

      {/* ── Navbar ── */}
      <nav className="aas-nav">
        <div className="aas-nav-brand">
          <div className="aas-nav-logo">👁</div>
          <span className="aas-nav-name">SAARTHI AI</span>
        </div>
        <div className="aas-nav-right">
          {user && (
            <button className="aas-btn-ghost" onClick={onGoToApp}>
              Open App
            </button>
          )}
          <button className="aas-theme-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {user ? (
            <button className="aas-btn-ghost" onClick={onSignOut}>
              Sign out
            </button>
          ) : (
            <button className="aas-btn-solid" onClick={onGetStarted}>
              Sign in
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="aas-hero">
        <div className="aas-hero-bg" />
        <div className="aas-hero-grid" />
        <div className="aas-hero-content">
          <div className="aas-hero-pill aas-fade-in">
            <span className="aas-hero-dot" />
            SAARTHI AI · Runs in Browser · No Install
          </div>
          <h1 className="aas-hero-h1 aas-fade-in aas-delay-1">
            Inclusive AI<br />for <em>everyone</em>
          </h1>
          <p className="aas-hero-sub aas-fade-in aas-delay-2">
            SAARTHI AI is an AI-powered inclusive support system for people with disabilities —
            combining face detection, hand gesture recognition, OCR, currency identification,
            and ASL translation, all running locally in your browser.
          </p>
          <div className="aas-hero-actions aas-fade-in aas-delay-3">
            {user ? (
              <button className="aas-cta-primary" onClick={onGoToApp}>
                Open App →
              </button>
            ) : (
              <button className="aas-cta-primary" onClick={onGetStarted}>
                Get started free →
              </button>
            )}
            <a className="aas-cta-secondary" href="#features">
              See how it works ↓
            </a>
          </div>
        </div>
      </section>

      {/* ── Marquee ── */}
      <div className="aas-marquee-wrap">
        <div className="aas-marquee-track">
          {doubled.map((item, i) => (
            <span key={i} className="aas-marquee-item">
              {item}
              <span className="aas-marquee-sep">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="aas-stats">
        {STATS.map((s) => (
          <div key={s.label} className="aas-stat-item">
            <div className="aas-stat-val">
              {s.value}
              {s.suffix && <span>{s.suffix}</span>}
            </div>
            <div className="aas-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Features ── */}
      <section className="aas-section" id="features">
        <div className="aas-features-header">
          <div className="aas-eyebrow">Capabilities</div>
          <h2 className="aas-section-title">
            Eight AI modules,<br />one platform.
          </h2>
          <p className="aas-section-sub">
            Every feature runs client-side — your data never leaves the device.
          </p>
        </div>
        <div className="aas-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="aas-feat-card">
              <div className="aas-feat-icon">{f.icon}</div>
              <div className="aas-feat-tag">{f.tag}</div>
              <h3 className="aas-feat-title">{f.title}</h3>
              <p className="aas-feat-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="aas-how-section">
        <div className="aas-how-content">
          <div className="aas-eyebrow aas-eyebrow--light">How it works</div>
          <h2 className="aas-section-title aas-title--light">
            Up and running<br />in three steps.
          </h2>
          <p className="aas-section-sub aas-sub--light">
            No downloads, no plugins, no configuration.
          </p>
          <div className="aas-steps">
            {STEPS.map((step) => (
              <div key={step.num} className="aas-step">
                <div className="aas-step-num">{step.num}</div>
                <div className="aas-step-badge">{step.badge}</div>
                <h3 className="aas-step-title">{step.title}</h3>
                <p className="aas-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech strip ── */}
      <div className="aas-tech-strip">
        <span className="aas-tech-label">Powered by</span>
        {TECH.map((t) => (
          <div key={t.label} className="aas-tech-pill">
            <span className="aas-tech-dot" style={{ background: t.color }} />
            {t.label}
          </div>
        ))}
      </div>

      {/* ── CTA banner ── */}
      <section className="aas-cta-section">
        <h2 className="aas-cta-title">
          Ready to see<br />the difference?
        </h2>
        <p className="aas-cta-sub">Free to use. No credit card required. Works on any modern browser.</p>
        {user ? (
          <button className="aas-cta-primary" onClick={onGoToApp}>
            Open App →
          </button>
        ) : (
          <button className="aas-cta-primary" onClick={onGetStarted}>
            Create free account →
          </button>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="aas-footer">
        <span>© 2026 SAARTHI AI</span>
        <div className="aas-footer-stack">
          {['MediaPipe', 'Roboflow', 'Firebase', 'React'].map((t) => (
            <div key={t} className="aas-footer-chip">{t}</div>
          ))}
        </div>
      </footer>
    </div>
  )
}