'use client'

const shimmerStyle: React.CSSProperties = {
  display: 'block',
  borderRadius: 6,
  background: 'linear-gradient(to right, #F3F4F6 8%, #E5E7EB 18%, #F3F4F6 33%)',
  backgroundSize: '800px 104px',
  animation: 'shimmer 1.2s linear infinite',
}

export function Skeleton({ width = '100%', height = 12, style = {} }: {
  width?: string | number; height?: string | number; style?: React.CSSProperties
}) {
  return <span style={{ ...shimmerStyle, width, height, ...style }} />
}

export function StatSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton width="60%" height={10} style={{ marginBottom: 8 }} />
      <Skeleton width="40%" height={28} style={{ marginBottom: 6 }} />
      <Skeleton width="70%" height={10} />
    </div>
  )
}

export function LineCardSkeleton() {
  return (
    <div className="card border border-gray-100 p-3">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Skeleton width={10} height={10} style={{ borderRadius: '50%', flexShrink: 0 }} />
        <Skeleton width={60} height={14} />
        <Skeleton width={40} height={12} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
      <Skeleton height={6} style={{ borderRadius: 4 }} />
    </div>
  )
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <Skeleton width={`${50 + Math.random() * 40}%`} height={12} />
        </td>
      ))}
    </tr>
  )
}

export function PageLoading({ message = 'Memuat data...' }: { message?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 12 }}>
      <div className="loading-spinner" />
      <p style={{ fontSize: 13, color: '#9CA3AF' }}>{message}</p>
    </div>
  )
}

export function Spinner({ size = 20, color = '#3B82F6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke={color} strokeOpacity="0.2" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}