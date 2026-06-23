'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { flushQueue } from '@/lib/offline-queue'
import { useI18n } from '@/lib/i18n'

// Daftarkan service worker + sinkronkan antrian input offline saat online kembali.
export default function PWARegister() {
  const { t } = useI18n()

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const sync = async () => {
      const n = await flushQueue()
      if (n > 0) toast.success(t('offline.synced', { n }))
    }
    sync() // coba kirim antrian sisa saat halaman dibuka

    const onOnline = () => { toast.success(t('offline.backOnline')); sync() }
    const onOffline = () => { toast.warning(t('offline.nowOffline')) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [t])

  return null
}
