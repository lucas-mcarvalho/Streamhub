import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import type { CatalogItem } from '../api'
import { Card, Notice, PosterSkeleton } from './ui'

/** Fileira horizontal de títulos; `ranked` mostra o Top 10 numerado. */
export default function CatalogRow({ title, items, error, loading, ranked, more }: {
  title: string; items: CatalogItem[]; error?: string | null; loading?: boolean; ranked?: boolean; more?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' })
  const shown = ranked ? items.slice(0, 10) : items
  return (
    <section className="group/row relative mb-8 md:mb-10">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-bold tracking-tight md:text-2xl">{title}</h2>
        {more && (
          <Link to={more} className="flex items-center gap-0.5 text-xs font-semibold text-accent-400 opacity-0 transition group-hover/row:opacity-100 max-md:opacity-100">
            Ver tudo<ChevronsRight size={14} />
          </Link>
        )}
      </div>
      {error ? <Notice text={error} />
        : loading ? <div className="no-scrollbar flex gap-3 overflow-hidden">{Array.from({ length: 8 }).map((_, i) => <PosterSkeleton key={i} />)}</div>
        : shown.length === 0 ? <p className="text-sm text-zinc-500">Nenhum resultado.</p>
        : (
          <div className="relative">
            <button onClick={() => scroll(-1)} aria-label="Voltar"
              className="absolute -left-4 bottom-3 top-1 z-20 hidden w-12 place-items-center bg-gradient-to-r from-canvas/90 to-transparent opacity-0 transition group-hover/row:opacity-100 md:-left-12 md:grid"><ChevronLeft size={34} /></button>
            <div ref={ref} className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3 pt-1">
              {shown.map((it, n) => (
                <div key={it.ref} className="flex shrink-0 snap-start items-end">
                  {ranked && <span className="mr-[-0.4rem] min-w-[3.4rem] select-none pb-2 text-center font-display text-[110px] leading-[0.8] text-canvas [-webkit-text-stroke:3px_rgb(161_161_170)]">{n + 1}</span>}
                  <Card item={it} index={n} />
                </div>
              ))}
            </div>
            <button onClick={() => scroll(1)} aria-label="Avançar"
              className="absolute -right-4 bottom-3 top-1 z-20 hidden w-12 place-items-center bg-gradient-to-l from-canvas/90 to-transparent opacity-0 transition group-hover/row:opacity-100 md:-right-12 md:grid"><ChevronRight size={34} /></button>
          </div>
        )}
    </section>
  )
}
