'use client'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        {...props}
        className={`rounded-lg px-3 py-2 outline-none focus:ring-2 transition-all ${className}`}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          color: 'var(--text-primary)',
          // @ts-expect-error custom property
          '--tw-ring-color': 'var(--orange)',
        }}
      />
      {error && <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string | number; label: string }[]
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <select
        {...props}
        className={`rounded-lg px-3 py-2 outline-none focus:ring-2 transition-all ${className}`}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
