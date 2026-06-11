'use client'
import { useI18n, LOCALES, type Locale } from '@/lib/i18n'
import { useState, useRef, useEffect } from 'react'

interface Props {
  compact?: boolean
  dark?: boolean
  /** Dropdown buka ke atas (untuk posisi di bawah layar seperti sidebar bottom) */
  openUp?: boolean
}

// Warna per locale (pengganti flag emoji yang tidak render di Windows)
const LOCALE_COLORS: Record<Locale, string> = {
  'id':    '#ef4444',  // merah (bendera Indonesia)
  'en':    '#3b82f6',  // biru (UK/US)
  'zh-TW': '#22c55e',  // hijau (Taiwan)
}

export default function LanguageSwitcher({ compact = false, dark = false, openUp = false }: Props) {
  const { locale, setLocale } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = LOCALES[locale]
  const bg       = dark ? '#1f2937' : '#f9fafb'
  const bgHover  = dark ? '#374151' : '#f3f4f6'
  const border   = dark ? '#374151' : '#e5e7eb'
  const text     = dark ? '#f9fafb' : '#374151'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: compact ? 4 : 8,
          padding: compact ? '6px 8px' : '6px 12px',
          borderRadius: '8px', border: `1px solid ${border}`,
          background: bg, cursor: 'pointer', fontSize: '13px',
          color: text, fontWeight: 600, transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = bgHover)}
        onMouseLeave={e => (e.currentTarget.style.background = bg)}
        title={current.label}
      >
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          background: LOCALE_COLORS[locale], flexShrink: 0,
          border: '2px solid rgba(255,255,255,0.3)',
        }} />
        <span>{current.short}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          ...(openUp
            ? { bottom: '100%', marginBottom: '4px' }
            : { top: '100%', marginTop: '4px' }
          ),
          right: 0,
          background: dark ? '#111827' : '#ffffff',
          border: `1px solid ${border}`,
          borderRadius: '10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          zIndex: 100,
          minWidth: '170px',
        }}>
          {(Object.entries(LOCALES) as [Locale, typeof LOCALES[Locale]][]).map(([key, val]) => (
            <button
              key={key}
              onClick={() => { setLocale(key); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '10px 14px', border: 'none',
                background: locale === key ? (dark ? '#1f2937' : '#f0fdf9') : 'transparent',
                cursor: 'pointer', fontSize: '13px',
                color: locale === key ? (dark ? '#10b981' : '#3B82F6') : text,
                fontWeight: locale === key ? 600 : 400, textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                if (locale !== key) e.currentTarget.style.background = bgHover
              }}
              onMouseLeave={e => {
                if (locale !== key) e.currentTarget.style.background = locale === key ? (dark ? '#1f2937' : '#f0fdf9') : 'transparent'
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: LOCALE_COLORS[key], flexShrink: 0,
                border: '2px solid rgba(255,255,255,0.2)',
              }} />
              <span style={{ flex: 1 }}>{val.label}</span>
              {locale === key && <span style={{ fontSize: '14px', color: '#3B82F6' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
