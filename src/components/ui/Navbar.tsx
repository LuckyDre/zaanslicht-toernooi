'use client'

import Link from 'next/link'
import { useState } from 'react'

export function Navbar({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-4 py-3"
      style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
    >
      <Link href="/" className="flex items-center gap-2 font-bold text-lg">
        <span style={{ color: 'var(--orange)' }}>⚽</span>
        <span>Zaans Licht</span>
        <span className="text-sm font-normal" style={{ color: 'var(--text-secondary)' }}>Toernooi</span>
      </Link>

      {/* Desktop */}
      <div className="hidden md:flex items-center gap-4">
        <Link href="/" className="text-sm hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          Toernooien
        </Link>
        {isAdmin ? (
          <>
            <Link href="/admin" className="text-sm hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
              Admin
            </Link>
            <form action="/api/logout" method="post">
              <button type="submit" className="text-sm hover:opacity-80 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                Uitloggen
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            className="text-sm px-3 py-1.5 rounded-lg font-medium"
            style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
          >
            Admin
          </Link>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        className="md:hidden p-2 rounded-lg"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
        onClick={() => setOpen(!open)}
        aria-label="Menu"
      >
        <div className="w-5 h-0.5 bg-white mb-1" />
        <div className="w-5 h-0.5 bg-white mb-1" />
        <div className="w-5 h-0.5 bg-white" />
      </button>

      {/* Mobile menu */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 flex flex-col gap-2 p-4 md:hidden"
          style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
        >
          <Link href="/" className="py-2 text-sm" onClick={() => setOpen(false)}>
            Toernooien
          </Link>
          {isAdmin ? (
            <>
              <Link href="/admin" className="py-2 text-sm" onClick={() => setOpen(false)}>
                Admin
              </Link>
            </>
          ) : (
            <Link href="/login" className="py-2 text-sm" style={{ color: 'var(--orange)' }} onClick={() => setOpen(false)}>
              Admin inloggen
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
