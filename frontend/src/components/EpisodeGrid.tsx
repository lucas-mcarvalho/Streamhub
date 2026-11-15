import { memo, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CheckCircle2, Circle, Play, Search } from 'lucide-react'
import { progressOf, type GuideEpisode, type LibraryFile } from '../api'
import { saveProgress } from '../lib/progress'
import { byQuality, carryProgress, preferredVersion, versionLabel } from '../lib/versions'
import { Bar } from './ui'

/** Episódio do guia (nome, capa) correspondente a um arquivo da biblioteca. */
export const guideOf = (guide: GuideEpisode[] | undefined, f?: LibraryFile) => (f?.episode == null ? undefined
  : guide?.find((e) => (f.season != null ? e.season === f.season && e.number === f.episode : e.absolute === f.episode)))

type Props = {
  /** Arquivos de um único título. */
  files: LibraryFile[]
  guide?: GuideEpisode[]
  guideLoading?: boolean
  /** Episódio em reprodução (na página do player): fica destacado e a grade abre na temporada dele. */
  currentId?: string
  /** Chamado ao escolher um episódio, antes de navegar. */
  onPick?: () => void
  /** Chamado quando um episódio é marcado ou desmarcado como assistido. */
  onChange?: () => void
  /** Muda quando o progresso salvo mudou por fora (sincronização), para a grade se redesenhar. */
  version?: number
}

/** Grade de episódios com capa, busca, temporada e estado de assistido. */
function EpisodeGrid({ files, guide, guideLoading, currentId, onPick, onChange }: Props) {
  const [q, setQ] = useState('')
  const [desc, setDesc] = useState(false)
  const [season, setSeason] = useState<string>()
  const [, setTick] = useState(0)

  const items = useMemo(() => {
    // o mesmo episódio em mais de um arquivo (qualidades diferentes) vira um cartão só, com a escolha da qualidade
    const byEpisode = new Map<string, LibraryFile[]>()
    files.forEach((x) => {
      const k = x.episode == null ? x.id : `${x.season ?? ''}|${x.episode}`
      byEpisode.set(k, [...(byEpisode.get(k) ?? []), x])
    })
    return [...byEpisode.values()]
      .map((group) => {
        const versions = [...group].sort(byQuality)
        const f = versions[0]
        const ep = guideOf(guide, f)
        const s = f.season ?? ep?.season
        return { f, versions, ep, season: s != null ? `Temporada ${s}` : f.episode != null ? 'Episódios' : 'Arquivos' }
      })
      // extras sem número (aberturas, encerramentos) ficam por último
      .sort((a, b) => Number(a.f.episode == null) - Number(b.f.episode == null) || (a.f.season ?? 0) - (b.f.season ?? 0)
        || (a.f.episode ?? 0) - (b.f.episode ?? 0) || a.f.name.localeCompare(b.f.name))
  }, [files, guide])

  const seasons = [...new Set(items.map((i) => i.season))]
  const current = season && seasons.includes(season) ? season : items.find((i) => i.versions.some((v) => v.id === currentId))?.season ?? seasons[0]
  const shown = items
    .filter((i) => i.season === current || (q && seasons.length > 1))
    .filter((i) => !q || String(i.f.episode ?? '').startsWith(q.trim()) || (i.ep?.name ?? i.f.name).toLowerCase().includes(q.trim().toLowerCase()))
  if (desc) shown.reverse()

  const toggleWatched = (id: string) => {
    saveProgress(id, progressOf(id).done ? { done: false } : { done: true, pos: 0 })
    setTick((t) => t + 1)
    onChange?.()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {seasons.length > 1 && (
          <select value={current} onChange={(e) => setSeason(e.target.value)} aria-label="Temporada"
            className="rounded-full border border-line bg-surface/70 px-4 py-2 text-sm font-semibold outline-none focus:border-accent-500">
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <div className="relative min-w-[200px] flex-1 md:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número ou nome do episódio…"
            className="w-full rounded-full border border-line bg-surface/70 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
        </div>
        <button onClick={() => setDesc((d) => !d)} className="ml-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-2 text-sm hover:border-accent-500/60">
          {desc ? <ArrowDownWideNarrow size={16} /> : <ArrowUpNarrowWide size={16} />}{desc ? 'Mais recentes' : 'Mais antigos'}
        </button>
      </div>

      {guideLoading && <p className="mb-3 text-xs text-zinc-500">Carregando capas dos episódios…</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map(({ f: best, versions, ep }, n) => {
          // versão do cartão: a que está tocando; senão a que o usuário vinha assistindo; senão a de melhor qualidade
          const f = versions.find((v) => v.id === currentId) ?? preferredVersion(versions)
          const p = progressOf(f.id)
          const playing = f.id === currentId
          return (
            <motion.div key={best.id} className="group" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n, 15) * 0.02 }}>
              <Link to={`/watch/${f.id}`} onClick={onPick} aria-current={playing ? 'true' : undefined}
                className={`relative block aspect-video overflow-hidden rounded-xl bg-surface2 transition group-hover:ring-accent-500/70 ${playing ? 'ring-2 ring-accent-500' : p.done ? 'ring-1 ring-emerald-500/50' : 'ring-1 ring-white/5'}`}>
                {ep?.stillUrl ? <img src={ep.stillUrl} alt="" loading="lazy" className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${p.done && !playing ? 'opacity-50' : ''}`} />
                  : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-accent-700/30 to-surface2 font-display text-3xl font-bold text-white/60">{f.episode ?? '?'}</div>}
                {f.episode != null && <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-0.5 text-xs font-bold tabular-nums backdrop-blur">EP {f.episode}</span>}
                {playing ? <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-accent-600 px-2 py-0.5 text-[11px] font-bold text-white"><Play size={10} fill="white" />Assistindo</span>
                  : p.done && <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-black"><CheckCircle2 size={12} />Assistido</span>}
                {!playing && (
                  <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-600 shadow-lg"><Play size={18} fill="white" className="ml-0.5" /></span>
                  </span>
                )}
                {f.quality && <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur">{f.quality}</span>}
                {p.ratio > 0 && !p.done && <div className="absolute inset-x-0 bottom-0"><Bar percent={p.ratio * 100} /></div>}
              </Link>
              <div className="mt-2 flex items-start gap-2">
                <Link to={`/watch/${f.id}`} onClick={onPick} className={`line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug group-hover:text-accent-400 ${playing ? 'text-accent-400' : ''}`}>
                  {ep?.name ?? (f.episode != null ? `Episódio ${f.episode}` : f.name)}
                </Link>
                <button onClick={() => toggleWatched(f.id)} title={p.done ? 'Marcar como não assistido' : 'Marcar como assistido'}
                  className={`shrink-0 p-0.5 transition ${p.done ? 'text-emerald-400' : 'text-zinc-500 hover:text-white'}`}>
                  {p.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
              </div>
              {versions.length > 1 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Qualidade">
                  {versions.map((v) => (
                    <Link key={v.id} to={`/watch/${v.id}`} replace={playing} onClick={() => { onPick?.(); carryProgress(f, v) }}
                      title={v.id === f.id ? `Qualidade selecionada: ${versionLabel(v, versions, true)}` : `Assistir em ${versionLabel(v, versions, true)}`}
                      aria-current={v.id === f.id ? 'true' : undefined}
                      className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold transition ${v.id === f.id ? 'border-accent-500 bg-accent-600/20 text-accent-400' : 'border-line text-zinc-400 hover:border-accent-500/60 hover:text-white'}`}>
                      {versionLabel(v, versions)}
                    </Link>
                  ))}
                </div>
              )}
              {p.ratio > 0 && !p.done && !playing && <div className="text-[11px] text-zinc-500">Parou em {Math.round(p.ratio * 100)}%</div>}
            </motion.div>
          )
        })}
      </div>
      {shown.length === 0 && <p className="mt-6 text-center text-sm text-zinc-500">Nenhum episódio corresponde à busca.</p>}
    </div>
  )
}

export default memo(EpisodeGrid)
