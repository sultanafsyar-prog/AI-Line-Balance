import { StatSkeleton, LineCardSkeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="skeleton h-8 w-56" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {[...Array(6)].map((_, i) => <StatSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(9)].map((_, i) => <LineCardSkeleton key={i} />)}
      </div>
    </div>
  )
}
