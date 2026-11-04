import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Info, Play, Star } from 'lucide-react'
import { formatPt, genrePt, type CatalogItem } from '../api'

/** Destaque em tela cheia no topo da tela inicial (estilo dos serviços de streaming). */
export default function Billboard({ items, children }: { items: CatalogItem[]; children?: React.ReactNode }) {
  const list = items.filter((x) => x.backdropUrl).slice(0, 8)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => { setI(0) }, [items])
  useEffect(() => {
    if (paused || list.length < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 9000)
    return () => clearInterval(t)
  }, [paused, list.length])
  const it = list[i % Math.max(1, list.length)]
  if (!it) return <section className="relative h-[46vh] min-h-[320px]">{children}</section>
  const anime = it.kind === 'ANIME'
  const to = `/title/${it.source}/${it.type}/${it.id}`
  const meta = [
    it.year ? String(it.year) : null,
    formatPt(it.format) || (it.kind === 'MOVIE' ? 'Filme' : it.kind === 'SERIES' ? 'Série' : null),
    it.episodes ? `${it.episodes} episódios` : it.seasons ? `${it.seasons} temporada${it.seasons > 1 ? 's' : ''}` : null,
  ].filter(Boolean)
  return (
    <section className="relative h-[82vh] min-h-[520px] w-full overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <AnimatePresence>
        <motion.img key={it.ref + 'bg'} src={it.backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-canvas via-canvas/70 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      {children}
      <AnimatePresence mode="wait">
        <motion.div key={it.ref} className="absolute bottom-28 left-0 max-w-2xl px-4 md:bottom-36 md:px-12"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.5 }}>
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-[0.3em] text-accent-500">{anime ? 'Anime' : it.kind === 'MOVIE' ? 'Filme' : 'Série'}</span>
          <h2 className="font-display text-5xl leading-[0.95] tracking-wide drop-shadow-lg md:text-7xl">{it.title}</h2>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-zinc-200">
            {it.rating ? <span className="inline-flex items-center gap-1 text-emerald-400"><Star size={14} fill="currentColor" />{it.rating.toFixed(1)}</span> : null}
            {meta.map((m) => <span key={m}>{m}</span>)}
            {(anime ? it.genres.map(genrePt) : it.genres).slice(0, 3).map((g, n) => <span key={g} className="text-zinc-400">{n === 0 ? '' : '• '}{g}</span>)}
          </div>
          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-zinc-200 drop-shadow md:text-base">{it.overview || 'Sem sinopse disponível.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={to} className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-base font-bold text-black transition hover:bg-white/80 active:scale-95">
              <Play size={22} fill="currentColor" />Assistir
            </Link>
            <Link to={to} className="inline-flex items-center gap-2 rounded-md bg-zinc-500/50 px-6 py-2.5 text-base font-bold text-white backdrop-blur transition hover:bg-zinc-500/35 active:scale-95">
              <Info size={22} />Mais informações
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>
      {list.length > 1 && (
        <div className="absolute bottom-16 right-4 flex gap-1.5 md:bottom-24 md:right-12">
          {list.map((_, n) => (
            <button key={n} onClick={() => setI(n)} aria-label={`Destaque ${n + 1}`}
              className={`h-1 rounded-full transition-all duration-500 ${n === i ? 'w-7 bg-white' : 'w-3 bg-white/35 hover:bg-white/70'}`} />
          ))}
        </div>
      )}
    </section>
  )
}
