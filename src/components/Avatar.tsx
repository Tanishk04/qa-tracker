/**
 * Clay-cartoon avatar via DiceBear "personas" style — free, CDN-cached SVGs.
 * Falls back to initials when no seed is provided.
 */

interface Props {
  seed: string | null
  name?: string
  size?: number
  ring?: boolean
}

const initials = (name: string) => {
  const p = name.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}

/** True if seed names a local file in /public/avatars/ (e.g. "01.png", "alex.svg"). */
export function isLocalAvatarSeed(seed: string | null): boolean {
  if (!seed) return false
  return /\.(png|jpe?g|svg|webp|gif)$/i.test(seed)
}

export function avatarUrl(seed: string | null): string | null {
  if (!seed) return null
  if (isLocalAvatarSeed(seed)) return `/avatars/${seed}`
  return `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundType=gradientLinear&backgroundColor=ffd5dc,ffdfbf,ffeebf,c0aede,d1d4f9,b6e3f4`
}

export function Avatar({ seed, name = '?', size = 22, ring = false }: Props) {
  const url = avatarUrl(seed)

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        title={name}
        width={size} height={size}
        style={{
          borderRadius: '50%',
          border: ring ? '1.5px solid var(--border-strong)' : '1px solid var(--border)',
          flexShrink: 0,
          background: 'var(--bg-hover)',
        }}
      />
    )
  }

  return (
    <div
      title={name}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--bg-hover)', color: 'var(--text-muted)',
        fontSize: Math.round(size * 0.45), fontWeight: 600,
        display: 'grid', placeItems: 'center', flexShrink: 0,
        border: '1px solid var(--border)',
      }}
    >{initials(name)}</div>
  )
}

/** Curated seed palette for the picker. */
export const AVATAR_PRESET_SEEDS = [
  'Mango', 'Pepper', 'Sage', 'Comet', 'Lyra', 'Onyx',
  'Pixel', 'Echo', 'Nova', 'Indigo', 'River', 'Marble',
  'Pebble', 'Rain', 'Sunny', 'Forest', 'Ember', 'Coral',
  'Olive', 'Frost', 'Jet', 'Lark',
]
