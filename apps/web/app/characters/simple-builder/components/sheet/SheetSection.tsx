import { useState, type ReactNode } from 'react'

interface Props {
  title: string
  collapsible?: boolean
  children: ReactNode
}

export function SheetSection({ title, collapsible = false, children }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => collapsible && setOpen((v) => !v)}
        className={['w-full flex items-center justify-between px-5 py-3 border-b', collapsible ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'].join(' ')}
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--color-gold)' }}>
          {title}
        </h3>
        {collapsible && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
        )}
      </button>
      {open && (
        <div className="px-5 py-4">
          {children}
        </div>
      )}
    </div>
  )
}
