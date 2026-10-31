import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { formatPt, genrePt, type CatalogItem } from '../api'
import { btn, Chip, Score } from './ui'

/** Carrossel de destaques com troca automática. */
export default function Hero({ items }: { items: CatalogItem[] }) {
  const list = items.filter((x) => x.backdropUrl).slice(0, 6)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || list.length < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 7000)
    return () => clearInterval(t)
  }, [paused, list.length])
  const it = list[i]
  if (!it) return null
  const anime = it.kind === 'ANIME'
  return (
    <div className="relative mb-10 h-[440px] overflow-hidden rounded-3xl shadow-2xl shadow-black/50 md:h-[520px]"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <AnimatePresence>
        <motion.img key={it.ref + 'img'} src={it.backdropUrl} alt="" className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.15 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.3, ease: 'easeOut' }} />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-canvas/90 via-canvas/30 to-transparent" />
      <AnimatePresence mode="wait">
        <motion.div key={it.ref} className="absolute bottom-10 left-6 max-w-2xl md:left-10"
          initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.5 }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Score value={it.rating} big />
            {it.year && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">{it.year}</span>}
            {formatPt(it.format) && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">{formatPt(it.format)}</span>}
            {it.episodes ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">{it.episodes} episódios</span> : null}
          </div>
          <h2 className="font-display text-4xl font-bold leading-tight tracking-wide drop-shadow-lg md:text-6xl">{it.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2">{(anime ? it.genres.map(genrePt) : it.genres).slice(0, 4).map((g) => <Chip key={g}>{g}</Chip>)}</div>
          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-zinc-200 md:text-base">{it.overview || 'Sem sinopse disponível.'}</p>
          <div className="mt-5 flex gap-3">
            <Link to={`/title/${it.source}/${it.type}/${it.id}`} className={btn + ' px-6 py-2.5'}><Info size={18} />Ver detalhes</Link>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="absolute bottom-5 right-6 flex gap-2">
        {list.map((_, n) => (
          <button key={n} onClick={() => setI(n)} aria-label={`Destaque ${n + 1}`}
            className={`h-1.5 rounded-full transition-all duration-500 ${n === i ? 'w-8 bg-accent-500' : 'w-3 bg-white/30 hover:bg-white/60'}`} />
        ))}
      </div>
    </div>
  )
}
