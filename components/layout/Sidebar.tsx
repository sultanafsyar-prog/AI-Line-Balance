'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { BUILDINGS, ROLE_LABELS, isIE } from '@/lib/utils'

interface Props { user: { name?: string; email?: string; role?: string; building?: string } }

export default function Sidebar({ user }: Props) {
  const path = usePathname()
  const ie   = isIE(user.role)
  const isAdmin = user.role === 'IE_ADMIN' || user.role === 'IT_ADMIN'

  const navItems = [
    { href: '/dashboard', label: 'Dashboard',       icon: '⊞' },
    ...(ie ? [{ href: '/models',  label: 'Model library', icon: '◫' }] : []),
    { href: '/input',    label: 'Input aktual',     icon: '✎' },
    { href: '/monitor',  label: 'Monitor',          icon: '◉' },
    ...(ie ? [{ href: '/analytics', label: 'Analitik',    icon: '▦' }] : []),
    ...(isAdmin ? [{ href: '/users', label: 'Users',       icon: '◑' }] : []),
  ]

  const totalLines = Object.values(BUILDINGS).reduce((a, b) => a + b, 0)

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">IE</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Line Balance</div>
            <div className="text-xs text-gray-400">{ROLE_LABELS[user.role ?? ''] ?? user.role}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              path === item.href || path.startsWith(item.href + '/')
                ? 'bg-teal-light text-teal-dark font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}>
            <span className="text-base w-4 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 px-3 mb-2 uppercase tracking-wider">Pabrik</p>
          <div className="px-3 space-y-1 text-xs text-gray-500">
            {Object.entries(BUILDINGS).map(([b, lc]) => (
              <div key={b} className="flex justify-between">
                <span>Gedung {b}</span>
                <span className="font-medium">{lc} line</span>
              </div>
            ))}
            <div className="flex justify-between pt-1 border-t border-gray-100 font-medium text-gray-700">
              <span>Total</span><span>{totalLines} line</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-2 py-1 mb-2">
          <div className="w-7 h-7 rounded-full bg-teal flex items-center justify-center text-white text-xs font-medium">
            {user.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-800 truncate">{user.name}</div>
            <div className="text-xs text-gray-400 truncate">
              {user.building ? `Gedung ${user.building}` : 'Semua gedung'}
            </div>
          </div>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
          Keluar
        </button>
      </div>
    </aside>
  )
}
