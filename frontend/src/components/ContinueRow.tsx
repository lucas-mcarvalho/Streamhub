import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { authHeaders, progressOf, type LibraryFile } from '../api'
import { useProgressSync } from '../lib/progress'
import { episodeTag, fmtTime, resumeOf, type Resume } from '../lib/resume'
import { Bar, SectionTitle } from './ui'

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

/** "Continuar assistindo": um cartão por título, no episódio que ficou pela metade ou no seguinte ao último visto. */
export default function ContinueRow({ files }: { files: LibraryFile[] }) {
  useProgressSync()
  const titles = new Map<string, LibraryFile[]>()
  files.forEach((f) => { const k = `${f.kind}|${f.group}`; titles.set(k, [...(titles.get(k) ?? []), f]) })
  const items = [...titles.values()].map(resumeOf)
    .filter((r): r is Resume => !!r && (r.mode === 'next' || (r.mode === 'continue' && r.pos > 5)))
    .sort((a, b) => b.last - a.last).slice(0, 8)
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <SectionTitle icon={<Play size={20} className="text-accent-400" />}>Continuar assistindo</SectionTitle>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {items.map(({ file: f, mode, pos }, n) => {
          const p = progressOf(f.id)
          const tag = episodeTag(f)
          return (
            <motion.div key={f.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.06 }} whileHover={{ y: -4 }}>
              <Link to={`/watch/${f.id}`} className="glass group block w-72 shrink-0 overflow-hidden rounded-2xl">
                <div className="relative aspect-video overflow-hidden bg-surface2">
                  {/* no próximo episódio não há ponto de parada: usa um quadro depois da abertura */}
                  <Frame id={f.id} pos={mode === 'next' ? 300 : pos} />
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 backdrop-blur transition group-hover:scale-110 group-hover:bg-accent-600 group-focus:bg-accent-600"><Play size={22} fill="white" /></span>
                  </span>
                  {mode === 'next'
                    ? <span className="absolute left-2 top-2 rounded-md bg-accent-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Próximo episódio</span>
                    : <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">{fmtTime(pos)}{p.dur > 0 ? ` / ${fmtTime(p.dur)}` : ''}</span>}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-semibold">{f.group}</div>
                  <div className="mb-2 truncate text-xs text-zinc-400">{tag || f.name}{f.quality ? ` · ${f.quality}` : ''}</div>
                  <Bar percent={mode === 'next' ? 0 : p.ratio * 100} />
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
