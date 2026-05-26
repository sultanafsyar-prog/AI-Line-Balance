// Skeleton shimmer animation
export function Skeleton({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`skeleton ${className}`} style={style} />
  )
}

// Card skeleton
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-4">
      <Skeleton className="h-4 w-1/3 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 mb-2 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

// Stat card skeleton
export function StatSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-8 w-16 mb-1" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

// Table row skeleton
export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-3" style={{ width: `${60 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

// Line card skeleton
export function LineCardSkeleton() {
  return (
    <div className="card border border-gray-100 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="w-2.5 h-2.5 rounded-full" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="grid grid-cols-3 gap-1 mb-2">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
      <Skeleton className="h-1.5 w-full" />
    </div>
  )
}

// Full page loading overlay
export function PageLoading({ message = 'Memuat data...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="loading-spinner" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}

// Inline spinner
export function Spinner({ size = 20, color = '#1D9E75' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
