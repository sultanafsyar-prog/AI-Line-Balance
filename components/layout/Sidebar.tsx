'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const ROLE_LABELS: Record<string, string> = {
  IE_ADMIN:     'IE Admin',
  IE_OPERATOR:  'IE Operator',
  TEAM_LEADER:  'Team Leader',
  MANAGEMENT:   'Management',
  IT_ADMIN:     'IT Admin',
}

function isIE(role?: string) {
  return role === 'IE_ADMIN' || role === 'IE_OPERATOR'
}

interface Props {
  user: { name?: string | null; email?: string | null; role?: string; building?: string | null }
}

export default function Sidebar({ user }: Props) {
  const path     = usePathname()
  const ie       = isIE(user.role)
  const [open, setOpen] = useState(true)

  const navItems = [
    { href: '/dashboard',  label: 'Dashboard',    icon: '⊞' },
    ...(ie ? [{ href: '/models', label: 'Model library', icon: '◫' }] : []),
    { href: '/input',      label: 'Input aktual', icon: '✎' },
    { href: '/monitor',    label: 'Monitor',      icon: '◉' },
    ...(ie ? [{ href: '/analytics', label: 'Analitik', icon: '▦' }] : []),
    ...(user.role === 'IT_ADMIN' ? [{ href: '/users', label: 'Users', icon: '◑' }] : []),
  ]

  const initials = (user.name ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')

  return (
    <aside
      style={{
        width: open ? '224px' : '60px',
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid #f0f0ef',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── Header / Logo ── */}
      <div style={{
        padding: '14px 12px',
        borderBottom: '1px solid #f0f0ef',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '56px',
      }}>
        <div style={{
          minWidth: '32px', height: '32px',
          background: '#1D9E75', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>IE</span>
        </div>
        {open && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a18', whiteSpace: 'nowrap' }}>
              Line Balance
            </div>
            <div style={{ fontSize: '11px', color: '#888780', whiteSpace: 'nowrap' }}>
              {ROLE_LABELS[user.role ?? ''] ?? user.role}
            </div>
          </div>
        )}
      </div>

      {/* ── Toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Tutup sidebar' : 'Buka sidebar'}
        style={{
          position: 'absolute',
          top: '16px',
          right: open ? '10px' : '8px',
          width: '22px', height: '22px',
          borderRadius: '50%',
          border: '1px solid #e0dfd7',
          background: '#fff',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', color: '#888780',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {open ? '◀' : '▶'}
      </button>

      {/* ── Nav items ── */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {navItems.map(item => {
          const active = path === item.href || path.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!open ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: open ? '8px 10px' : '8px',
                borderRadius: '8px',
                textDecoration: 'none',
                background: active ? '#E1F5EE' : 'transparent',
                color: active ? '#0F6E56' : '#5F5E5A',
                fontSize: '13px',
                fontWeight: active ? 500 : 400,
                transition: 'background 0.12s',
                justifyContent: open ? 'flex-start' : 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = '#f5f5f3'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <span style={{ fontSize: '15px', flexShrink: 0 }}>{item.icon}</span>
              {open && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* ── User info + Logout ── */}
      <div style={{
        padding: '10px 8px',
        borderTop: '1px solid #f0f0ef',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        {/* Avatar + nama (hanya saat open) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 8px',
          borderRadius: '8px',
          overflow: 'hidden',
          justifyContent: open ? 'flex-start' : 'center',
        }}>
          <div style={{
            minWidth: '30px', height: '30px',
            borderRadius: '50%',
            background: '#E1F5EE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 600, color: '#0F6E56',
            flexShrink: 0,
          }}>
            {initials}
          </div>
          {open && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#1a1a18', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '11px', color: '#888780', whiteSpace: 'nowrap' }}>
                {user.building ? `Gedung ${user.building}` : 'Semua gedung'}
              </div>
            </div>
          )}
        </div>

        {/* Tombol Logout — selalu muncul, ikon saja kalau collapsed */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Keluar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: open ? '7px 10px' : '7px',
            borderRadius: '8px',
            border: '1px solid #f0f0ef',
            background: 'transparent',
            cursor: 'pointer',
            color: '#A32D2D',
            fontSize: '13px',
            fontWeight: 500,
            width: '100%',
            justifyContent: open ? 'flex-start' : 'center',
            transition: 'background 0.12s',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FCEBEB')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {/* Ikon pintu keluar */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          {open && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  )
}
