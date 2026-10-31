import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ExternalLink, Film, HardDrive, Play, Search, Trash2, X } from 'lucide-react'
import { api, fmtBytes, genrePt, progressOf, type CatalogItem, type LibraryFile } from '../api'
import ContinueRow from '../components/ContinueRow'
import { useToast } from '../components/Toast'
import { Bar, Chip, PageTitle, PosterSkeleton, Score, Spinner } from '../components/ui'
import { useAsync } from '../hooks'
import { useForceTheme } from '../theme'

type Group = { key: string; name: string; kind: string; files: LibraryFile[]; size: number; modified: number }
type Meta = CatalogItem | null | undefined

const SORTS: [string, string][] = [['recent', 'Recentes'], ['az', 'A–Z'], ['size', 'Tamanho'], ['score', 'Nota']]

function useMetas(groups: Group[]) {
  const [metas, setMetas] = useState<Record<string, Meta>>({})
  const sig = groups.map((g) => g.key).join('§')
  useEffect(() => {
    groups.forEach((g) => {
      if (g.key in metas) return
      api<CatalogItem | undefined>(`/catalog/match?title=${encodeURIComponent(g.name)}&kind=${g.kind}`)
        .then((m) => setMetas((p) => ({ ...p, [g.key]: m ?? null })))
        .catch(() => setMetas((p) => ({ ...p, [g.key]: null })))
    })
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  return metas
}

function LibraryCard({ g, meta, index, onOpen }: { g: Group; meta: Meta; index: number; onOpen: () => void }) {
  const anime = meta?.kind === 'ANIME' || g.kind === 'ANIME'
  const watched = g.files.filter((f) => progressOf(f.id).done).length
  const genres = (meta?.genres ?? []).map((x) => (anime ? genrePt(x) : x)).slice(0, 2)
  return (
    <motion.button onClick={onOpen} className="group w-full text-left" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.04 }} whileHover={{ y: -8 }} whileTap={{ scale: 0.97 }}>
      <div className={`relative aspect-[2/3] overflow-hidden bg-surface2 shadow-lg ring-1 ring-white/5 transition duration-300 group-hover:shadow-2xl group-hover:shadow-accent-500/30 group-hover:ring-accent-500/60 ${anime ? 'rounded-2xl' : 'rounded-lg'}`}>
        {meta?.posterUrl ? <img src={meta.posterUrl} alt={g.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
          : <div className="grid h-full place-items-center bg-gradient-to-br from-accent-700/40 to-surface2 p-4 text-center"><Film size={32} className="mb-2 text-accent-400" />{meta === undefined ? '' : g.name}</div>}
        <div className="absolute left-2 top-2"><Score value={meta?.rating} /></div>
        <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold backdrop-blur">{g.files.length} {g.files.length > 1 ? 'eps' : 'arquivo'}</span>
        <div className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition group-hover:opacity-100">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-600 shadow-xl"><Play size={24} fill="white" /></span>
        </div>
        {watched > 0 && <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-black"><CheckCircle2 size={12} />{watched}/{g.files.length}</span>}
      </div>
      <div className="mt-2.5 truncate text-sm font-semibold transition group-hover:text-accent-400">{meta?.title ?? g.name}</div>
      <div className="truncate text-xs text-zinc-400">{[meta?.year, ...genres, fmtBytes(g.size)].filter(Boolean).join(' · ')}</div>
    </motion.button>
  )
}

function Detail({ g, meta, onClose, onChanged }: { g: Group; meta: Meta; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const anime = meta?.kind === 'ANIME' || g.kind === 'ANIME'
  const seasons = useMemo(() => {
    const m = new Map<string, LibraryFile[]>()
    g.files.forEach((f) => { const k = f.season != null ? `Temporada ${f.season}` : 'Arquivos'; m.set(k, [...(m.get(k) ?? []), f]) })
    return [...m.entries()]
  }, [g])
  const remove = async (ids: string[], what: string) => {
    if (!confirm(`Apagar ${what} do disco? Esta ação não pode ser desfeita.`)) return
    try { await api('/library/delete', { method: 'POST', json: { ids } }); toast('Arquivo(s) apagado(s)'); onChanged(); if (ids.length === g.files.length) onClose() }
    catch (e) { toast((e as Error).message, 'err') }
  }
  const genres = (meta?.genres ?? []).map((x) => (anime ? genrePt(x) : x))
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside className="h-full w-full max-w-2xl overflow-y-auto bg-canvas shadow-2xl ring-1 ring-line" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }} onClick={(e) => e.stopPropagation()}>
        <div className="relative h-60">
          {(meta?.backdropUrl || meta?.posterUrl) && <img src={meta.backdropUrl ?? meta.posterUrl} alt="" className="h-full w-full object-cover opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-t from-canvas to-transparent" />
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/60 p-2 backdrop-blur transition hover:bg-accent-600"><X size={18} /></button>
          <div className="absolute bottom-4 left-6 right-6">
            <h2 className="font-display text-4xl font-bold tracking-wide">{meta?.title ?? g.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2"><Score value={meta?.rating} big />{genres.slice(0, 4).map((x) => <Chip key={x}>{x}</Chip>)}</div>
          </div>
        </div>
        <div className="px-6 pb-10">
          {meta?.overview && <p className="mb-5 line-clamp-4 text-sm leading-relaxed text-zinc-300">{meta.overview}</p>}
          <div className="mb-6 flex flex-wrap gap-3">
            {meta && <Link to={`/title/${meta.source}/${meta.type}/${meta.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent-500/60"><ExternalLink size={14} />Página do título</Link>}
            <button onClick={() => remove(g.files.map((f) => f.id), `todos os ${g.files.length} arquivo(s)`)} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-zinc-400 hover:border-red-500/60 hover:text-red-400"><Trash2 size={14} />Apagar tudo</button>
            <span className="ml-auto self-center text-xs text-zinc-500">{g.files.length} arquivo(s) · {fmtBytes(g.size)}</span>
          </div>
          {seasons.map(([label, fs]) => (
            <div key={label} className="mb-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent-400">{label}</h3>
              <ul className="space-y-1.5">
                {fs.map((f, n) => {
                  const p = progressOf(f.id)
                  return (
                    <motion.li key={f.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.03 }}
                      className="glass group flex items-center gap-3 rounded-xl p-2.5">
                      <Link to={`/watch/${f.id}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-600 shadow-lg transition group-hover:scale-110"><Play size={18} fill="white" /></Link>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{f.episode != null ? `Episódio ${f.episode}` : f.name}{p.done && <CheckCircle2 size={14} className="ml-2 inline text-emerald-400" />}</div>
                        <div className="truncate text-xs text-zinc-500">{f.name} · {fmtBytes(f.sizeBytes)}</div>
                        {p.ratio > 0 && !p.done && <div className="mt-1.5"><Bar percent={p.ratio * 100} /></div>}
                      </div>
                      <button title="Apagar arquivo" onClick={() => remove([f.id], `"${f.name}"`)} className="p-1.5 text-zinc-500 opacity-0 transition hover:text-red-400 group-hover:opacity-100"><Trash2 size={16} /></button>
                    </motion.li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </motion.aside>
    </motion.div>
  )
}

export default function Library({ scope }: { scope: 'cinema' | 'anime' }) {
  useForceTheme(scope)
  const { data, loading, reload } = useAsync(() => api<LibraryFile[]>('/library'), [])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recent')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>()
    ;(data ?? []).forEach((f) => {
      const key = `${f.kind}|${f.group}`
      const g = m.get(key) ?? { key, name: f.group, kind: f.kind, files: [], size: 0, modified: 0 }
      g.files.push(f); g.size += f.sizeBytes; g.modified = Math.max(g.modified, Date.parse(f.modified) || 0)
      m.set(key, g)
    })
    return [...m.values()]
  }, [data])
  const metas = useMetas(groups)

  const visible = groups.filter((g) => {
    const meta = metas[g.key]
    const eff = g.kind === 'GENERAL' ? (meta?.kind ?? 'GENERAL') : g.kind
    const inScope = scope === 'anime' ? eff === 'ANIME' || eff === 'GENERAL' : eff === 'MOVIE' || eff === 'SERIES' || eff === 'GENERAL'
    return inScope && (!q || (g.name + ' ' + (meta?.title ?? '')).toLowerCase().includes(q.toLowerCase()))
  }).sort((a, b) => sort === 'az' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size
    : sort === 'score' ? (metas[b.key]?.rating ?? 0) - (metas[a.key]?.rating ?? 0) : b.modified - a.modified)

  const total = visible.reduce((s, g) => s + g.size, 0)
  const open = groups.find((g) => g.key === openKey)
  const scopeFiles = visible.flatMap((g) => g.files)

  return (
    <div>
      <PageTitle sub={loading ? undefined : `${visible.length} título(s) · ${scopeFiles.length} arquivo(s) · ${fmtBytes(total)}`}>
        {scope === 'anime' ? 'Biblioteca de animes' : 'Minha biblioteca'}
      </PageTitle>
      <ContinueRow files={scopeFiles} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por nome…"
            className="w-full rounded-full border border-line bg-surface/70 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
        </div>
        <div className="flex rounded-full border border-line bg-surface/70 p-1">
          {SORTS.map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)} className="relative rounded-full px-3.5 py-1.5 text-xs font-semibold">
              {sort === k && <motion.span layoutId="lib-sort" className="absolute inset-0 rounded-full bg-accent-600" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
              <span className={`relative ${sort === k ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
      {loading ? <Spinner /> : visible.length === 0 ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass mx-auto mt-10 max-w-md rounded-3xl p-10 text-center">
          <HardDrive size={44} className="mx-auto mb-4 text-accent-400" />
          <h3 className="font-display text-2xl font-semibold">Sua biblioteca está vazia</h3>
          <p className="mt-2 text-sm text-zinc-400">Baixe algo pelo catálogo e ele aparece aqui, com capa, nota e progresso de cada episódio.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((g, i) => <LibraryCard key={g.key} g={g} meta={metas[g.key]} index={i} onOpen={() => setOpenKey(g.key)} />)}
          {groups.length > 0 && Object.keys(metas).length < groups.length && <PosterSkeleton fluid />}
        </div>
      )}
      <AnimatePresence>{open && <Detail key={open.key} g={open} meta={metas[open.key]} onClose={() => setOpenKey(null)} onChanged={reload} />}</AnimatePresence>
    </div>
  )
}
