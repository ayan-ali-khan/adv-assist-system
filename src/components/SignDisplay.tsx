// SignDisplay.tsx
// Renders ASL fingerspelling images for typed/spoken text.
// Each A–Z letter maps to a PNG in /public/letters/.

type Props = {
  text: string
  maxChars?: number
}

function getLetterSrc(ch: string): string | null {
  if (ch >= 'A' && ch <= 'Z') {
    return `/letters/${ch.toLowerCase()}.png`
  }
  return null
}

export function SignDisplay({ text, maxChars = 24 }: Props) {
  const chars = text
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .slice(0, maxChars)
    .split('')

  if (!chars.length) {
    return (
      <div
        className="signStrip"
        style={{ justifyContent: 'center', opacity: 0.5, minHeight: 80 }}
        aria-label="ASL fingerspelling"
      >
        <span style={{ fontSize: 13, alignSelf: 'center' }}>
          Type or speak a phrase above
        </span>
      </div>
    )
  }

  return (
    <div className="signStrip" aria-label="ASL fingerspelling of typed text">
      {chars.map((ch, idx) => {
        const src = getLetterSrc(ch)
        return (
          <div
            key={`${ch}-${idx}`}
            className="signCell"
            title={ch === ' ' ? 'space' : `ASL: ${ch}`}
          >
            {src ? (
              <img
                src={src}
                alt={`ASL sign for ${ch}`}
                width={72}
                height={80}
                style={{ objectFit: 'contain' }}
                draggable={false}
              />
            ) : (
              // Fallback for space
              <svg
                viewBox="0 0 72 80"
                xmlns="http://www.w3.org/2000/svg"
                width={72}
                height={80}
                aria-hidden="true"
              >
                <text
                  x="36"
                  y="48"
                  textAnchor="middle"
                  fontSize="28"
                  fill="currentColor"
                >
                  ␣
                </text>
              </svg>
            )}
            <span className="signCellLabel">
              {ch === ' ' ? '␣' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
