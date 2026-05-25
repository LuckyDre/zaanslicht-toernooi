'use client'

export function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', ...style }}
    >
      {children}
    </div>
  )
}
