'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, Boxes, ClipboardList, Activity, BarChart3,
  Users, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import LanguageSwitcher from '@/components/LanguageSwitcher'

const ROLE_LABELS: Record<string, string> = {
  IE_ADMIN:     'IE Admin',
  IE_OPERATOR:  'IE Operator',
  TEAM_LEADER:  'Team Leader',
  MANAGEMENT:   'Management',
  IT_ADMIN:     'IT Admin',
  PPIC:         'PPIC',
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
  const { t }    = useI18n()

  const navItems = [
    { href: '/dashboard',  label: t('nav.dashboard'),    Icon: LayoutDashboard },
    ...(ie ? [{ href: '/models', label: t('nav.modelLibrary'), Icon: Boxes }] : []),
    { href: '/input',      label: t('nav.inputActual'),  Icon: ClipboardList },
    { href: '/monitor',    label: t('nav.monitor'),      Icon: Activity },
    ...(ie ? [{ href: '/analytics', label: t('nav.analytics'), Icon: BarChart3 }] : []),
    ...(user.role === 'IT_ADMIN' ? [{ href: '/users', label: t('nav.users'), Icon: Users }] : []),
  ]

  const initials = (user.name ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')

  return (
    <aside
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-200 ease-in-out"
      style={{ width: open ? '232px' : '64px' }}
    >
      {/* ── Header / Logo ── */}
      <div className="flex min-h-[56px] items-center gap-2.5 border-b border-border px-3 py-3.5">
        <div className="flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-sm">
          <span className="text-[11px] font-bold text-white">IE</span>
        </div>
        {open && (
          <div className="overflow-hidden">
            <div className="whitespace-nowrap text-[13px] font-semibold text-foreground">
              Line Balance
            </div>
            <div className="whitespace-nowrap text-[11px] text-muted-foreground">
              {ROLE_LABELS[user.role ?? ''] ?? user.role}
            </div>
          </div>
        )}
      </div>

      {/* ── Toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Tutup sidebar' : 'Buka sidebar'}
        className={cn(
          'absolute top-4 z-10 flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
          open ? 'right-2.5' : 'right-2',
        )}
      >
        {open ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {/* ── Nav items ── */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2.5">
        {navItems.map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              title={!open ? label : undefined}
              className={cn(
                'flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg text-[13px] transition-colors duration-150',
                open ? 'justify-start px-2.5 py-2' : 'justify-center p-2',
                active
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'font-normal text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
              {open && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* ── User info + Logout ── */}
      <div className="flex flex-col gap-1.5 border-t border-border px-2 py-2.5">
        {/* Avatar + nama */}
        <div className={cn(
          'flex items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5',
          open ? 'justify-start' : 'justify-center',
        )}>
          <div className="flex h-[30px] w-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">
            {initials}
          </div>
          {open && (
            <div className="overflow-hidden">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-foreground">
                {user.name}
              </div>
              <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                {user.building ? `Gedung ${user.building}` : t('nav.allBuildings')}
              </div>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Keluar"
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-transparent text-[13px] font-medium text-red-700 transition-colors duration-150 hover:bg-red-50',
            open ? 'justify-start px-2.5 py-[7px]' : 'justify-center p-[7px]',
          )}
        >
          <LogOut className="h-[15px] w-[15px] shrink-0" />
          {open && <span>{t('common.logout')}</span>}
        </button>

        {/* Language switcher */}
        <div className="mt-2 flex justify-center">
          <LanguageSwitcher compact={!open} openUp />
        </div>

        {/* Watermark */}
        {open && (
          <div className="mt-2 text-center text-[10px] leading-tight text-gray-300">
            {t('app.by')}<br />
            <span className="font-semibold text-gray-400">Third Axis Center</span>
          </div>
        )}
      </div>
    </aside>
  )
}
