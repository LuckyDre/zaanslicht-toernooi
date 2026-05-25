'use client'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const styles: Record<Variant, string> = {
  primary: 'text-white font-semibold',
  secondary: 'text-white font-medium',
  danger: 'text-white font-semibold',
  ghost: 'font-medium',
}

export function Button({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }: ButtonProps) {
  const sizeClass = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2', lg: 'px-6 py-3 text-lg' }[size]

  const bg = {
    primary: 'var(--orange)',
    secondary: 'var(--bg-elevated)',
    danger: '#ef4444',
    ghost: 'transparent',
  }[variant]

  const hoverBg = {
    primary: 'var(--orange-dark)',
    secondary: '#333',
    danger: '#dc2626',
    ghost: 'var(--bg-elevated)',
  }[variant]

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`rounded-lg cursor-pointer transition-all ${sizeClass} ${styles[variant]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      style={{ backgroundColor: bg }}
      onMouseEnter={e => { if (!disabled && !loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = hoverBg }}
      onMouseLeave={e => { if (!disabled && !loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = bg }}
    >
      {loading ? <span className="opacity-70">Laden...</span> : children}
    </button>
  )
}
