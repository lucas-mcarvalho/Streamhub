import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Play, Star } from 'lucide-react'
import { formatPt, type CatalogItem } from '../api'

/** Banner de destaque em tela cheia (modo Anime). */
export default function AnimeHero({ items }: { items: CatalogItem[] }) {
  const list = items.filter((x) => x.backdropUrl || x.posterUrl).slice(0, 10)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || list.length < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 8000)
    return () => clearInterval(t)
  }, [paused, list.length])
  const it = list[i]
  if (!it) return null
  const go = (d: number) => setI((v) => (v + d + list.length) % list.length)
  return (
    <section className="relative h-[80vh] min-h-[540px] w-full overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <AnimatePresence>
        <motion.img key={it.ref + 'bg'} src={it.backdropUrl ?? it.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/25 to-black/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-canvas/85 via-canvas/20 to-transparent" />
      <AnimatePresence mode="wait">
        <motion.div key={it.ref} className="absolute bottom-24 left-0 max-w-3xl px-5 md:bottom-28 md:px-10"
          initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.5 }}>
          <h2 className="text-4xl font-extrabold leading-[1.05] tracking-tight drop-shadow-lg md:text-6xl">{it.title}</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {it.rating ? <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/55 px-3 py-1.5 text-sm font-bold backdrop-blur"><Star size={14} className="fill-amber-400 text-amber-400" />{it.rating.toFixed(1)}</span> : null}
            {it.year ? <span className="rounded-xl border border-white/10 bg-black/55 px-3 py-1.5 text-sm font-semibold backdrop-blur">{it.year}</span> : null}
            {formatPt(it.format) ? <span className="rounded-xl border border-white/10 bg-black/55 px-3 py-1.5 text-sm font-semibold backdrop-blur">{formatPt(it.format)}</span> : null}
            {it.episodes ? <span className="rounded-xl border border-white/10 bg-black/55 px-3 py-1.5 text-sm font-semibold backdrop-blur">{it.episodes} eps</span> : null}
          </div>
          <p className="mt-4 line-clamp-2 max-w-xl text-sm leading-relaxed text-zinc-200 md:text-base">{it.overview || 'Sem sinopse disponível.'}</p>
          <Link to={`/title/${it.source}/${it.type}/${it.id}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-accent-500/30 transition hover:bg-accent-400 active:scale-95">
            <Play size={18} fill="currentColor" />Ver detalhes
          </Link>
        </motion.div>
      </AnimatePresence>
      {list.length > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Anterior" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/50 backdrop-blur transition hover:bg-accent-500 hover:text-white md:grid"><ChevronLeft size={20} /></button>
          <button onClick={() => go(1)} aria-label="Próximo" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/50 backdrop-blur transition hover:bg-accent-500 hover:text-white md:grid"><ChevronRight size={20} /></button>
          <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 gap-1.5 md:bottom-20">
            {list.map((_, n) => (
              <button key={n} onClick={() => setI(n)} aria-label={`Destaque ${n + 1}`}
                className={`h-1.5 rounded-full transition-all duration-500 ${n === i ? 'w-8 bg-accent-500' : 'w-1.5 bg-white/35 hover:bg-white/70'}`} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
