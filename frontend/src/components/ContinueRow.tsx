import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { authHeaders, progressOf, type LibraryFile } from '../api'
import { Bar, SectionTitle } from './ui'

const fmt = (t: number) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60)
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0')
}

/** Quadro do vídeo no ponto em que o usuário parou (gerado pelo servidor; precisa de login, então vem como blob). */
function Frame({ id, pos }: { id: string; pos: number }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let url: string | undefined
    let dead = false
    fetch(`/api/library/${id}/thumb?t=${Math.floor(pos)}&w=480`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { if (!dead) { url = URL.createObjectURL(b); setSrc(url) } })
      .catch(() => {})
    return () => { dead = true; if (url) URL.revokeObjectURL(url) }
  }, [id, Math.round(pos / 5)]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {src
        ? <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={src} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0 bg-gradient-to-br from-accent-700/60 to-surface2" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
    </>
  )
}

/** "Continuar assistindo" com base no progresso salvo pelo player neste navegador. */
export default function ContinueRow({ files }: { files: LibraryFile[] }) {
  const items = files.map((f) => ({ f, p: progressOf(f.id) }))
    .filter((x) => x.p.pos > 5 && !x.p.done).sort((a, b) => b.p.last - a.p.last).slice(0, 8)
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <SectionTitle icon={<Play size={20} className="text-accent-400" />}>Continuar assistindo</SectionTitle>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {items.map(({ f, p }, n) => (
          <motion.div key={f.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.06 }} whileHover={{ y: -4 }}>
            <Link to={`/watch/${f.id}`} className="glass group block w-72 shrink-0 overflow-hidden rounded-2xl">
              <div className="relative aspect-video overflow-hidden bg-surface2">
                <Frame id={f.id} pos={p.pos} />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 backdrop-blur transition group-hover:scale-110 group-hover:bg-accent-600"><Play size={22} fill="white" /></span>
                </span>
                <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                  {fmt(p.pos)}{p.dur > 0 ? ` / ${fmt(p.dur)}` : ''}
                </span>
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-semibold">{f.group}</div>
                <div className="mb-2 truncate text-xs text-zinc-400">{f.season != null ? `T${f.season} E${f.episode}` : f.name}</div>
                <Bar percent={p.ratio * 100} />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
