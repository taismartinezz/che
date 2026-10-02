import type { ReactNode } from 'react';

export function PostSkeleton() {
  return (
    <div className="card p-4 space-y-3" aria-hidden>
      <div className="flex items-center gap-2">
        <div className="skeleton h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-3 w-24" />
        </div>
      </div>
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-8 w-full" />
    </div>
  );
}

export function RowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="skeleton h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card p-8 flex flex-col items-center text-center gap-2">
      {icon && <div className="h-14 w-14 rounded-full bg-brand-soft text-brand flex items-center justify-center mb-1">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="text-ink-2 text-[15px] max-w-sm">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-brand/30 border-t-brand"
      style={{ width: size, height: size }}
      role="status"
      aria-label="…"
    />
  );
}

export function FullScreenLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="h-16 w-16 rounded-full bg-brand text-white flex items-center justify-center text-2xl font-extrabold">che</div>
      <Spinner />
    </div>
  );
}
