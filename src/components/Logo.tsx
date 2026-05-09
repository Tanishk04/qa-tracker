interface Props {
  size?: number
  className?: string
  withWordmark?: boolean
  /** Use the higher-stroke variant tuned for very small sizes (≤24px). */
  smallVariant?: boolean
}

const BRAND_FILL = '#D87749'
const BRAND_GLYPH = '#FBF7F2'

/**
 * QA Tracker brand mark — magnifying-glass inside a clay-orange rounded square.
 * Inspired by the QA inspection metaphor. Source: design bundle `mxKN9LrXlvFo5rZXb1N6lA`.
 *
 * For most contexts use the default mark (stroke 5.5). At sizes ≤ 24px,
 * pass `smallVariant` to get the favicon stroke (6) which holds up better.
 */
export function Logo({ size = 32, className = '', withWordmark = false, smallVariant }: Props) {
  const strokeWidth = smallVariant ? 6 : 5.5
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={size} height={size} viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        role="img" aria-label="QA Tracker"
      >
        <rect width="64" height="64" rx="14" fill={BRAND_FILL} />
        <g fill="none" stroke={BRAND_GLYPH} strokeWidth={strokeWidth} strokeLinecap="round">
          <path d="M 32.43 43.79 A 14 14 0 1 0 43.79 32.43" />
          <path d="M 33 33 L 50 50" />
        </g>
      </svg>
      {withWordmark && (
        <div style={{ lineHeight: 1.1 }}>
          <div style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            fontSize: 14,
            color: 'var(--text)',
          }}>
            QA Tracker
          </div>
          <div style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            marginTop: 2,
          }}>
            For QA Engineers
          </div>
        </div>
      )}
    </div>
  )
}
