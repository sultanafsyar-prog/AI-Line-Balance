'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Loader2, AlertCircle, Factory } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) { setError(t('login.error')); setLoading(false) }
    else router.push('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Subtle grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #E2E8F0 1px, transparent 1px), linear-gradient(to bottom, #E2E8F0 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 40%, black 30%, transparent 100%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Language switcher top-right */}
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25">
            <Factory className="h-7 w-7 text-white" strokeWidth={1.8} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('login.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('login.subtitle')}</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">{t('login.email')}</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input pl-9" placeholder="email@factory.com" required
                />
              </div>
            </div>
            <div>
              <label className="label">{t('login.password')}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="input pl-9" placeholder="••••••••" required
                />
              </div>
            </div>
            {error && (
              <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? t('login.signingIn') : t('login.button')}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t('login.forgotPassword')}
        </p>
        <p className="mt-3 text-center text-xs text-gray-300">
          {t('app.by')} <span className="font-medium text-gray-400">Third Axis Center</span>
        </p>
      </div>
    </div>
  )
}
