'use client'

type BadgeVariant = 'orange' | 'green' | 'red' | 'gray' | 'yellow'

const colors: Record<BadgeVariant, { bg: string; text: string }> = {
  orange: { bg: '#FF6B0022', text: 'var(--orange)' },
  green: { bg: '#22c55e22', text: 'var(--green)' },
  red: { bg: '#ef444422', text: 'var(--red)' },
  gray: { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)' },
  yellow: { bg: '#FFC10722', text: 'var(--yellow)' },
}

export function Badge({ children, variant = 'gray' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const c = colors[variant]
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {children}
    </span>
  )
}
