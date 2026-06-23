'use client'
import { SessionProvider } from 'next-auth/react'
import { I18nProvider } from '@/lib/i18n'
import PWARegister from '@/components/PWARegister'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider>
        <PWARegister />
        {children}
      </I18nProvider>
    </SessionProvider>
  )
}
