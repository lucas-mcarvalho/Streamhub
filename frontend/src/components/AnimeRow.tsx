import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CatalogItem } from '../api'
import { Card, Notice, PosterSkeleton } from './ui'

/** Fileira do modo Anime: título, setas redondas e, opcionalmente, ranking numerado (Top 10). */
export default function AnimeRow({ title, items, error, loading, ranked }: { title: string; items: CatalogItem[]; error?: string | null; loading?: boolean; ranked?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' })
  const shown = ranked ? items.slice(0, 10) : items
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h2>
        <div className="flex gap-2">
          <button onClick={() => scroll(-1)} aria-label="Voltar" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface transition hover:border-accent-500 hover:text-accent-400"><ChevronLeft size={18} /></button>
          <button onClick={() => scroll(1)} aria-label="Avançar" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface transition hover:border-accent-500 hover:text-accent-400"><ChevronRight size={18} /></button>
        </div>
      </div>
      {error ? <Notice text={error} />
        : loading ? <div className="no-scrollbar flex gap-4 overflow-hidden">{Array.from({ length: 8 }).map((_, i) => <PosterSkeleton key={i} />)}</div>
        : shown.length === 0 ? <p className="text-sm text-zinc-500">Nenhum resultado.</p>
        : (
          <div ref={ref} className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3 pt-1">
            {shown.map((it, n) => (
              <div key={it.ref} className="flex shrink-0 snap-start items-end">
                {ranked && <span className="mr-1 min-w-[3.2rem] select-none pb-5 text-center text-[76px] font-black leading-none text-transparent [-webkit-text-stroke:2px_rgb(var(--accent))]">{n + 1}</span>}
                <Card item={it} index={n} wide />
              </div>
            ))}
          </div>
        )}
    </section>
  )
}
