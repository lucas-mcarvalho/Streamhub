import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Star, X } from 'lucide-react'
import { genrePt, type CatalogItem } from '../api'

export const btn =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/25 transition hover:bg-accent-500 active:scale-95 disabled:opacity-50 disabled:active:scale-100'
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface/60 px-3 py-1.5 text-sm transition hover:border-accent-500/60 hover:bg-surface2 active:scale-95 disabled:opacity-50'
export const input =
  'w-full rounded-lg border border-line bg-surface2/60 px-3 py-2 text-sm outline-none transition placeholder:text-zinc-500 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <motion.div className={`glass max-h-[90vh] w-full overflow-auto rounded-2xl p-6 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-wide">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-zinc-400 transition hover:bg-surface2 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

export function Bar({ percent, warn }: { percent: number; warn?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
      <motion.div className={`h-full rounded-full ${warn ? 'bg-amber-500' : 'bg-gradient-to-r from-accent-600 to-accent-400'}`}
        initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, percent))}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} />
    </div>
  )
}

export function Score({ value, big }: { value?: number; big?: boolean }) {
  if (!value) return null
  const c = value >= 8 ? 'bg-emerald-400' : value >= 7 ? 'bg-lime-400' : value >= 6 ? 'bg-amber-400' : 'bg-orange-400'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${c} font-bold text-black shadow ${big ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-xs'}`}>
      <Star size={big ? 16 : 12} fill="currentColor" />{value.toFixed(1)}
    </span>
  )
}

export function Chip({ children, to }: { children: ReactNode; to?: string }) {
  const cls = 'rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs font-medium text-accent-400 transition'
  return to ? <Link to={to} className={cls + ' hover:bg-accent-500/25'}>{children}</Link> : <span className={cls}>{children}</span>
}

export function Card({ item, index = 0, fluid }: { item: CatalogItem; index?: number; fluid?: boolean }) {
  const anime = item.kind === 'ANIME'
  const genres = (anime ? item.genres.map(genrePt) : item.genres).slice(0, 3)
  return (
    <motion.div className={`group ${fluid ? 'w-full' : 'w-40 shrink-0 sm:w-44'}`}
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '40px' }}
      transition={{ delay: Math.min(index % 12, 10) * 0.04, duration: 0.45 }} whileHover={{ y: -8 }}>
      <Link to={`/title/${item.source}/${item.type}/${item.id}`} className="block">
        <div className={`relative aspect-[2/3] overflow-hidden bg-surface2 shadow-lg ring-1 ring-white/5 transition duration-300 group-hover:shadow-2xl group-hover:shadow-accent-500/30 group-hover:ring-accent-500/60 ${anime ? 'rounded-2xl' : 'rounded-lg'}`}>
          {item.posterUrl
            ? <img src={item.posterUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
            : <div className="flex h-full items-center justify-center p-3 text-center text-xs text-zinc-500">{item.title}</div>}
          <div className="absolute left-2 top-2"><Score value={item.rating} /></div>
          <div className="absolute inset-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-3 opacity-0 transition duration-300 group-hover:opacity-100">
            <div className="flex flex-wrap gap-1">{genres.map((g) => <span key={g} className="rounded-full bg-accent-500/80 px-2 py-0.5 text-[10px] font-semibold text-white">{g}</span>)}</div>
            <p className="line-clamp-3 text-[11px] leading-snug text-zinc-200">{item.overview || 'Sem sinopse.'}</p>
          </div>
        </div>
        <div className="mt-2.5 truncate text-sm font-semibold transition group-hover:text-accent-400">{item.title}</div>
        <div className="truncate text-xs text-zinc-400">{item.year ?? '—'}{item.episodes ? ` · ${item.episodes} eps` : ''}{genres[0] ? ` · ${genres[0]}` : ''}</div>
      </Link>
    </motion.div>
  )
}

export function PosterSkeleton({ fluid }: { fluid?: boolean }) {
  return (
    <div className={fluid ? 'w-full' : 'w-40 shrink-0 sm:w-44'}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface2">
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      </div>
      <div className="mt-2.5 h-3 w-3/4 rounded bg-surface2" />
      <div className="mt-1.5 h-2.5 w-1/2 rounded bg-surface2" />
    </div>
  )
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 font-display text-2xl font-semibold tracking-wide">
      <span className="h-6 w-1 rounded-full bg-gradient-to-b from-accent-400 to-accent-700" />
      {icon}{children}
    </h2>
  )
}

export function Row({ title, items, error, loading, icon }: { title: string; items: CatalogItem[]; error?: string | null; loading?: boolean; icon?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <section className="group/row mb-10">
      <div className="flex items-end justify-between">
        <SectionTitle icon={icon}>{title}</SectionTitle>
        <div className="mb-4 hidden gap-1 opacity-0 transition group-hover/row:opacity-100 md:flex">
          <button onClick={() => scroll(-1)} className="rounded-full bg-surface2 p-1.5 hover:bg-accent-600"><ChevronLeft size={18} /></button>
          <button onClick={() => scroll(1)} className="rounded-full bg-surface2 p-1.5 hover:bg-accent-600"><ChevronRight size={18} /></button>
        </div>
      </div>
      {error ? <Notice text={error} />
        : loading ? <div className="no-scrollbar flex gap-4 overflow-hidden">{Array.from({ length: 8 }).map((_, i) => <PosterSkeleton key={i} />)}</div>
        : items.length === 0 ? <p className="text-sm text-zinc-500">Nenhum resultado.</p>
        : <div ref={ref} className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-3 pt-1">{items.map((i, n) => <Card key={i.ref} item={i} index={n} />)}</div>}
    </section>
  )
}

export function Notice({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />{text}
    </motion.div>
  )
}

export function Spinner() {
  return <div className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" />Carregando…</div>
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <motion.div className="mb-6" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="font-display text-4xl font-bold tracking-wide">{children}</h1>
      {sub && <p className="mt-1 text-sm text-zinc-400">{sub}</p>}
    </motion.div>
  )
}

export { AnimatePresence, motion }
