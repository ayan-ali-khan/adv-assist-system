export function speak(text: string, opts?: { lang?: string; rate?: number; pitch?: number; volume?: number }) {
  if (!('speechSynthesis' in window)) return
  if (!text?.trim()) return

  try {
    window.speechSynthesis.cancel()
  } catch {
    // ignore
  }

  const u = new SpeechSynthesisUtterance(text)
  u.lang = opts?.lang ?? 'en-US'
  u.rate = opts?.rate ?? 1
  u.pitch = opts?.pitch ?? 1
  u.volume = opts?.volume ?? 1
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (!('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // ignore
  }
}

