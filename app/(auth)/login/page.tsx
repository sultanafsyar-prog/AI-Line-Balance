'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
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
    else router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Language switcher top-right */}
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-teal rounded-xl mb-4">
            <span className="text-white text-xl font-bold">IE</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('login.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('login.subtitle')}</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">{t('login.email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="email@factory.com" required />
            </div>
            <div>
              <label className="label">{t('login.password')}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="••••••••" required />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
              {loading ? t('login.signingIn') : t('login.button')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t('login.forgotPassword')}
        </p>
        <p className="text-center text-xs text-gray-300 mt-3">
          {t('app.by')} <span className="font-medium text-gray-400">Third Axis Center</span>
        </p>
      </div>
    </div>
  )
}
