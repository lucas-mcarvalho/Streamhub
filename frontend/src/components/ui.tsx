import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogItem } from '../api'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-zinc-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const btn = 'rounded-md bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50'
export const btnGhost = 'rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50'
export const input = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-red-500'

export function Bar({ percent, warn }: { percent: number; warn?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
      <div className={`h-full ${warn ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

export function Card({ item }: { item: CatalogItem }) {
  return (
    <Link to={`/title/${item.source}/${item.type}/${item.id}`} className="group block w-40 shrink-0">
      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-zinc-800">
        {item.posterUrl ? <img src={item.posterUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-zinc-500">{item.title}</div>}
      </div>
      <div className="mt-2 truncate text-sm font-medium">{item.title}</div>
      <div className="text-xs text-zinc-400">{item.year ?? '—'} {item.rating ? `· ★ ${item.rating.toFixed(1)}` : ''}</div>
    </Link>
  )
}

export function Row({ title, items, error }: { title: string; items: CatalogItem[]; error?: string }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {error ? <Notice text={error} /> : items.length === 0 ? <p className="text-sm text-zinc-500">Nenhum resultado.</p>
        : <div className="flex gap-4 overflow-x-auto pb-2">{items.map((i) => <Card key={i.ref} item={i} />)}</div>}
    </section>
  )
}

export function Notice({ text }: { text: string }) {
  return <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">{text}</div>
}

export function Spinner() { return <p className="text-sm text-zinc-500">Carregando…</p> }
